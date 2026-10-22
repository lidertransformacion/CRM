import { can } from "@/lib/auth/permissions";
import { normalizeRole } from "@/lib/auth/session";
import { HttpError } from "@/lib/auth/users";
import { listEquipment, listLeads } from "@/lib/db";
import { actorOwnsTarget, canEditContract, sellerMatchesUser, type Actor, type TargetType } from "@/lib/legal/access";
import { recordAudit } from "@/lib/legal/audit";
import { ensureFolderPath, storePdf, type FileRow } from "@/lib/legal/drive";
import { CONTRACT_COLUMNS, LINK_COLUMNS, SIGNER_COLUMNS } from "@/lib/sql/columns";
import { binaryCompare, readThrough, sqlLike } from "@/lib/sql/read-cache";
import type { SqlDb } from "@/lib/sql/types";

export const CONTRACT_TYPES = ["comodato", "suministro", "confidencialidad", "otro"] as const;
export const CONTRACT_STATUSES = ["draft", "in_signature", "signed", "active", "expired", "terminated"] as const;
export const NOVEDAD_KINDS = ["nota", "otrosi", "renovacion", "vencimiento", "incumplimiento", "terminacion"] as const;
export const SIGNER_ROLES = ["comercial", "legal", "gerencia", "externo"] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type ContractType = (typeof CONTRACT_TYPES)[number];
export type NovedadKind = (typeof NOVEDAD_KINDS)[number];
export type SignerRole = (typeof SIGNER_ROLES)[number];

export type ContractRow = {
  id: number;
  code: string | null;
  title: string;
  type: ContractType;
  counterparty_name: string | null;
  counterparty_nit: string | null;
  country: string;
  status: ContractStatus;
  current_file_id: number | null;
  start_date: string | null;
  end_date: string | null;
  renewal_notice_days: number | null;
  value_cop: number | null;
  owner_id: number;
  created_at: string;
  updated_at: string;
};

export type LinkRow = {
  id: number;
  contract_id: number;
  target_type: TargetType;
  target_key: string;
  created_by: number;
  created_at: string;
};

export type NovedadRow = {
  id: number;
  contract_id: number;
  kind: NovedadKind;
  body: string;
  file_id: number | null;
  due_date: string | null;
  created_by: number;
  created_at: string;
  author_email?: string | null;
};

export type SignerRow = {
  id: number;
  contract_id: number;
  step_order: number;
  role: SignerRole;
  signer_user_id: number | null;
  signer_email: string;
  signer_name: string | null;
  created_at: string;
};

export type LinkInput = { target_type: TargetType; target_key: string };
export type SignerInput = {
  role: string;
  signer_email: string;
  signer_name?: string | null;
  signer_user_id?: number | null;
};

export type ContractDraft = {
  title: string;
  type: string;
  status?: string;
  counterparty_name?: string | null;
  counterparty_nit?: string | null;
  country?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  renewal_notice_days?: number | null;
  value_cop?: number | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireView(actor: Actor) {
  if (!can(actor.role, "view_contracts")) throw new HttpError(403, "No puedes ver los contratos.");
}

function blankToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function parseDate(value: string | null | undefined, label: string): string | null {
  const text = blankToNull(value);
  if (!text) return null;
  if (!DATE_RE.test(text)) throw new HttpError(400, `${label} usa el formato AAAA-MM-DD.`);
  return text;
}

function parseType(value: string): ContractType {
  if ((CONTRACT_TYPES as readonly string[]).includes(value)) return value as ContractType;
  throw new HttpError(400, "El tipo de contrato no es válido.");
}

function parseStatus(value: string | undefined): ContractStatus {
  const status = value?.trim() || "draft";
  if ((CONTRACT_STATUSES as readonly string[]).includes(status)) return status as ContractStatus;
  throw new HttpError(400, "El estado del contrato no es válido.");
}

function parseCountry(value: string | null | undefined): string {
  const country = (value ?? "CO").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new HttpError(400, "El país es un código de dos letras.");
  return country;
}

function parseMoney(value: number | null | undefined): number | null {
  if (value == null || value === ("" as unknown)) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new HttpError(400, "El valor debe ser un entero en pesos.");
  return number;
}

function parseNotice(value: number | null | undefined): number | null {
  if (value == null || value === ("" as unknown)) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 3650) throw new HttpError(400, "El aviso de renovación va de 0 a 3650 días.");
  return number;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayBogota(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function isExpiring(contract: Pick<ContractRow, "end_date" | "status" | "renewal_notice_days">, today: string): boolean {
  if (!contract.end_date) return false;
  if (contract.status === "terminated" || contract.status === "expired") return false;
  const days = contract.renewal_notice_days ?? 30;
  return contract.end_date <= addDays(today, days);
}

function fileKind(status: ContractStatus): "contract_original" | "contract_signed" {
  return status === "signed" || status === "active" ? "contract_signed" : "contract_original";
}

async function nextCode(db: SqlDb): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM contracts WHERE code LIKE ?", [`CTR-${year}-%`]);
  return `CTR-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

async function assertLinks(db: SqlDb, actor: Actor, links: LinkInput[], required: boolean) {
  const unique = new Map<string, LinkInput>();
  for (const link of links) {
    if (link.target_type !== "lead" && link.target_type !== "equipment") throw new HttpError(400, "El vínculo debe ser un negocio o un equipo.");
    const key = link.target_key.trim();
    if (!key) throw new HttpError(400, "Falta la clave del negocio o del equipo.");
    unique.set(`${link.target_type}:${key}`, { target_type: link.target_type, target_key: key });
  }
  const list = [...unique.values()];
  if (required && list.length === 0) throw new HttpError(400, "Vincula el contrato al menos a un negocio o equipo tuyo.");
  for (const link of list) {
    const allowed = await actorOwnsTarget(db, actor, link.target_type, link.target_key);
    if (!allowed) {
      throw new HttpError(can(actor.role, "link_any") ? 404 : 403, can(actor.role, "link_any") ? "No existe ese negocio o equipo." : "Solo puedes vincular tus negocios o equipos.");
    }
  }
  return list;
}

function parseSigners(signers: SignerInput[]): { role: SignerRole; signer_email: string; signer_name: string | null; signer_user_id: number | null }[] {
  if (signers.length > 12) throw new HttpError(400, "Un contrato admite hasta 12 firmantes.");
  return signers.map((signer) => {
    if (!(SIGNER_ROLES as readonly string[]).includes(signer.role)) throw new HttpError(400, "El rol del firmante no es válido.");
    const email = signer.signer_email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Cada firmante necesita un correo válido.");
    const userId = signer.signer_user_id == null || signer.signer_user_id === ("" as unknown) ? null : Number(signer.signer_user_id);
    if (userId != null && !Number.isInteger(userId)) throw new HttpError(400, "El firmante interno no es válido.");
    return {
      role: signer.role as SignerRole,
      signer_email: email,
      signer_name: blankToNull(signer.signer_name),
      signer_user_id: signer.role === "externo" ? null : userId,
    };
  });
}

async function insertSigners(db: SqlDb, contractId: number, signers: ReturnType<typeof parseSigners>, at: string) {
  await db.run("DELETE FROM contract_signers WHERE contract_id = ?", [contractId]);
  for (let index = 0; index < signers.length; index += 1) {
    const signer = signers[index];
    await db.run(
      `INSERT INTO contract_signers (contract_id, step_order, role, signer_user_id, signer_email, signer_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [contractId, index + 1, signer.role, signer.signer_user_id, signer.signer_email, signer.signer_name, at],
    );
  }
}

async function insertLinks(db: SqlDb, actor: Actor, contractId: number, links: LinkInput[], at: string) {
  await db.run("DELETE FROM contract_links WHERE contract_id = ?", [contractId]);
  for (const link of links) {
    await db.run(
      `INSERT INTO contract_links (contract_id, target_type, target_key, created_by, created_at) VALUES (?, ?, ?, ?, ?)`,
      [contractId, link.target_type, link.target_key, actor.uid, at],
    );
  }
}

function filingClient(name: string | null | undefined): string {
  const clean = (name ?? "").trim().replace(/[/\\]/g, " ").replace(/\s+/g, " ");
  if (!clean) return "Sin cliente";
  return clean.slice(0, 80);
}

export async function createContract(
  db: SqlDb,
  actor: Actor,
  input: ContractDraft & { fileName: string; mime: string; bytes: Uint8Array; links: LinkInput[]; signers: SignerInput[] },
): Promise<number> {
  if (!can(actor.role, "upload_contract")) throw new HttpError(403, "No puedes subir contratos.");
  const title = input.title.trim();
  if (!title || title.length > 180) throw new HttpError(400, "El título debe tener entre 1 y 180 caracteres.");
  const type = parseType(input.type);
  const status = parseStatus(input.status);
  const links = await assertLinks(db, actor, input.links, !can(actor.role, "link_any"));
  const signers = parseSigners(input.signers);
  const year = String(new Date().getUTCFullYear());
  const folderId = await ensureFolderPath(db, actor, ["Contratos", year, filingClient(input.counterparty_name)]);
  const file = await storePdf(db, actor, {
    name: input.fileName,
    mime: input.mime,
    bytes: input.bytes,
    kind: fileKind(status),
    folderId,
  });
  const now = new Date().toISOString();
  let code = await nextCode(db);
  let id = 0;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.run(
        `INSERT INTO contracts (code, title, type, counterparty_name, counterparty_nit, country, status, current_file_id, start_date, end_date, renewal_notice_days, value_cop, owner_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code,
          title,
          type,
          blankToNull(input.counterparty_name),
          blankToNull(input.counterparty_nit),
          parseCountry(input.country),
          status,
          file.id,
          parseDate(input.start_date, "La fecha de inicio"),
          parseDate(input.end_date, "La fecha de fin"),
          parseNotice(input.renewal_notice_days),
          parseMoney(input.value_cop),
          actor.uid,
          now,
          now,
        ],
      );
      id = result.lastInsertRowid;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/unique/i.test(message) || attempt === 2) throw error;
      code = await nextCode(db);
    }
  }
  await insertLinks(db, actor, id, links, now);
  await insertSigners(db, id, signers, now);
  await recordAudit(db, {
    entityType: "contract",
    entityId: id,
    action: "contract.create",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { code, title, status, file_id: file.id, links, signers: signers.length },
  });
  return id;
}

async function allContracts(db: SqlDb): Promise<ContractRow[]> {
  return readThrough(db, "legal:contracts", ["legal"], () =>
    db.all<ContractRow>(`SELECT ${CONTRACT_COLUMNS} FROM contracts ORDER BY updated_at DESC`),
  );
}

export async function getContract(db: SqlDb, id: number): Promise<ContractRow | undefined> {
  return (await allContracts(db)).find((row) => row.id === id);
}

export async function contractBundle(db: SqlDb, actor: Actor, id: number) {
  requireView(actor);
  const contract = await getContract(db, id);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  const file = contract.current_file_id
    ? await db.get<FileRow>("SELECT id, folder_id, name, r2_key, mime, size_bytes, sha256, kind, created_by, created_at, updated_at, deleted_at FROM files WHERE id = ? AND deleted_at IS NULL", [contract.current_file_id])
    : undefined;
  const links = await db.all<LinkRow>(`SELECT ${LINK_COLUMNS} FROM contract_links WHERE contract_id = ? ORDER BY id`, [id]);
  const novedades = await db.all<NovedadRow>(
    `SELECT n.id, n.contract_id, n.kind, n.body, n.file_id, n.due_date, n.created_by, n.created_at, u.email AS author_email
     FROM contract_novedades n LEFT JOIN users u ON u.id = n.created_by
     WHERE n.contract_id = ? ORDER BY n.created_at, n.id`,
    [id],
  );
  const signers = await db.all<SignerRow>(`SELECT ${SIGNER_COLUMNS} FROM contract_signers WHERE contract_id = ? ORDER BY step_order`, [id]);
  const labels = await labelsForLinks(db, links);
  const labeled = links.map((link) => ({ ...link, label: labels.get(`${link.target_type}:${link.target_key}`) ?? link.target_key }));
  return {
    contract,
    file: file ?? null,
    links: labeled,
    novedades,
    signers,
    canEdit: await canEditContract(db, actor, id),
  };
}

export async function describeTarget(db: SqlDb, type: TargetType, key: string): Promise<{ target_type: TargetType; target_key: string; label: string }> {
  return { target_type: type, target_key: key, label: await targetLabel(db, type, key) };
}

async function labelsForLinks(db: SqlDb, links: LinkRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const leadKeys = new Set(links.filter((link) => link.target_type === "lead").map((link) => link.target_key));
  const serials = new Set(links.filter((link) => link.target_type === "equipment").map((link) => link.target_key));
  if (leadKeys.size) {
    for (const lead of await listLeads(db)) {
      if (leadKeys.has(lead.import_key)) labels.set(`lead:${lead.import_key}`, lead.customer || lead.name);
    }
  }
  if (serials.size) {
    for (const item of await listEquipment(db)) {
      if (serials.has(item.serial)) labels.set(`equipment:${item.serial}`, `${item.store_code} · ${item.client_name || item.name}`);
    }
  }
  return labels;
}

async function targetLabel(db: SqlDb, type: TargetType, key: string): Promise<string> {
  const labels = await labelsForLinks(db, [{ id: 0, contract_id: 0, target_type: type, target_key: key, created_by: 0, created_at: "" }]);
  return labels.get(`${type}:${key}`) ?? key;
}

function contractMatches(query: string, row: ContractRow): boolean {
  const q = query.trim().replace(/[%_]/g, "");
  if (!q) return true;
  const like = `%${q}%`;
  return sqlLike(like, row.title) || sqlLike(like, row.code) || sqlLike(like, row.counterparty_name ?? "");
}

export async function listContracts(db: SqlDb, actor: Actor, query: string) {
  requireView(actor);
  const today = todayBogota();
  return (await allContracts(db))
    .filter((row) => contractMatches(query, row))
    .slice(0, 200)
    .map((row) => ({ ...row, expiring: isExpiring(row, today) }));
}

/** Every contract, so the screen can filter title, client, and expiry without another query. */
export async function contractCatalog(db: SqlDb, actor: Actor) {
  requireView(actor);
  const today = todayBogota();
  return (await allContracts(db)).map((row) => ({ ...row, expiring: isExpiring(row, today) }));
}

export async function expiringContracts(db: SqlDb, actor: Actor) {
  const rows = await listContracts(db, actor, "");
  return rows.filter((row) => row.expiring);
}

export async function updateContract(
  db: SqlDb,
  actor: Actor,
  id: number,
  input: ContractDraft & { links?: LinkInput[]; signers?: SignerInput[] },
): Promise<void> {
  if (!(await canEditContract(db, actor, id))) throw new HttpError(403, "No puedes editar este contrato.");
  await assertSignatureClosed(db, id);
  const current = await getContract(db, id);
  if (!current) throw new HttpError(404, "No está ese contrato.");
  const title = input.title.trim();
  if (!title || title.length > 180) throw new HttpError(400, "El título debe tener entre 1 y 180 caracteres.");
  const now = new Date().toISOString();
  await db.run(
    `UPDATE contracts SET title = ?, type = ?, counterparty_name = ?, counterparty_nit = ?, country = ?, status = ?,
      start_date = ?, end_date = ?, renewal_notice_days = ?, value_cop = ?, updated_at = ? WHERE id = ?`,
    [
      title,
      parseType(input.type),
      blankToNull(input.counterparty_name),
      blankToNull(input.counterparty_nit),
      parseCountry(input.country),
      parseStatus(input.status),
      parseDate(input.start_date, "La fecha de inicio"),
      parseDate(input.end_date, "La fecha de fin"),
      parseNotice(input.renewal_notice_days),
      parseMoney(input.value_cop),
      now,
      id,
    ],
  );
  if (input.links) {
    const links = await mergeLinks(db, actor, id, input.links);
    await insertLinks(db, actor, id, links, now);
  }
  if (input.signers) await insertSigners(db, id, parseSigners(input.signers), now);
  await recordAudit(db, {
    entityType: "contract",
    entityId: id,
    action: "contract.update",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { title, status: parseStatus(input.status) },
  });
}

async function assertSignatureClosed(db: SqlDb, contractId: number) {
  const open = await db.get<{ id: number }>(
    "SELECT id FROM signature_requests WHERE contract_id = ? AND status IN ('pending', 'in_progress')",
    [contractId],
  );
  if (open) throw new HttpError(409, "Hay una firma en curso. Cancélala antes de cambiar el contrato.");
}

async function mergeLinks(db: SqlDb, actor: Actor, contractId: number, next: LinkInput[]): Promise<LinkInput[]> {
  const requested = await assertLinks(db, actor, next, false);
  if (can(actor.role, "link_any")) return requested;
  const existing = await db.all<LinkRow>(`SELECT ${LINK_COLUMNS} FROM contract_links WHERE contract_id = ?`, [contractId]);
  const kept: LinkInput[] = [];
  for (const link of existing) {
    if (!(await actorOwnsTarget(db, actor, link.target_type, link.target_key))) {
      kept.push({ target_type: link.target_type, target_key: link.target_key });
    }
  }
  const merged = new Map<string, LinkInput>();
  for (const link of [...kept, ...requested]) merged.set(`${link.target_type}:${link.target_key}`, link);
  if (merged.size === 0) throw new HttpError(400, "Vincula el contrato al menos a un negocio o equipo tuyo.");
  return [...merged.values()];
}

export async function replaceContractFile(
  db: SqlDb,
  actor: Actor,
  id: number,
  file: { name: string; mime: string; bytes: Uint8Array },
): Promise<FileRow> {
  if (!(await canEditContract(db, actor, id))) throw new HttpError(403, "No puedes cambiar el PDF de este contrato.");
  await assertSignatureClosed(db, id);
  const contract = await getContract(db, id);
  if (!contract) throw new HttpError(404, "No está ese contrato.");
  const current = contract.current_file_id
    ? await db.get<FileRow>("SELECT id, folder_id, name, r2_key, mime, size_bytes, sha256, kind, created_by, created_at, updated_at, deleted_at FROM files WHERE id = ?", [contract.current_file_id])
    : undefined;
  const year = String(new Date().getUTCFullYear());
  const folderId = current?.folder_id ?? (await ensureFolderPath(db, actor, ["Contratos", year, filingClient(contract.counterparty_name)]));
  const stored = await storePdf(db, actor, {
    name: file.name,
    mime: file.mime,
    bytes: file.bytes,
    kind: fileKind(contract.status),
    folderId,
  });
  const now = new Date().toISOString();
  await db.run("UPDATE contracts SET current_file_id = ?, updated_at = ? WHERE id = ?", [stored.id, now, id]);
  await recordAudit(db, {
    entityType: "contract",
    entityId: id,
    action: "contract.file",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { file_id: stored.id, sha256: stored.sha256 },
  });
  return stored;
}

export async function addNovedad(
  db: SqlDb,
  actor: Actor,
  contractId: number,
  input: { kind: string; body: string; due_date?: string | null },
): Promise<number> {
  if (!(await canEditContract(db, actor, contractId))) throw new HttpError(403, "No puedes anotar novedades en este contrato.");
  if (!(NOVEDAD_KINDS as readonly string[]).includes(input.kind)) throw new HttpError(400, "El tipo de novedad no es válido.");
  const body = input.body.trim();
  if (!body || body.length > 4000) throw new HttpError(400, "La novedad debe tener entre 1 y 4000 caracteres.");
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO contract_novedades (contract_id, kind, body, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [contractId, input.kind, body, parseDate(input.due_date, "La fecha"), actor.uid, now],
  );
  await db.run("UPDATE contracts SET updated_at = ? WHERE id = ?", [now, contractId]);
  await recordAudit(db, {
    entityType: "contract",
    entityId: contractId,
    action: "contract.novedad",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { kind: input.kind, novedad_id: result.lastInsertRowid },
  });
  return result.lastInsertRowid;
}

export async function linksForTarget(db: SqlDb, actor: Actor, type: TargetType, key: string) {
  requireView(actor);
  if (type !== "lead" && type !== "equipment") throw new HttpError(400, "El vínculo debe ser un negocio o un equipo.");
  return db.all<Pick<ContractRow, "id" | "code" | "title" | "status" | "type">>(
    `SELECT c.id, c.code, c.title, c.status, c.type
     FROM contracts c JOIN contract_links l ON l.contract_id = c.id
     WHERE l.target_type = ? AND l.target_key = ?
     ORDER BY c.updated_at DESC`,
    [type, key],
  );
}

function createdDesc(left: string | null | undefined, right: string | null | undefined): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return binaryCompare(right, left);
}

export async function searchTargets(db: SqlDb, actor: Actor, query: string) {
  if (!can(actor.role, "upload_contract")) throw new HttpError(403, "No puedes vincular contratos.");
  const q = query.trim().replace(/[%_]/g, "");
  const like = `%${q}%`;
  const limit = q ? 40 : 20;
  const allLeads = await listLeads(db);
  const leadByKey = new Map(allLeads.map((lead) => [lead.import_key, lead]));
  const leads = allLeads
    .filter((lead) => !q || sqlLike(like, lead.name) || sqlLike(like, lead.customer ?? "") || sqlLike(like, lead.import_key) || sqlLike(like, lead.salesperson ?? ""))
    .sort((a, b) => createdDesc(a.created_at, b.created_at))
    .slice(0, limit);
  const equipment = (await listEquipment(db))
    .filter((item) => !q || sqlLike(like, item.name) || sqlLike(like, item.serial) || sqlLike(like, item.client_name ?? "") || sqlLike(like, item.store_code))
    .sort((a, b) => createdDesc(a.updated_at, b.updated_at))
    .slice(0, limit);
  const anyLink = can(actor.role, "link_any");
  const ownsLeadRow = (lead: (typeof leads)[number]) => anyLink || sellerMatchesUser(lead.salesperson, actor.email);
  const ownsEquipmentRow = (item: (typeof equipment)[number]) => {
    if (anyLink) return true;
    if (sellerMatchesUser(item.salesperson, actor.email)) return true;
    const lead = item.lead_import_key ? leadByKey.get(item.lead_import_key) : undefined;
    return !!lead && sellerMatchesUser(lead.salesperson, actor.email);
  };
  return {
    leads: leads
      .filter(ownsLeadRow)
      .slice(0, 20)
      .map((lead) => ({ target_type: "lead" as const, target_key: lead.import_key, label: lead.customer || lead.name, hint: lead.salesperson })),
    equipment: equipment
      .filter(ownsEquipmentRow)
      .slice(0, 20)
      .map((item) => ({
        target_type: "equipment" as const,
        target_key: item.serial,
        label: `${item.store_code} · ${item.client_name || item.name}`,
        hint: item.salesperson,
      })),
  };
}

export async function directory(db: SqlDb, actor: Actor) {
  if (!can(actor.role, "upload_contract")) throw new HttpError(403, "No puedes asignar firmantes.");
  const rows = await readThrough(db, "users:directory", ["users"], () =>
    db.all<{ id: number; email: string; role: string }>("SELECT id, email, role FROM users ORDER BY email"),
  );
  return rows.map((row) => ({ ...row, role: normalizeRole(row.role) }));
}
