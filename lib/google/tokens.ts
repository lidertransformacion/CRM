import { decryptToken, encryptToken } from "@/lib/google/crypto";
import type { SqlDb } from "@/lib/sql/types";

export type GmailConnection = {
  user_id: number;
  google_email: string;
  connected_at: string;
  status: string;
};

type GmailTokenRow = GmailConnection & { refresh_token: string };

export async function gmailConnection(db: SqlDb, userId: number): Promise<GmailConnection | null> {
  const row = await db.get<GmailConnection>(
    "SELECT user_id, google_email, connected_at, status FROM gmail_tokens WHERE user_id = ?",
    [userId],
  );
  return row ?? null;
}

export async function saveGmailConnection(
  db: SqlDb,
  input: { userId: number; googleEmail: string; refreshToken: string },
): Promise<void> {
  const now = new Date().toISOString();
  const stored = await encryptToken(input.refreshToken);
  await db.run(
    `INSERT INTO gmail_tokens (user_id, google_email, refresh_token, connected_at, status)
     VALUES (?, ?, ?, ?, 'connected')
     ON CONFLICT(user_id) DO UPDATE SET
       google_email = excluded.google_email,
       refresh_token = excluded.refresh_token,
       connected_at = excluded.connected_at,
       status = 'connected'`,
    [input.userId, input.googleEmail, stored, now],
  );
}

export async function markGmailDisconnected(db: SqlDb, userId: number): Promise<void> {
  await db.run("UPDATE gmail_tokens SET status = 'disconnected' WHERE user_id = ?", [userId]);
}

export async function deleteGmailConnection(db: SqlDb, userId: number): Promise<void> {
  await db.run("DELETE FROM gmail_tokens WHERE user_id = ?", [userId]);
}

/** Decrypts the refresh token only for a connected row. Callers must not log it. */
export async function connectedRefreshToken(db: SqlDb, userId: number): Promise<{ googleEmail: string; refreshToken: string } | null> {
  const row = await db.get<GmailTokenRow>(
    "SELECT user_id, google_email, refresh_token, connected_at, status FROM gmail_tokens WHERE user_id = ? AND status = 'connected'",
    [userId],
  );
  if (!row?.refresh_token) return null;
  return { googleEmail: row.google_email, refreshToken: await decryptToken(row.refresh_token) };
}
