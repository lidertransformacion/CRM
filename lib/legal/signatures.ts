import { can } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/auth/users";
import type { Actor } from "@/lib/legal/access";
import { recordAudit } from "@/lib/legal/audit";
import { getContract, type ContractRow, type SignerRole } from "@/lib/legal/contracts";
import type { FileRow } from "@/lib/legal/drive";
import { appendCertificate, stampSignature, type CertificateStep } from "@/lib/legal/sign-pdf";
import { legalFilesBucket, sha256Hex, sha256Text } from "@/lib/legal/storage";
import { enqueueEmail } from "@/lib/mail/outbox";
import { releaseBytes, reserveBytes } from "@/lib/storage/quota";
import type { SqlDb } from "@/lib/sql/types";

export type SignatureRequestRow = {
  id: number;
  public_id: string;
  contract_id: number;
  source_file_id: number;
  source_sha256: string;
  status: string;
  current_step: number;
  final_file_id: number | null;
  final_sha256: string | null;
  rejected_reason: string | null;
  created_by: number;
  created_at: string;
  completed_at: string | null;
};

export type SignatureStepRow = {
  id: number;
  request_id: number;
  step_order: number;
  role: SignerRole | string;
  signer_user_id: number | null;
  signer_email: string;
  signer_name: string | null;
  status: string;
  otp_hash: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  input_sha256: string | null;
  output_sha256: string | null;
  signature_image_key: string | null;
  signed_at: string | null;
  consent_at: string | null;
  ip: string | null;
  user_agent: string | null;
  comment: string | null;
  token_hash: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  comercial: "Comercial",
  legal: "Legal",
  gerencia: "Gerencia",
  externo: "Cliente",
};

const OTP_MINUTES = 10;
const OTP_ATTEMPTS = 5;

let otpOverride: (() => string) | null = null;

/** Tests pin the code. Production draws a 6-digit value. */
export function setOtpForTests(code: string | null) {
  otpOverride = code == null ? null : () => code;
}

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

function randomOtp(): string {
  if (otpOverride) return otpOverride();
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, "0");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pngBytes(dataUrl: string | null | undefined): Uint8Array | null {
  if (!dataUrl) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) throw new HttpError(400, "La firma dibujada debe ser una imagen PNG.");
  const binary = atob(match[1].replace(/\s/g, ""));
  if (binary.length > 500_000) throw new HttpError(400, "La firma dibujada es demasiado pesada.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function notify(
  db: SqlDb,
  input: { userId: number | null; email: string; subject: string; body: string; link: string; kind: string; senderUserId: number | null; dedupeKey: string },
) {
  const queued = await enqueueEmail(db, {
    to: input.email,
    subject: input.subject,
    body: input.body,
    dedupeKey: input.dedupeKey,
    resend: true,
    senderUserId: input.senderUserId,
  });
  if (input.userId) {
    await db.run(
      `INSERT INTO notifications (user_id, kind, title, link, outbox_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.userId, input.kind, input.subject, input.link, queued.id, new Date().toISOString()],
    );
  }
}

async function stepsOf(db: SqlDb, requestId: number): Promise<SignatureStepRow[]> {
  return db.all<SignatureStepRow>("SELECT * FROM signature_steps WHERE request_id = ? ORDER BY step_order", [requestId]);
}

async function requestById(db: SqlDb, id: number): Promise<SignatureRequestRow | undefined> {
  return db.get<SignatureRequestRow>("SELECT * FROM signature_requests WHERE id = ?", [id]);
}

async function openRequest(db: SqlDb, contractId: number): Promise<SignatureRequestRow | undefined> {
  return db.get<SignatureRequestRow>(
    "SELECT * FROM signature_requests WHERE contract_id = ? AND status IN ('pending', 'in_progress') ORDER BY id DESC LIMIT 1",
    [contractId],
  );
}

function canSend(actor: Actor, contract: ContractRow): boolean {
  if (!can(actor.role, "upload_contract")) return false;
  if (actor.role === "admin" || actor.role === "legal") return true;
  return actor.role === "comercial" && contract.owner_id === actor.uid;
}

function isCurrentSigner(step: SignatureStepRow, actor: { uid: number | null; email: string }): boolean {
  if (step.signer_user_id != null && actor.uid != null && step.signer_user_id === actor.uid) return true;
  return step.signer_email.trim().toLowerCase() === actor.email.trim().toLowerCase();
}

async function defaultSigners(db: SqlDb, owner: { id: number; email: string }) {
  const legal = await db.get<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE role = 'legal' AND COALESCE(active, 1) = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1",
  );
  const gerencia = await db.get<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE role = 'gerencia' AND COALESCE(active, 1) = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1",
  );
  const rows: { role: SignerRole; signer_user_id: number | null; signer_email: string; signer_name: string | null }[] = [
    { role: "comercial", signer_user_id: owner.id, signer_email: owner.email, signer_name: null },
  ];
  if (legal) rows.push({ role: "legal", signer_user_id: legal.id, signer_email: legal.email, signer_name: null });
  if (gerencia) rows.push({ role: "gerencia", signer_user_id: gerencia.id, signer_email: gerencia.email, signer_name: null });
  return rows;
}

async function fileBytes(file: FileRow): Promise<Uint8Array> {
  const bucket = await legalFilesBucket();
  if (!bucket) throw new HttpError(500, "Falta el depósito de contratos.");
  const object = await bucket.get(file.r2_key);
  if (!object) throw new HttpError(404, "El PDF no está en el almacén.");
  return new Uint8Array(await object.arrayBuffer());
}

async function persistPdf(
  db: SqlDb,
  input: { name: string; bytes: Uint8Array; kind: "contract_signed" | "certificate"; folderId: number | null; createdBy: number; actorEmail: string; ip: string | null; userAgent: string | null },
): Promise<FileRow> {
  const bucket = await legalFilesBucket();
  if (!bucket) throw new HttpError(500, "Falta el depósito de contratos.");
  const sha = await sha256Hex(input.bytes);
  const key = `files/${crypto.randomUUID()}`;
  const size = input.bytes.byteLength;
  await reserveBytes(db, size);
  try {
    await bucket.put(key, input.bytes, { httpMetadata: { contentType: "application/pdf" } });
  } catch (error) {
    await releaseBytes(db, size);
    throw error;
  }
  const now = new Date().toISOString();
  try {
    const result = await db.run(
      `INSERT INTO files (folder_id, name, r2_key, mime, size_bytes, sha256, kind, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?)`,
      [input.folderId, input.name, key, size, sha, input.kind, input.createdBy, now, now],
    );
    await recordAudit(db, {
      entityType: "file",
      entityId: result.lastInsertRowid,
      action: "file.signature",
      actorUserId: input.createdBy,
      actorEmail: input.actorEmail,
      ip: input.ip,
      userAgent: input.userAgent,
      data: { sha256: sha, size_bytes: size, kind: input.kind },
    });
    const row = await db.get<FileRow>("SELECT * FROM files WHERE id = ?", [result.lastInsertRowid]);
    if (!row) throw new HttpError(500, "No se pudo leer el PDF firmado.");
    return row;
  } catch (error) {
    try {
      await bucket.delete(key);
    } catch {
      // The reservation is released below even if the object is already gone.
    }
    await releaseBytes(db, size);
    throw error;
  }
}

export async function sendForSignature(db: SqlDb, actor: Actor, contractId: number, origin: string): Promise<{ requestId: number; publicId: string }> {
  const contract = await getContract(db, contractId);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  if (!canSend(actor, contract)) throw new HttpError(403, "No puedes enviar este contrato a firma.");
  if (!contract.current_file_id) throw new HttpError(400, "El contrato no tiene PDF.");
  if (await openRequest(db, contractId)) throw new HttpError(409, "Ya hay una firma en curso.");
  const file = await db.get<FileRow>("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL", [contract.current_file_id]);
  if (!file) throw new HttpError(400, "El PDF del contrato ya no está.");
  let signers = await db.all<{ role: string; signer_user_id: number | null; signer_email: string; signer_name: string | null }>(
    "SELECT role, signer_user_id, signer_email, signer_name FROM contract_signers WHERE contract_id = ? ORDER BY step_order",
    [contractId],
  );
  const owner = await db.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", [contract.owner_id]);
  if (!signers.length) {
    if (!owner) throw new HttpError(400, "El contrato no tiene un responsable.");
    signers = await defaultSigners(db, owner);
    const now = new Date().toISOString();
    for (let index = 0; index < signers.length; index += 1) {
      const signer = signers[index];
      await db.run(
        `INSERT INTO contract_signers (contract_id, step_order, role, signer_user_id, signer_email, signer_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [contractId, index + 1, signer.role, signer.signer_user_id, signer.signer_email, signer.signer_name, now],
      );
    }
  }
  const now = new Date().toISOString();
  const publicId = crypto.randomUUID();
  const inserted = await db.run(
    `INSERT INTO signature_requests (public_id, contract_id, source_file_id, source_sha256, status, current_step, created_by, created_at)
     VALUES (?, ?, ?, ?, 'in_progress', 1, ?, ?)`,
    [publicId, contractId, file.id, file.sha256, actor.uid, now],
  );
  const requestId = inserted.lastInsertRowid;
  let firstToken: string | null = null;
  for (let index = 0; index < signers.length; index += 1) {
    const signer = signers[index];
    const token = signer.role === "externo" ? randomToken() : null;
    if (index === 0 && token) firstToken = token;
    await db.run(
      `INSERT INTO signature_steps (request_id, step_order, role, signer_user_id, signer_email, signer_name, status, token_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestId,
        index + 1,
        signer.role,
        signer.signer_user_id,
        signer.signer_email,
        signer.signer_name,
        index === 0 ? "active" : "waiting",
        token ? await sha256Text(token) : null,
      ],
    );
  }
  await db.run("UPDATE contracts SET status = 'in_signature', updated_at = ? WHERE id = ?", [now, contractId]);
  await recordAudit(db, {
    entityType: "signature_request",
    entityId: requestId,
    action: "signature.sent",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { contract_id: contractId, public_id: publicId, steps: signers.length },
  });
  const first = signers[0];
  const link = first.role === "externo" && firstToken ? `${origin}/firmar/${firstToken}` : `${origin}/firmas/${requestId}`;
  await notify(db, {
    userId: first.signer_user_id,
    email: first.signer_email,
    subject: `Firma pendiente: ${contract.title}`,
    body: `Te toca firmar "${contract.title}".\nAbre este enlace:\n${link}\n\nSolo puedes firmar cuando seas el firmante en turno.`,
    link,
    kind: "signature.step",
    senderUserId: actor.uid,
    dedupeKey: `sig:${requestId}:1:active:${now}`,
  });
  return { requestId, publicId };
}

async function activeStep(db: SqlDb, requestId: number): Promise<{ request: SignatureRequestRow; step: SignatureStepRow; contract: ContractRow }> {
  const request = await requestById(db, requestId);
  if (!request || (request.status !== "in_progress" && request.status !== "pending")) throw new HttpError(404, "Esa firma no está abierta.");
  const contract = await getContract(db, request.contract_id);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  const step = await db.get<SignatureStepRow>(
    "SELECT * FROM signature_steps WHERE request_id = ? AND step_order = ? AND status = 'active'",
    [requestId, request.current_step],
  );
  if (!step) throw new HttpError(409, "No hay un firmante en turno.");
  return { request, step, contract };
}

export async function requestOtp(db: SqlDb, actor: Actor, requestId: number): Promise<void> {
  const { request, step, contract } = await activeStep(db, requestId);
  if (!isCurrentSigner(step, actor)) throw new HttpError(403, "Solo el firmante en turno puede pedir el código.");
  await issueOtp(db, request, step, contract, actor.uid, actor.email, actor.ip, actor.userAgent);
}

async function issueOtp(
  db: SqlDb,
  request: SignatureRequestRow,
  step: SignatureStepRow,
  contract: ContractRow,
  senderUserId: number | null,
  actorEmail: string,
  ip: string | null,
  userAgent: string | null,
) {
  const code = randomOtp();
  const expires = new Date(Date.now() + OTP_MINUTES * 60_000).toISOString();
  await db.run(
    "UPDATE signature_steps SET otp_hash = ?, otp_expires_at = ?, otp_attempts = 0 WHERE id = ?",
    [await sha256Text(`${step.id}:${code}`), expires, step.id],
  );
  await notify(db, {
    userId: step.signer_user_id,
    email: step.signer_email,
    subject: `Código para firmar: ${contract.title}`,
    body: `Tu código de firma es ${code}. Vence en ${OTP_MINUTES} minutos.\nNo lo reenvíes. Al usarlo confirmas que aceptas firmar electrónicamente (Ley 527 de 1999 y Decreto 2364 de 2012).`,
    link: "",
    kind: "signature.otp",
    senderUserId: senderUserId ?? request.created_by,
    dedupeKey: `sig:${request.id}:${step.step_order}:otp:${expires}`,
  });
  await recordAudit(db, {
    entityType: "signature_request",
    entityId: request.id,
    action: "signature.otp",
    actorUserId: step.signer_user_id,
    actorEmail,
    ip,
    userAgent,
    data: { step: step.step_order, expires },
  });
}

export type SignInput = {
  requestId: number;
  otp: string;
  consent: boolean;
  typedName?: string | null;
  signaturePng?: string | null;
};

export async function signStep(db: SqlDb, actor: Actor, input: SignInput, origin: string): Promise<{ done: boolean; finalSha256: string | null }> {
  const { request, step, contract } = await activeStep(db, input.requestId);
  if (!isCurrentSigner(step, actor)) throw new HttpError(403, "Solo el firmante en turno puede firmar.");
  return applySignature(db, request, step, contract, {
    otp: input.otp,
    consent: input.consent,
    typedName: input.typedName,
    signaturePng: input.signaturePng,
    email: actor.email,
    userId: actor.uid,
    ip: actor.ip,
    userAgent: actor.userAgent,
    origin,
  });
}

async function applySignature(
  db: SqlDb,
  request: SignatureRequestRow,
  step: SignatureStepRow,
  contract: ContractRow,
  input: {
    otp: string;
    consent: boolean;
    typedName?: string | null;
    signaturePng?: string | null;
    email: string;
    userId: number | null;
    ip: string | null;
    userAgent: string | null;
    origin: string;
  },
): Promise<{ done: boolean; finalSha256: string | null }> {
  if (!input.consent) throw new HttpError(400, "Debes aceptar firmar electrónicamente este documento.");
  const code = input.otp.trim();
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "El código tiene 6 dígitos.");
  if (!step.otp_hash || !step.otp_expires_at) throw new HttpError(400, "Pide primero el código que llega a tu correo.");
  if (step.otp_expires_at < new Date().toISOString()) throw new HttpError(400, "Ese código ya venció. Pide otro.");
  if (step.otp_attempts >= OTP_ATTEMPTS) throw new HttpError(429, "Demasiados intentos. Pide un código nuevo.");
  if ((await sha256Text(`${step.id}:${code}`)) !== step.otp_hash) {
    await db.run("UPDATE signature_steps SET otp_attempts = otp_attempts + 1 WHERE id = ?", [step.id]);
    throw new HttpError(400, "El código no coincide.");
  }
  const png = pngBytes(input.signaturePng);
  const typed = input.typedName?.trim() || "";
  if (!png && typed.length < 2) throw new HttpError(400, "Dibuja tu firma o escribe tu nombre.");
  const currentFileId = contract.current_file_id;
  if (!currentFileId) throw new HttpError(400, "El contrato no tiene PDF.");
  const file = await db.get<FileRow>("SELECT * FROM files WHERE id = ? AND deleted_at IS NULL", [currentFileId]);
  if (!file) throw new HttpError(404, "El PDF no está.");
  const bytes = await fileBytes(file);
  const inputSha = await sha256Hex(bytes);
  if (inputSha !== file.sha256) throw new HttpError(409, "El PDF cambió desde que se guardó. No se puede firmar.");
  const signedAt = new Date().toISOString();
  let stamped = await stampSignature(bytes, {
    signerName: step.signer_name || typed || step.signer_email,
    signerEmail: step.signer_email,
    roleLabel: roleLabel(step.role),
    step: step.step_order,
    signedAt,
    inputSha,
    outputNote: "Firma electronica simple. El codigo OTP se comprobo antes de este sello.",
    png,
    typedName: typed || null,
  });
  const steps = await stepsOf(db, request.id);
  const last = step.step_order === steps.length;
  let kind: "contract_signed" | "certificate" = "contract_signed";
  if (last) {
    const certificateSteps: CertificateStep[] = steps.map((item) => ({
      order: item.step_order,
      roleLabel: roleLabel(item.role),
      name: item.signer_name || item.signer_email,
      email: item.signer_email,
      status: item.id === step.id ? "firmado" : item.status,
      signedAt: item.id === step.id ? signedAt : item.signed_at,
      ip: item.id === step.id ? input.ip : item.ip,
      inputSha: item.id === step.id ? inputSha : item.input_sha256,
      outputSha: item.output_sha256,
    }));
    stamped = await appendCertificate(stamped, {
      publicId: request.public_id,
      title: contract.title,
      sourceSha: request.source_sha256,
      completedAt: signedAt,
      steps: certificateSteps,
    });
    kind = "certificate";
  }
  const stored = await persistPdf(db, {
    name: `${contract.code || "contrato"}-firma-${step.step_order}.pdf`,
    bytes: stamped,
    kind,
    folderId: file.folder_id,
    createdBy: contract.owner_id,
    actorEmail: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
  });
  const marked = await db.run(
    `UPDATE signature_steps
     SET status = 'signed', input_sha256 = ?, output_sha256 = ?, signed_at = ?, consent_at = ?, ip = ?, user_agent = ?, comment = ?, otp_hash = NULL
     WHERE id = ? AND status = 'active'`,
    [inputSha, stored.sha256, signedAt, signedAt, input.ip, input.userAgent, typed || null, step.id],
  );
  if (marked.changes !== 1) throw new HttpError(409, "Otro intento ya firmó este paso.");
  await db.run("UPDATE contracts SET current_file_id = ?, updated_at = ? WHERE id = ?", [stored.id, signedAt, contract.id]);
  if (input.userId) {
    await db.run(
      `INSERT INTO signature_agreements (user_id, accepted_at, ip, user_agent) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET accepted_at = excluded.accepted_at, ip = excluded.ip, user_agent = excluded.user_agent`,
      [input.userId, signedAt, input.ip, input.userAgent],
    );
  }
  await recordAudit(db, {
    entityType: "signature_request",
    entityId: request.id,
    action: "signature.signed",
    actorUserId: input.userId,
    actorEmail: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
    data: { step: step.step_order, input_sha256: inputSha, output_sha256: stored.sha256 },
  });
  if (!last) {
    const next = steps.find((item) => item.step_order === step.step_order + 1);
    if (!next) throw new HttpError(500, "Falta el siguiente firmante.");
    await db.run("UPDATE signature_steps SET status = 'active' WHERE id = ?", [next.id]);
    await db.run("UPDATE signature_requests SET current_step = ? WHERE id = ?", [next.step_order, request.id]);
    const token = next.role === "externo" ? randomToken() : null;
    if (token) await db.run("UPDATE signature_steps SET token_hash = ? WHERE id = ?", [await sha256Text(token), next.id]);
    const link = token ? `${input.origin}/firmar/${token}` : `${input.origin}/firmas/${request.id}`;
    await notify(db, {
      userId: next.signer_user_id,
      email: next.signer_email,
      subject: `Firma pendiente: ${contract.title}`,
      body: `${step.signer_name || step.signer_email} ya firmó "${contract.title}". Ahora te toca a ti.\n${link}`,
      link,
      kind: "signature.step",
      senderUserId: input.userId ?? request.created_by,
      dedupeKey: `sig:${request.id}:${next.step_order}:active:${signedAt}`,
    });
    return { done: false, finalSha256: null };
  }
  await db.run(
    "UPDATE signature_requests SET status = 'completed', final_file_id = ?, final_sha256 = ?, completed_at = ?, current_step = ? WHERE id = ?",
    [stored.id, stored.sha256, signedAt, step.step_order, request.id],
  );
  await db.run("UPDATE contracts SET status = 'signed', updated_at = ? WHERE id = ?", [signedAt, contract.id]);
  await recordAudit(db, {
    entityType: "signature_request",
    entityId: request.id,
    action: "signature.completed",
    actorUserId: input.userId,
    actorEmail: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
    data: { final_sha256: stored.sha256, public_id: request.public_id },
  });
  const verify = `${input.origin}/verificar/${request.public_id}`;
  for (const item of steps) {
    await notify(db, {
      userId: item.signer_user_id,
      email: item.signer_email,
      subject: `Contrato firmado: ${contract.title}`,
      body: `"${contract.title}" quedó firmado.\nHash final: ${stored.sha256}\nVerificación: ${verify}`,
      link: verify,
      kind: "signature.completed",
      senderUserId: input.userId ?? request.created_by,
      dedupeKey: `sig:${request.id}:done:${item.step_order}:${signedAt}`,
    });
  }
  return { done: true, finalSha256: stored.sha256 };
}

export async function rejectStep(db: SqlDb, actor: Actor, requestId: number, reason: string, origin: string): Promise<void> {
  const { request, step, contract } = await activeStep(db, requestId);
  if (!isCurrentSigner(step, actor)) throw new HttpError(403, "Solo el firmante en turno puede rechazar.");
  await applyRejection(db, request, step, contract, { reason, email: actor.email, userId: actor.uid, ip: actor.ip, userAgent: actor.userAgent, origin });
}

async function applyRejection(
  db: SqlDb,
  request: SignatureRequestRow,
  step: SignatureStepRow,
  contract: ContractRow,
  input: { reason: string; email: string; userId: number | null; ip: string | null; userAgent: string | null; origin: string },
) {
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 2000) throw new HttpError(400, "Escribe el motivo del rechazo (entre 3 y 2000 caracteres).");
  const now = new Date().toISOString();
  const marked = await db.run(
    "UPDATE signature_steps SET status = 'rejected', comment = ?, signed_at = ?, ip = ?, user_agent = ? WHERE id = ? AND status = 'active'",
    [reason, now, input.ip, input.userAgent, step.id],
  );
  if (marked.changes !== 1) throw new HttpError(409, "Ese paso ya no está en turno.");
  await db.run("UPDATE signature_requests SET status = 'rejected', rejected_reason = ? WHERE id = ?", [reason, request.id]);
  await db.run("UPDATE contracts SET status = 'draft', updated_at = ? WHERE id = ?", [now, contract.id]);
  await recordAudit(db, {
    entityType: "signature_request",
    entityId: request.id,
    action: "signature.rejected",
    actorUserId: input.userId,
    actorEmail: input.email,
    ip: input.ip,
    userAgent: input.userAgent,
    data: { step: step.step_order, reason },
  });
  const people = await stepsOf(db, request.id);
  const owner = await db.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE id = ?", [contract.owner_id]);
  const targets = new Map<string, { userId: number | null; email: string }>();
  if (owner) targets.set(owner.email, { userId: owner.id, email: owner.email });
  for (const item of people) {
    if (item.status === "signed" || item.id === step.id) targets.set(item.signer_email, { userId: item.signer_user_id, email: item.signer_email });
  }
  for (const target of targets.values()) {
    await notify(db, {
      userId: target.userId,
      email: target.email,
      subject: `Firma rechazada: ${contract.title}`,
      body: `${input.email} rechazó "${contract.title}".\nMotivo: ${reason}\nEl contrato volvió a borrador.\n${input.origin}/legal/contratos/${contract.id}`,
      link: `${input.origin}/legal/contratos/${contract.id}`,
      kind: "signature.rejected",
      senderUserId: input.userId ?? request.created_by,
      dedupeKey: `sig:${request.id}:rejected:${target.email}:${now}`,
    });
  }
}

export async function cancelSignature(db: SqlDb, actor: Actor, contractId: number): Promise<void> {
  const contract = await getContract(db, contractId);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  const request = await openRequest(db, contractId);
  if (!request) throw new HttpError(404, "No hay una firma en curso.");
  if (actor.role !== "admin" && request.created_by !== actor.uid && contract.owner_id !== actor.uid) {
    throw new HttpError(403, "Solo quien envió la firma, o un administrador, puede cancelarla.");
  }
  const now = new Date().toISOString();
  await db.run("UPDATE signature_requests SET status = 'cancelled' WHERE id = ?", [request.id]);
  await db.run("UPDATE signature_steps SET status = 'skipped' WHERE request_id = ? AND status IN ('waiting', 'active')", [request.id]);
  await db.run("UPDATE contracts SET status = 'draft', updated_at = ? WHERE id = ?", [now, contractId]);
  await recordAudit(db, {
    entityType: "signature_request",
    entityId: request.id,
    action: "signature.cancelled",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { contract_id: contractId },
  });
}

export type PendingSignature = {
  requestId: number;
  contractId: number;
  title: string;
  code: string | null;
  role: string;
  stepOrder: number;
};

export async function pendingForUser(db: SqlDb, userId: number, email: string): Promise<PendingSignature[]> {
  return db.all<PendingSignature>(
    `SELECT r.id AS requestId, r.contract_id AS contractId, c.title AS title, c.code AS code, s.role AS role, s.step_order AS stepOrder
     FROM signature_steps s
     JOIN signature_requests r ON r.id = s.request_id
     JOIN contracts c ON c.id = r.contract_id
     WHERE s.status = 'active' AND r.status = 'in_progress'
       AND (s.signer_user_id = ? OR lower(s.signer_email) = lower(?))
     ORDER BY r.id`,
    [userId, email],
  );
}

export async function latestSignature(db: SqlDb, contractId: number): Promise<SignatureRequestRow | undefined> {
  return db.get<SignatureRequestRow>("SELECT * FROM signature_requests WHERE contract_id = ? ORDER BY id DESC LIMIT 1", [contractId]);
}

export async function envelopeForUser(db: SqlDb, actor: Actor, requestId: number) {
  const request = await requestById(db, requestId);
  if (!request) throw new HttpError(404, "No está esa firma.");
  if (!can(actor.role, "view_contracts")) throw new HttpError(403, "No puedes ver esta firma.");
  const contract = await getContract(db, request.contract_id);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  const steps = await stepsOf(db, requestId);
  const current = steps.find((step) => step.status === "active") ?? null;
  return {
    request,
    contract,
    steps: steps.map((step) => publicStep(step, false)),
    canAct: !!current && isCurrentSigner(current, actor) && request.status === "in_progress",
  };
}

function publicStep(step: SignatureStepRow, mask: boolean) {
  return {
    order: step.step_order,
    role: step.role,
    roleLabel: roleLabel(step.role),
    name: step.signer_name || step.signer_email,
    email: mask && step.status !== "active" ? maskEmail(step.signer_email) : step.signer_email,
    status: step.status,
    signedAt: step.signed_at,
  };
}

function maskEmail(email: string): string {
  const [user, host] = email.split("@");
  if (!host) return "***";
  return `${user.slice(0, 1)}***@${host}`;
}

async function stepByToken(db: SqlDb, token: string): Promise<{ request: SignatureRequestRow; step: SignatureStepRow; contract: ContractRow }> {
  const hash = await sha256Text(token);
  const step = await db.get<SignatureStepRow>("SELECT * FROM signature_steps WHERE token_hash = ?", [hash]);
  if (!step) throw new HttpError(404, "Este enlace de firma no es válido.");
  const request = await requestById(db, step.request_id);
  if (!request) throw new HttpError(404, "Este enlace de firma no es válido.");
  const contract = await getContract(db, request.contract_id);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  return { request, step, contract };
}

export async function publicEnvelope(db: SqlDb, token: string) {
  const { request, step, contract } = await stepByToken(db, token);
  const steps = await stepsOf(db, request.id);
  const open = request.status === "in_progress" && step.status === "active";
  return {
    title: contract.title,
    code: contract.code,
    status: request.status,
    publicId: request.public_id,
    signerName: step.signer_name || step.signer_email,
    canAct: open,
    steps: steps.map((item) => publicStep(item, true)),
  };
}

export async function requestPublicOtp(db: SqlDb, token: string, ip: string | null, userAgent: string | null): Promise<void> {
  const { request, step, contract } = await stepByToken(db, token);
  if (request.status !== "in_progress" || step.status !== "active") throw new HttpError(409, "Todavía no es tu turno, o la firma ya cerró.");
  await issueOtp(db, request, step, contract, request.created_by, step.signer_email, ip, userAgent);
}

export async function signWithToken(db: SqlDb, token: string, input: Omit<SignInput, "requestId">, meta: { ip: string | null; userAgent: string | null; origin: string }) {
  const { request, step, contract } = await stepByToken(db, token);
  if (request.status !== "in_progress" || step.status !== "active") throw new HttpError(409, "Todavía no es tu turno, o la firma ya cerró.");
  return applySignature(db, request, step, contract, {
    ...input,
    email: step.signer_email,
    userId: null,
    ip: meta.ip,
    userAgent: meta.userAgent,
    origin: meta.origin,
  });
}

export async function rejectWithToken(
  db: SqlDb,
  token: string,
  reason: string,
  meta: { ip: string | null; userAgent: string | null; origin: string },
): Promise<void> {
  const { request, step, contract } = await stepByToken(db, token);
  if (request.status !== "in_progress" || step.status !== "active") throw new HttpError(409, "Todavía no es tu turno, o la firma ya cerró.");
  await applyRejection(db, request, step, contract, {
    reason,
    email: step.signer_email,
    userId: null,
    ip: meta.ip,
    userAgent: meta.userAgent,
    origin: meta.origin,
  });
}

export async function listMySignatures(db: SqlDb, userId: number, email: string) {
  const pending = await pendingForUser(db, userId, email);
  const history = await db.all<{ requestId: number; contractId: number; title: string; status: string; role: string }>(
    `SELECT r.id AS requestId, c.id AS contractId, c.title AS title, r.status AS status, s.role AS role
     FROM signature_steps s
     JOIN signature_requests r ON r.id = s.request_id
     JOIN contracts c ON c.id = r.contract_id
     WHERE s.signer_user_id = ? OR lower(s.signer_email) = lower(?)
     ORDER BY r.id DESC LIMIT 40`,
    [userId, email],
  );
  return { pending, history };
}
