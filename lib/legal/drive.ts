import { can } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/auth/users";
import type { Actor } from "@/lib/legal/access";
import { recordAudit } from "@/lib/legal/audit";
import { legalFilesBucket, MAX_PDF_BYTES, sha256Hex, type LegalBucket, type LegalObject } from "@/lib/legal/storage";
import { releaseBytes, reserveBytes } from "@/lib/storage/quota";
import type { SqlDb } from "@/lib/sql/types";

export type FolderRow = {
  id: number;
  parent_id: number | null;
  name: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FileKind = "upload" | "contract_original" | "contract_signed" | "certificate";

export type FileRow = {
  id: number;
  folder_id: number | null;
  name: string;
  r2_key: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  kind: FileKind;
  created_by: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const FILE_COLUMNS = "id, folder_id, name, r2_key, mime, size_bytes, sha256, kind, created_by, created_at, updated_at, deleted_at";

export function cleanName(value: string, label: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 180) throw new HttpError(400, `${label} debe tener entre 1 y 180 caracteres.`);
  if (/[/\\]/.test(name)) throw new HttpError(400, `${label} no puede incluir barras.`);
  return name;
}

export function assertPdfUpload(name: string, mime: string, size: number) {
  if (size <= 0) throw new HttpError(400, "El archivo está vacío.");
  if (size > MAX_PDF_BYTES) throw new HttpError(400, "El PDF no puede pasar de 25 MB.");
  const type = mime.trim().toLowerCase();
  const pdfMime = type === "" || type === "application/pdf" || type === "application/x-pdf";
  if (!name.toLowerCase().endsWith(".pdf") || !pdfMime) throw new HttpError(400, "Solo se aceptan archivos PDF.");
}

function requireManage(actor: Actor) {
  if (!can(actor.role, "manage_files")) throw new HttpError(403, "Solo Legal y administración gestionan las carpetas.");
}

function requireView(actor: Actor) {
  if (!can(actor.role, "view_contracts")) throw new HttpError(403, "No puedes ver los contratos.");
}

async function bucketOrThrow(): Promise<LegalBucket> {
  const bucket = await legalFilesBucket();
  if (!bucket) throw new HttpError(503, "El almacén de contratos no está configurado. Falta el binding LEGAL_FILES.");
  return bucket;
}

async function liveFolder(db: SqlDb, id: number): Promise<FolderRow> {
  const folder = await db.get<FolderRow>("SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL", [id]);
  if (!folder) throw new HttpError(404, "No está esa carpeta.");
  return folder;
}

export async function breadcrumbs(db: SqlDb, folderId: number | null): Promise<{ id: number | null; name: string }[]> {
  const trail: { id: number | null; name: string }[] = [];
  let current = folderId;
  const seen = new Set<number>();
  while (current != null) {
    if (seen.has(current)) break;
    seen.add(current);
    const folder = await db.get<FolderRow>("SELECT * FROM folders WHERE id = ? AND deleted_at IS NULL", [current]);
    if (!folder) break;
    trail.push({ id: folder.id, name: folder.name });
    current = folder.parent_id;
  }
  trail.reverse();
  return [{ id: null, name: "Contratos" }, ...trail];
}

export async function listDrive(db: SqlDb, actor: Actor, folderId: number | null, query: string) {
  requireView(actor);
  const q = query.trim();
  if (folderId != null) await liveFolder(db, folderId);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const folders = await db.all<FolderRow>(
      "SELECT * FROM folders WHERE deleted_at IS NULL AND name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 80",
      [like],
    );
    const files = await db.all<FileRow>(
      `SELECT ${FILE_COLUMNS} FROM files WHERE deleted_at IS NULL AND name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 80`,
      [like],
    );
    return { folders, files, breadcrumbs: [{ id: null, name: "Búsqueda" }], canManage: can(actor.role, "manage_files") };
  }
  const folders = await db.all<FolderRow>(
    folderId == null
      ? "SELECT * FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY name COLLATE NOCASE"
      : "SELECT * FROM folders WHERE parent_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE",
    folderId == null ? [] : [folderId],
  );
  const files = await db.all<FileRow>(
    folderId == null
      ? `SELECT ${FILE_COLUMNS} FROM files WHERE folder_id IS NULL AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`
      : `SELECT ${FILE_COLUMNS} FROM files WHERE folder_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE`,
    folderId == null ? [] : [folderId],
  );
  return { folders, files, breadcrumbs: await breadcrumbs(db, folderId), canManage: can(actor.role, "manage_files") };
}

export async function folderTree(db: SqlDb, actor: Actor): Promise<{ id: number; parent_id: number | null; name: string }[]> {
  requireView(actor);
  return db.all("SELECT id, parent_id, name FROM folders WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE");
}

async function assertUniqueFolder(db: SqlDb, parentId: number | null, name: string, exceptId?: number) {
  const row = await db.get<{ id: number }>(
    parentId == null
      ? "SELECT id FROM folders WHERE parent_id IS NULL AND name = ? AND deleted_at IS NULL AND id != ?"
      : "SELECT id FROM folders WHERE parent_id = ? AND name = ? AND deleted_at IS NULL AND id != ?",
    parentId == null ? [name, exceptId ?? -1] : [parentId, name, exceptId ?? -1],
  );
  if (row) throw new HttpError(409, "Ya hay una carpeta con ese nombre aquí.");
}

export async function createFolder(db: SqlDb, actor: Actor, parentId: number | null, name: string): Promise<FolderRow> {
  requireManage(actor);
  const clean = cleanName(name, "El nombre");
  if (parentId != null) await liveFolder(db, parentId);
  await assertUniqueFolder(db, parentId, clean);
  const now = new Date().toISOString();
  const result = await db.run(
    "INSERT INTO folders (parent_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [parentId, clean, actor.uid, now, now],
  );
  await recordAudit(db, {
    entityType: "folder",
    entityId: result.lastInsertRowid,
    action: "folder.create",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { name: clean, parent_id: parentId },
  });
  return liveFolder(db, result.lastInsertRowid);
}

/** Used when a contract is filed. Does not require drive-management permission. */
export async function ensureFolderPath(db: SqlDb, actor: Actor, names: string[]): Promise<number | null> {
  let parent: number | null = null;
  for (const raw of names) {
    const name = cleanName(raw, "La carpeta");
    const existing: FolderRow | undefined =
      parent == null
        ? await db.get<FolderRow>("SELECT * FROM folders WHERE parent_id IS NULL AND name = ? AND deleted_at IS NULL", [name])
        : await db.get<FolderRow>("SELECT * FROM folders WHERE parent_id = ? AND name = ? AND deleted_at IS NULL", [parent, name]);
    if (existing) {
      parent = existing.id;
      continue;
    }
    const now = new Date().toISOString();
    const result = await db.run(
      "INSERT INTO folders (parent_id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [parent, name, actor.uid, now, now],
    );
    parent = result.lastInsertRowid;
  }
  return parent;
}

export async function renameFolder(db: SqlDb, actor: Actor, id: number, name: string): Promise<FolderRow> {
  requireManage(actor);
  const folder = await liveFolder(db, id);
  const clean = cleanName(name, "El nombre");
  await assertUniqueFolder(db, folder.parent_id, clean, id);
  const now = new Date().toISOString();
  await db.run("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?", [clean, now, id]);
  await recordAudit(db, {
    entityType: "folder",
    entityId: id,
    action: "folder.rename",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { from: folder.name, to: clean },
  });
  return liveFolder(db, id);
}

async function folderIsInside(db: SqlDb, folderId: number, maybeParent: number | null): Promise<boolean> {
  let current = maybeParent;
  const seen = new Set<number>();
  while (current != null) {
    if (current === folderId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    const row = await db.get<{ parent_id: number | null }>("SELECT parent_id FROM folders WHERE id = ? AND deleted_at IS NULL", [current]);
    current = row?.parent_id ?? null;
    if (!row) return false;
  }
  return false;
}

export async function moveFolder(db: SqlDb, actor: Actor, id: number, parentId: number | null): Promise<FolderRow> {
  requireManage(actor);
  const folder = await liveFolder(db, id);
  if (parentId != null) await liveFolder(db, parentId);
  if (await folderIsInside(db, id, parentId)) throw new HttpError(400, "No puedes mover una carpeta dentro de sí misma.");
  await assertUniqueFolder(db, parentId, folder.name, id);
  const now = new Date().toISOString();
  await db.run("UPDATE folders SET parent_id = ?, updated_at = ? WHERE id = ?", [parentId, now, id]);
  await recordAudit(db, {
    entityType: "folder",
    entityId: id,
    action: "folder.move",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { from: folder.parent_id, to: parentId },
  });
  return liveFolder(db, id);
}

export async function deleteFolder(db: SqlDb, actor: Actor, id: number): Promise<void> {
  requireManage(actor);
  await liveFolder(db, id);
  const child = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM folders WHERE parent_id = ? AND deleted_at IS NULL", [id]);
  const files = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM files WHERE folder_id = ? AND deleted_at IS NULL", [id]);
  if ((child?.n ?? 0) > 0 || (files?.n ?? 0) > 0) throw new HttpError(400, "Vacía la carpeta antes de eliminarla.");
  const now = new Date().toISOString();
  await db.run("UPDATE folders SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  await recordAudit(db, {
    entityType: "folder",
    entityId: id,
    action: "folder.delete",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}

export async function getFile(db: SqlDb, actor: Actor, id: number): Promise<FileRow> {
  requireView(actor);
  const file = await db.get<FileRow>(`SELECT ${FILE_COLUMNS} FROM files WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!file) throw new HttpError(404, "No está ese archivo.");
  return file;
}

export async function openFileBytes(db: SqlDb, actor: Actor, id: number): Promise<{ file: FileRow; object: LegalObject }> {
  const file = await getFile(db, actor, id);
  const object = await (await bucketOrThrow()).get(file.r2_key);
  if (!object) throw new HttpError(404, "El PDF no está en el almacén.");
  return { file, object };
}

export type StoredPdf = { name: string; mime: string; bytes: Uint8Array; kind?: FileKind; folderId?: number | null };

export async function storePdf(db: SqlDb, actor: Actor, input: StoredPdf, bucket?: LegalBucket): Promise<FileRow> {
  const target = bucket ?? (await bucketOrThrow());
  const name = cleanName(input.name.toLowerCase().endsWith(".pdf") ? input.name : `${input.name}.pdf`, "El archivo");
  assertPdfUpload(name, input.mime, input.bytes.byteLength);
  if (input.folderId != null) await liveFolder(db, input.folderId);
  const sha = await sha256Hex(input.bytes);
  const key = `files/${crypto.randomUUID()}`;
  const size = input.bytes.byteLength;
  await reserveBytes(db, size);
  try {
    await target.put(key, input.bytes, { httpMetadata: { contentType: "application/pdf" } });
  } catch (error) {
    await releaseBytes(db, size);
    throw error;
  }
  const now = new Date().toISOString();
  const kind = input.kind ?? "upload";
  let result;
  try {
    result = await db.run(
    `INSERT INTO files (folder_id, name, r2_key, mime, size_bytes, sha256, kind, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?)`,
    [input.folderId ?? null, name, key, size, sha, kind, actor.uid, now, now],
  );
  } catch (error) {
    try {
      await target.delete(key);
    } catch {
      // The counter is released below even if the object is already gone.
    }
    await releaseBytes(db, size);
    throw error;
  }
  await recordAudit(db, {
    entityType: "file",
    entityId: result.lastInsertRowid,
    action: "file.upload",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { name, sha256: sha, size_bytes: input.bytes.byteLength, kind },
  });
  return getFile(db, actor, result.lastInsertRowid);
}

export async function uploadDriveFile(db: SqlDb, actor: Actor, input: StoredPdf): Promise<FileRow> {
  requireManage(actor);
  return storePdf(db, actor, { ...input, kind: "upload" });
}

export async function renameFile(db: SqlDb, actor: Actor, id: number, name: string): Promise<FileRow> {
  requireManage(actor);
  const file = await getFile(db, actor, id);
  const clean = cleanName(name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`, "El archivo");
  const now = new Date().toISOString();
  await db.run("UPDATE files SET name = ?, updated_at = ? WHERE id = ?", [clean, now, id]);
  await recordAudit(db, {
    entityType: "file",
    entityId: id,
    action: "file.rename",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { from: file.name, to: clean },
  });
  return getFile(db, actor, id);
}

export async function moveFile(db: SqlDb, actor: Actor, id: number, folderId: number | null): Promise<FileRow> {
  requireManage(actor);
  await getFile(db, actor, id);
  if (folderId != null) await liveFolder(db, folderId);
  const now = new Date().toISOString();
  await db.run("UPDATE files SET folder_id = ?, updated_at = ? WHERE id = ?", [folderId, now, id]);
  await recordAudit(db, {
    entityType: "file",
    entityId: id,
    action: "file.move",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { folder_id: folderId },
  });
  return getFile(db, actor, id);
}

export async function deleteFile(db: SqlDb, actor: Actor, id: number): Promise<void> {
  requireManage(actor);
  const file = await getFile(db, actor, id);
  const signed = await db.get<{ id: number }>(
    "SELECT id FROM contracts WHERE current_file_id = ? AND status IN ('signed', 'active')",
    [id],
  );
  if ((file.kind === "contract_signed" || signed) && actor.role !== "admin") {
    throw new HttpError(403, "Un PDF firmado no se elimina.");
  }
  const retainBytes = file.kind === "contract_signed" || file.kind === "certificate" || !!signed;
  const now = new Date().toISOString();
  await db.run("UPDATE files SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  if (!retainBytes) {
    try {
      const bucket = await bucketOrThrow();
      await bucket.delete(file.r2_key);
      await releaseBytes(db, file.size_bytes);
    } catch (error) {
      await db.run("UPDATE files SET deleted_at = NULL, updated_at = ? WHERE id = ?", [now, id]);
      throw error;
    }
  }
  await recordAudit(db, {
    entityType: "file",
    entityId: id,
    action: "file.delete",
    actorUserId: actor.uid,
    actorEmail: actor.email,
    ip: actor.ip,
    userAgent: actor.userAgent,
    data: { r2_key: file.r2_key, kept: retainBytes },
  });
}
