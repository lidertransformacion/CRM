import { HttpError } from "@/lib/auth/users";
import { MAX_D1_FILE_BYTES, MAX_MAIL_BYTES, fileIdsInHtml, rewriteFileSrc } from "@/lib/mail/html";
import type { MailPart } from "@/lib/mail/message";
import type { SqlDb } from "@/lib/sql/types";

export type MailFileRow = {
  id: string;
  user_id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  r2_key: string | null;
  data_base64: string | null;
  content_id: string;
  created_at: string;
};

type MailBucket = {
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<void>;
};

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

const EXT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export function normalizeUpload(filename: string, contentType: string): { filename: string; contentType: string } {
  const base = filename.replace(/\\/g, "/").split("/").pop()?.trim() || "archivo";
  const clean = base.replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]+/g, "_").slice(0, 180);
  const ext = clean.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[contentType.toLowerCase()] ? (contentType.toLowerCase() === "image/jpg" ? "image/jpeg" : contentType.toLowerCase()) : EXT_TYPE[ext];
  if (!type || !TYPES[type === "image/jpg" ? "image/jpeg" : type]) throw new HttpError(400, "Solo se aceptan imágenes, PDF, DOCX y XLSX.");
  return { filename: clean, contentType: type };
}

export function assertMailSize(sizes: number[]): void {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (sizes.some((size) => size > MAX_MAIL_BYTES) || total > MAX_MAIL_BYTES) {
    throw new HttpError(400, "El correo pasa de 20 MB. Gmail rechaza mensajes cerca de 25 MB ya codificados.");
  }
}

export function mailFilesBucket(): MailBucket | null {
  if (process.env.VITEST) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require("cloudflare:workers") as { env?: { MAIL_FILES?: MailBucket } };
    return env?.MAIL_FILES ?? null;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function saveMailFile(
  db: SqlDb,
  userId: number,
  input: { filename: string; contentType: string; bytes: Uint8Array },
): Promise<MailFileRow> {
  const normalized = normalizeUpload(input.filename, input.contentType);
  if (!input.bytes.byteLength) throw new HttpError(400, "El archivo está vacío.");
  assertMailSize([input.bytes.byteLength]);
  const bucket = mailFilesBucket();
  if (!bucket && input.bytes.byteLength > MAX_D1_FILE_BYTES) {
    throw new HttpError(400, "Ese archivo necesita el depósito R2 MAIL_FILES. Sin él solo caben archivos de hasta 400 KB.");
  }
  const id = crypto.randomUUID();
  const contentId = `f${id}@crm.libertario`;
  const now = new Date().toISOString();
  let r2Key: string | null = null;
  let data: string | null = null;
  if (bucket) {
    r2Key = `mail/${userId}/${id}`;
    await bucket.put(r2Key, input.bytes, { httpMetadata: { contentType: normalized.contentType } });
  } else {
    data = bytesToBase64(input.bytes);
  }
  await db.run(
    `INSERT INTO mail_files (id, user_id, filename, content_type, size_bytes, r2_key, data_base64, content_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, normalized.filename, normalized.contentType, input.bytes.byteLength, r2Key, data, contentId, now],
  );
  return {
    id,
    user_id: userId,
    filename: normalized.filename,
    content_type: normalized.contentType,
    size_bytes: input.bytes.byteLength,
    r2_key: r2Key,
    data_base64: data,
    content_id: contentId,
    created_at: now,
  };
}

export async function readMailFile(db: SqlDb, id: string): Promise<{ row: MailFileRow; bytes: Uint8Array } | null> {
  const row = await db.get<MailFileRow>("SELECT * FROM mail_files WHERE id = ?", [id]);
  if (!row) return null;
  if (row.r2_key) {
    const bucket = mailFilesBucket();
    if (!bucket) throw new HttpError(500, "Falta el depósito de archivos.");
    const object = await bucket.get(row.r2_key);
    if (!object) return null;
    return { row, bytes: new Uint8Array(await object.arrayBuffer()) };
  }
  if (!row.data_base64) return null;
  return { row, bytes: base64ToBytes(row.data_base64) };
}

export async function deleteMailFile(db: SqlDb, userId: number, id: string): Promise<void> {
  const row = await db.get<MailFileRow>("SELECT * FROM mail_files WHERE id = ? AND user_id = ?", [id, userId]);
  if (!row) throw new HttpError(404, "Ese archivo no está.");
  if (row.r2_key) {
    const bucket = mailFilesBucket();
    if (bucket) await bucket.delete(row.r2_key);
  }
  await db.run("DELETE FROM mail_files WHERE id = ? AND user_id = ?", [id, userId]);
}

async function rowsFor(db: SqlDb, userId: number, ids: string[]): Promise<MailFileRow[]> {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(", ");
  const rows = await db.all<MailFileRow>(`SELECT * FROM mail_files WHERE user_id = ? AND id IN (${marks})`, [userId, ...ids]);
  if (rows.length !== ids.length) throw new HttpError(400, "Un archivo del correo ya no está disponible.");
  return rows;
}

/** Checks ownership and the 20 MB cap before the message is queued. */
export async function assertFilesOwned(db: SqlDb, userId: number, html: string, attachmentIds: string[]): Promise<string[]> {
  const ids = [...new Set([...fileIdsInHtml(html), ...attachmentIds.map((id) => id.toLowerCase())])];
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "Archivo inválido.");
  }
  const rows = await rowsFor(db, userId, ids);
  assertMailSize(rows.map((row) => row.size_bytes));
  return ids;
}

/** Loads bytes, rewrites image sources to cid:, and splits inline images from documents. */
export async function resolveMailParts(
  db: SqlDb,
  userId: number | null,
  html: string | null | undefined,
  attachmentIds: string[],
): Promise<{ html?: string; parts: MailPart[] }> {
  const source = html ?? "";
  const inlineIds = new Set(fileIdsInHtml(source));
  const ids = [...new Set([...inlineIds, ...attachmentIds])];
  if (!ids.length) return { html: html || undefined, parts: [] };
  if (!userId) throw new HttpError(400, "El correo con archivos necesita un remitente.");
  const rows = await rowsFor(db, userId, ids);
  assertMailSize(rows.map((row) => row.size_bytes));
  const idToCid = new Map(rows.filter((row) => inlineIds.has(row.id)).map((row) => [row.id, row.content_id]));
  const parts: MailPart[] = [];
  for (const row of rows) {
    const loaded = await readMailFile(db, row.id);
    if (!loaded) throw new HttpError(400, "Un archivo del correo ya no está disponible.");
    const inline = inlineIds.has(row.id);
    parts.push({
      filename: row.filename,
      contentType: row.content_type,
      bytes: loaded.bytes,
      contentId: inline ? row.content_id : undefined,
      inline,
    });
  }
  return { html: html ? rewriteFileSrc(source, idToCid) : undefined, parts };
}

export function parseAttachmentIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}
