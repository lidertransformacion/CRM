import { BOOTSTRAP_ADMIN_EMAIL, isLibertarioEmail, normalizeEmail } from "@/lib/auth/email";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { normalizeRole, type Role } from "@/lib/auth/session";
import { readEnv } from "@/lib/env";
import type { SqlDb } from "@/lib/sql/types";

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  must_change_password: number;
  email_opt_out: number;
  session_version: number;
  created_at: string;
  updated_at: string;
};

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const MIN_PASSWORD = 12;

/** Shown when the bootstrap secret is missing, short, or rejected. Never includes the secret. */
export const BOOTSTRAP_ERROR = "No se pudo preparar el acceso inicial.";

export function assertPassword(password: string) {
  if (password.length < MIN_PASSWORD) {
    throw new HttpError(400, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  }
}

/** Bootstrap stores the trimmed secret. Login and resets trim the same way. */
export function normalizePassword(password: string): string {
  return password.trim();
}

export async function ensureBootstrapAdmin(db: SqlDb): Promise<void> {
  const existing = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [BOOTSTRAP_ADMIN_EMAIL]);
  if (existing) return;
  const password = normalizePassword(await readEnv("BOOTSTRAP_ADMIN_PASSWORD"));
  if (!password) return;
  try {
    if (password.length < MIN_PASSWORD) throw new Error("rejected");
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
       VALUES (?, ?, 'admin', 1, 0, 1, ?, ?)`,
      [BOOTSTRAP_ADMIN_EMAIL, await hashPassword(password), now, now],
    );
  } catch {
    throw new Error(BOOTSTRAP_ERROR);
  }
}

export async function authenticate(db: SqlDb, email: string, password: string): Promise<UserRow> {
  const normalized = normalizeEmail(email);
  const user = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", [normalized]);
  if (!user || !(await verifyPassword(normalizePassword(password), user.password_hash))) {
    throw new HttpError(401, "Correo o contraseña incorrectos.");
  }
  return { ...user, role: normalizeRole(user.role) };
}

export function parseAssignableRole(value: unknown): Role {
  if (value == null || value === "" || value === "user") return "comercial";
  if (value === "admin" || value === "comercial" || value === "legal" || value === "gerencia") return value;
  throw new HttpError(400, "Elige un rol: administrador, comercial, legal o gerencia.");
}

export async function createUser(
  db: SqlDb,
  actor: { role: Role },
  input: { email: string; password: string; role?: unknown },
): Promise<{ id: number; email: string; role: Role }> {
  if (actor.role !== "admin") throw new HttpError(403, "Solo un administrador puede crear usuarios.");
  const email = normalizeEmail(input.email ?? "");
  if (!isLibertarioEmail(email)) {
    throw new HttpError(400, "El correo debe terminar exactamente en @libertariocoffee.com.");
  }
  const password = normalizePassword(input.password ?? "");
  assertPassword(password);
  const role = parseAssignableRole(input.role);
  const now = new Date().toISOString();
  try {
    const result = await db.run(
      `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, 1, ?, ?)`,
      [email, await hashPassword(password), role, now, now],
    );
    return { id: result.lastInsertRowid, email, role };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique/i.test(message)) throw new HttpError(409, "Ese correo ya tiene usuario.");
    throw error;
  }
}

export async function changePassword(db: SqlDb, userId: number, currentPassword: string, nextPassword: string): Promise<void> {
  const current = normalizePassword(currentPassword);
  const next = normalizePassword(nextPassword);
  assertPassword(next);
  const user = await db.get<UserRow>("SELECT * FROM users WHERE id = ?", [userId]);
  if (!user) throw new HttpError(401, "unauthorized");
  if (!(await verifyPassword(current, user.password_hash))) {
    throw new HttpError(400, "La contraseña actual no coincide.");
  }
  if (current === next) throw new HttpError(400, "Elige una contraseña distinta.");
  const now = new Date().toISOString();
  await db.run(
    `UPDATE users SET password_hash = ?, must_change_password = 0, session_version = session_version + 1, updated_at = ? WHERE id = ?`,
    [await hashPassword(next), now, userId],
  );
}

/** Sets a temporary password and forces a change. Does not rotate an existing admin when the bootstrap secret changes. */
export async function setTemporaryPassword(db: SqlDb, email: string, password: string): Promise<{ email: string; sessionVersion: number }> {
  const normalized = normalizeEmail(email);
  const next = normalizePassword(password);
  assertPassword(next);
  const user = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", [normalized]);
  if (!user) throw new HttpError(404, "No hay un usuario con ese correo.");
  const now = new Date().toISOString();
  await db.run(
    `UPDATE users SET password_hash = ?, must_change_password = 1, session_version = session_version + 1, updated_at = ? WHERE id = ?`,
    [await hashPassword(next), now, user.id],
  );
  const saved = await db.get<{ session_version: number }>("SELECT session_version FROM users WHERE id = ?", [user.id]);
  return { email: normalized, sessionVersion: Number(saved?.session_version ?? user.session_version + 1) };
}

export async function resetUserPassword(
  db: SqlDb,
  actor: { role: Role },
  input: { email: string; password: string },
): Promise<{ email: string; sessionVersion: number }> {
  if (actor.role !== "admin") throw new HttpError(403, "Solo un administrador puede restablecer contraseñas.");
  return setTemporaryPassword(db, input.email, input.password);
}

export async function setEmailOptOut(db: SqlDb, userId: number, optOut: boolean): Promise<void> {
  await db.run("UPDATE users SET email_opt_out = ?, updated_at = ? WHERE id = ?", [optOut ? 1 : 0, new Date().toISOString(), userId]);
}

export async function listUsers(db: SqlDb): Promise<Omit<UserRow, "password_hash">[]> {
  const rows = await db.all<Omit<UserRow, "password_hash"> & { role: string }>(
    `SELECT id, email, role, must_change_password, email_opt_out, session_version, created_at, updated_at
     FROM users ORDER BY email`,
  );
  return rows.map((row) => ({ ...row, role: normalizeRole(row.role) }));
}

export async function userById(db: SqlDb, id: number): Promise<UserRow | undefined> {
  const row = await db.get<UserRow & { role: string }>("SELECT * FROM users WHERE id = ?", [id]);
  return row ? { ...row, role: normalizeRole(row.role) } : undefined;
}

export async function recipientOptedOut(db: SqlDb, email: string): Promise<boolean> {
  const row = await db.get<{ email_opt_out: number }>("SELECT email_opt_out FROM users WHERE email = ?", [normalizeEmail(email)]);
  return !!row && row.email_opt_out === 1;
}
