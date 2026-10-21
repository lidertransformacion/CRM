import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { HttpError } from "@/lib/auth/users";
import { openDatabase } from "@/lib/db";
import type { Actor } from "@/lib/legal/access";
import { createContract, updateContract } from "@/lib/legal/contracts";
import { deleteFile } from "@/lib/legal/drive";
import {
  cancelSignature,
  pendingForUser,
  rejectStep,
  requestOtp,
  sendForSignature,
  setOtpForTests,
  signStep,
  signWithToken,
  publicEnvelope,
  requestPublicOtp,
} from "@/lib/legal/signatures";
import { setLegalFilesBucketForTests, type LegalBucket } from "@/lib/legal/storage";
import { auditChainIntact, lookupPdf, lookupSha256, publicVerification } from "@/lib/legal/verify";
import { gerenciaSnapshot } from "@/lib/gerencia/metrics";
import { wrapDatabaseSync } from "@/lib/sql/node";
import { readUsage } from "@/lib/storage/quota";
import type { SqlDb } from "@/lib/sql/types";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

class MemoryBucket implements LegalBucket {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer | Uint8Array | string) {
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
    this.objects.set(key, bytes.slice());
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      size: bytes.byteLength,
      body: new ReadableStream(),
      httpMetadata: { contentType: "application/pdf" },
      arrayBuffer: async (): Promise<ArrayBuffer> => {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        return copy.buffer;
      },
    };
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

function actor(id: number, role: Actor["role"], email: string): Actor {
  return { uid: id, email, role, ip: "203.0.113.8", userAgent: "vitest" };
}

async function tempDb() {
  const file = path.join(os.tmpdir(), `crm-sign-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

async function samplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Contrato de prueba", { x: 50, y: 700, size: 18, font });
  return new Uint8Array(await pdf.save());
}

async function seed(db: SqlDb) {
  const now = "2026-10-20T12:00:00.000Z";
  const password = await hashPassword("correct-horse-battery");
  const insert = async (email: string, role: string) => {
    const result = await db.run(
      `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, 1, ?, ?)`,
      [email, password, role, now, now],
    );
    return result.lastInsertRowid;
  };
  const adminId = await insert("admin@libertariocoffee.com", "admin");
  const comercialId = await insert("ana.comercial@libertariocoffee.com", "comercial");
  const legalId = await insert("legal@libertariocoffee.com", "legal");
  const gerenciaId = await insert("gerencia@libertariocoffee.com", "gerencia");
  await db.run(
    `INSERT INTO leads (import_key, name, stage, salesperson, customer, expected_revenue, won_status, active, edited_locally, sync_state, missing_from_odoo)
     VALUES ('L1', 'Negocio norte', 'Nuevo', 'ana.comercial@libertariocoffee.com', 'Cafe Norte', 2500000, 'pendiente', 1, 0, 'synced', 0)`,
  );
  await db.run(
    `INSERT INTO leads (import_key, name, stage, salesperson, customer, expected_revenue, won_status, active, edited_locally, sync_state, missing_from_odoo)
     VALUES ('L2', 'Negocio cerrado', 'CIERRE/ GANADO', 'ana.comercial@libertariocoffee.com', 'Cafe Sur', 100, 'ganado', 1, 0, 'synced', 0)`,
  );
  await db.run(
    `INSERT INTO visits (id, status, fecha, cliente, payload, created_at, updated_at) VALUES ('v1', 'cerrada', '2026-10-20', 'Cafe Norte', '{}', ?, ?)`,
    [now, now],
  );
  return {
    admin: actor(adminId, "admin", "admin@libertariocoffee.com"),
    comercial: actor(comercialId, "comercial", "ana.comercial@libertariocoffee.com"),
    legal: actor(legalId, "legal", "legal@libertariocoffee.com"),
    gerencia: actor(gerenciaId, "gerencia", "gerencia@libertariocoffee.com"),
    ids: { comercialId, legalId, gerenciaId },
  };
}

async function makeContract(
  db: SqlDb,
  owner: Actor,
  title: string,
  signers: { role: string; signer_email: string; signer_name?: string; signer_user_id?: number | null }[],
  links: { target_type: "lead" | "equipment"; target_key: string }[] = [],
) {
  return createContract(db, owner, {
    title,
    type: "comodato",
    status: "draft",
    counterparty_name: "Cafe Norte",
    fileName: "contrato.pdf",
    mime: "application/pdf",
    bytes: await samplePdf(),
    links,
    signers,
  });
}

describe("electronic signatures", () => {
  const created: string[] = [];
  const bucket = new MemoryBucket();

  beforeEach(() => {
    setLegalFilesBucketForTests(bucket);
    setOtpForTests("123456");
    bucket.objects.clear();
  });

  afterEach(() => {
    setLegalFilesBucketForTests(null);
    setOtpForTests(null);
    for (const file of created) fs.rmSync(file, { force: true });
    created.length = 0;
  });

  it("signs in order, stamps the PDF, notifies the next person, and verifies the final hash", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    const people = await seed(db);
    const before = await readUsage(db);
    const id = await makeContract(db, people.admin, "Comodato norte", [
      { role: "comercial", signer_email: people.comercial.email, signer_name: "Ana Muñoz", signer_user_id: people.ids.comercialId },
      { role: "legal", signer_email: people.legal.email, signer_user_id: people.ids.legalId },
      { role: "externo", signer_email: "cliente@cafenorte.com", signer_name: "Cliente Norte" },
    ]);

    await expect(sendForSignature(db, people.gerencia, id, "https://crm.test")).rejects.toMatchObject({ status: 403 });
    const sent = await sendForSignature(db, people.admin, id, "https://crm.test");
    const contract = await db.get<{ status: string }>("SELECT status FROM contracts WHERE id = ?", [id]);
    expect(contract?.status).toBe("in_signature");
    await expect(updateContract(db, people.admin, id, { title: "Otro", type: "comodato" })).rejects.toMatchObject({ status: 409 });

    const firstPending = await pendingForUser(db, people.comercial.uid, people.comercial.email);
    expect(firstPending.map((row) => row.requestId)).toEqual([sent.requestId]);
    expect(await pendingForUser(db, people.legal.uid, people.legal.email)).toEqual([]);
    await expect(requestOtp(db, people.legal, sent.requestId)).rejects.toMatchObject({ status: 403 });
    await expect(signStep(db, people.comercial, { requestId: sent.requestId, otp: "123456", consent: false, typedName: "Ana" }, "https://crm.test")).rejects.toMatchObject({
      status: 400,
    });

    await requestOtp(db, people.comercial, sent.requestId);
    await expect(signStep(db, people.comercial, { requestId: sent.requestId, otp: "000000", consent: true, signaturePng: PNG }, "https://crm.test")).rejects.toBeInstanceOf(HttpError);
    const attempts = await db.get<{ otp_attempts: number }>("SELECT otp_attempts FROM signature_steps WHERE request_id = ? AND step_order = 1", [sent.requestId]);
    expect(attempts?.otp_attempts).toBe(1);

    const first = await signStep(
      db,
      people.comercial,
      { requestId: sent.requestId, otp: "123456", consent: true, signaturePng: PNG, typedName: "Ana Muñoz" },
      "https://crm.test",
    );
    expect(first.done).toBe(false);
    const legalMail = await db.get<{ to_email: string; body_text: string }>(
      "SELECT to_email, body_text FROM email_outbox WHERE subject LIKE 'Firma pendiente:%' ORDER BY id DESC LIMIT 1",
    );
    expect(legalMail?.to_email).toBe(people.legal.email);
    expect(legalMail?.body_text).toContain(`/firmas/${sent.requestId}`);
    expect(await pendingForUser(db, people.legal.uid, people.legal.email)).toHaveLength(1);

    await requestOtp(db, people.legal, sent.requestId);
    const second = await signStep(db, people.legal, { requestId: sent.requestId, otp: "123456", consent: true, typedName: "Equipo Legal" }, "https://crm.test");
    expect(second.done).toBe(false);
    const clientMail = await db.get<{ to_email: string; subject: string; body_text: string; sender_user_id: number }>(
      "SELECT to_email, subject, body_text, sender_user_id FROM email_outbox WHERE to_email = 'cliente@cafenorte.com' ORDER BY id DESC LIMIT 1",
    );
    expect(clientMail?.subject).toContain("Firma pendiente");
    expect(clientMail?.sender_user_id).toBe(people.legal.uid);
    const token = /\/firmar\/([A-Za-z0-9_-]+)/.exec(clientMail?.body_text ?? "")?.[1];
    expect(token && token.length >= 20).toBe(true);

    const envelope = await publicEnvelope(db, token!);
    expect(envelope.canAct).toBe(true);
    expect(envelope.steps.find((step) => step.order === 1)?.email).toMatch(/^\w\*\*\*@/);
    await requestPublicOtp(db, token!, "198.51.100.4", "cliente");
    const otpMail = await db.get<{ to_email: string; body_text: string; sender_user_id: number }>(
      "SELECT to_email, body_text, sender_user_id FROM email_outbox WHERE subject LIKE 'Código para firmar:%' ORDER BY id DESC LIMIT 1",
    );
    expect(otpMail?.to_email).toBe("cliente@cafenorte.com");
    expect(otpMail?.body_text).toContain("123456");
    expect(otpMail?.sender_user_id).toBe(people.admin.uid);

    const done = await signWithToken(db, token!, { otp: "123456", consent: true, typedName: "Cliente Norte" }, { ip: "198.51.100.4", userAgent: "cliente", origin: "https://crm.test" });
    expect(done).toEqual({ done: true, finalSha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const closed = await db.get<{ status: string; final_sha256: string; public_id: string }>("SELECT status, final_sha256, public_id FROM signature_requests WHERE id = ?", [sent.requestId]);
    expect(closed?.status).toBe("completed");
    expect(closed?.final_sha256).toBe(done.finalSha256);
    const signedContract = await db.get<{ status: string; current_file_id: number }>("SELECT status, current_file_id FROM contracts WHERE id = ?", [id]);
    expect(signedContract?.status).toBe("signed");
    const finalFile = await db.get<{ kind: string; sha256: string; r2_key: string; size_bytes: number }>("SELECT kind, sha256, r2_key, size_bytes FROM files WHERE id = ?", [signedContract?.current_file_id]);
    expect(finalFile?.kind).toBe("certificate");
    expect(finalFile?.sha256).toBe(done.finalSha256);
    expect(bucket.objects.has(finalFile!.r2_key)).toBe(true);

    const usage = await readUsage(db);
    expect(usage.bytesUsed).toBeGreaterThan(before.bytesUsed);
    const sizes = await db.get<{ n: number }>("SELECT SUM(size_bytes) AS n FROM files");
    expect(usage.bytesUsed).toBe(Number(sizes?.n));

    const stepHash = await db.get<{ output_sha256: string }>("SELECT output_sha256 FROM signature_steps WHERE request_id = ? AND step_order = 1", [sent.requestId]);
    const source = await db.get<{ source_sha256: string }>("SELECT source_sha256 FROM signature_requests WHERE id = ?", [sent.requestId]);
    expect((await lookupSha256(db, done.finalSha256!)).kind).toBe("final");
    expect((await lookupSha256(db, source!.source_sha256)).kind).toBe("source");
    expect((await lookupSha256(db, stepHash!.output_sha256)).kind).toBe("step");
    const stored = bucket.objects.get(finalFile!.r2_key)!;
    expect((await lookupPdf(db, stored)).kind).toBe("final");
    const tampered = stored.slice();
    tampered[tampered.length - 20] ^= 0xff;
    expect((await lookupPdf(db, tampered)).kind).toBe("none");

    const page = await publicVerification(db, closed!.public_id);
    expect(page?.chainIntact).toBe(true);
    expect(page?.finalSha256).toBe(done.finalSha256);
    expect(await auditChainIntact(db)).toBe(true);
    const agreement = await db.get<{ user_id: number }>("SELECT user_id FROM signature_agreements WHERE user_id = ?", [people.comercial.uid]);
    expect(agreement?.user_id).toBe(people.comercial.uid);
    const externalAgreement = await db.get("SELECT user_id FROM signature_agreements WHERE ip = '198.51.100.4'");
    expect(externalAgreement).toBeUndefined();

    const kept = usage.bytesUsed;
    await deleteFile(db, people.admin, signedContract!.current_file_id);
    expect((await readUsage(db)).bytesUsed).toBe(kept);
    expect(bucket.objects.has(finalFile!.r2_key)).toBe(true);

    const snapshot = await gerenciaSnapshot(db, people.gerencia, new Date());
    expect(snapshot.openDeals).toBe(1);
    expect(snapshot.pipelineValue).toBe(2_500_000);
    expect(snapshot.won).toBe(1);
    expect(snapshot.visits).toBe(1);
    expect(snapshot.signedThisMonth).toBe(1);
    expect(snapshot.contractsByStatus.find((row) => row.status === "signed")?.count).toBe(1);
    expect(snapshot.pending).toEqual([]);
  });

  it("lets the current signer reject, returns the contract to draft, and uses the default order", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    const people = await seed(db);
    const custom = await makeContract(db, people.comercial, "Suministro sur", [
      { role: "comercial", signer_email: people.comercial.email, signer_user_id: people.ids.comercialId },
    ], [{ target_type: "lead", target_key: "L1" }]);
    const sent = await sendForSignature(db, people.comercial, custom, "https://crm.test");
    await rejectStep(db, people.comercial, sent.requestId, "El valor no coincide", "https://crm.test");
    const rejected = await db.get<{ status: string; rejected_reason: string }>("SELECT status, rejected_reason FROM signature_requests WHERE id = ?", [sent.requestId]);
    expect(rejected).toMatchObject({ status: "rejected", rejected_reason: "El valor no coincide" });
    const draft = await db.get<{ status: string }>("SELECT status FROM contracts WHERE id = ?", [custom]);
    expect(draft?.status).toBe("draft");
    const notice = await db.get<{ subject: string; body_text: string }>("SELECT subject, body_text FROM email_outbox WHERE subject LIKE 'Firma rechazada:%' ORDER BY id DESC LIMIT 1");
    expect(notice?.body_text).toContain("El valor no coincide");

    const plain = await makeContract(db, people.comercial, "Sin orden", [], [{ target_type: "lead", target_key: "L1" }]);
    const opened = await sendForSignature(db, people.comercial, plain, "https://crm.test");
    const roles = await db.all<{ role: string; signer_email: string; status: string }>("SELECT role, signer_email, status FROM signature_steps WHERE request_id = ? ORDER BY step_order", [opened.requestId]);
    expect(roles.map((row) => row.role)).toEqual(["comercial", "legal", "gerencia"]);
    expect(roles[0]?.status).toBe("active");
    expect(roles[1]?.signer_email).toBe(people.legal.email);
    await requestOtp(db, people.comercial, opened.requestId);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(signStep(db, people.comercial, { requestId: opened.requestId, otp: "000000", consent: true, typedName: "Ana" }, "https://crm.test")).rejects.toMatchObject({
        status: attempt === 5 ? 429 : 400,
      });
    }
    await expect(cancelSignature(db, people.gerencia, plain)).rejects.toMatchObject({ status: 403 });
    await cancelSignature(db, people.comercial, plain);
    const cancelled = await db.get<{ status: string }>("SELECT status FROM contracts WHERE id = ?", [plain]);
    expect(cancelled?.status).toBe("draft");
    await expect(cancelSignature(db, people.gerencia, plain)).rejects.toMatchObject({ status: 404 });
  });
});
