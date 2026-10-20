import { HttpError } from "@/lib/auth/users";
import { splitAddresses } from "@/lib/mail/addresses";
import type { SqlDb } from "@/lib/sql/types";

export type MailFavorite = {
  id: number;
  name: string;
  to: string[];
  cc: string[];
};

const MAX_FAVORITES = 40;
const MAX_NAME = 80;

function decodeList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return splitAddresses(parsed.filter((item): item is string => typeof item === "string"));
  } catch {
    return [];
  }
}

export async function listFavorites(db: SqlDb, userId: number): Promise<MailFavorite[]> {
  const rows = await db.all<{ id: number; name: string; to_emails: string; cc_emails: string }>(
    `SELECT id, name, to_emails, cc_emails FROM mail_favorites WHERE user_id = ? ORDER BY name COLLATE NOCASE`,
    [userId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, to: decodeList(row.to_emails), cc: decodeList(row.cc_emails) }));
}

export async function createFavorite(
  db: SqlDb,
  userId: number,
  input: { name: string; to: string[] | string; cc?: string[] | string | null },
): Promise<MailFavorite> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME) throw new HttpError(400, "Ponle un nombre al favorito.");
  const to = splitAddresses(input.to);
  const cc = input.cc == null || input.cc === "" ? [] : splitAddresses(input.cc);
  if (!to.length) throw new HttpError(400, "El favorito necesita al menos un destinatario.");
  if (to.length + cc.length > 40) throw new HttpError(400, "Ese grupo tiene demasiados correos.");
  const count = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM mail_favorites WHERE user_id = ?", [userId]);
  if (Number(count?.n ?? 0) >= MAX_FAVORITES) throw new HttpError(400, "Ya llegaste al máximo de favoritos.");
  const now = new Date().toISOString();
  try {
    const inserted = await db.run(
      `INSERT INTO mail_favorites (user_id, name, to_emails, cc_emails, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, name, JSON.stringify(to), JSON.stringify(cc), now, now],
    );
    return { id: inserted.lastInsertRowid, name, to, cc };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique/i.test(message)) throw new HttpError(409, "Ya guardaste un favorito con ese nombre.");
    throw error;
  }
}

export async function deleteFavorite(db: SqlDb, userId: number, id: number): Promise<void> {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Favorito inválido.");
  const result = await db.run("DELETE FROM mail_favorites WHERE id = ? AND user_id = ?", [id, userId]);
  if (!result.changes) throw new HttpError(404, "Ese favorito no está en tu lista.");
}

export async function listMailDirectory(db: SqlDb): Promise<{ email: string }[]> {
  return db.all<{ email: string }>("SELECT email FROM users ORDER BY email");
}
