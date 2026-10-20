import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { authenticate, createUser, deactivateUser, HttpError, listUsers } from "@/lib/auth/users";
import { openDatabase } from "@/lib/db";
import { wrapDatabaseSync } from "@/lib/sql/node";

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-users-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

describe("deactivate users", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
  });

  it("lets an admin deactivate someone else, end the session, and drop Gmail", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const admin = await createUser(db, { role: "admin" }, { email: "admin.uno@libertariocoffee.com", password: "correct-horse-battery", role: "admin" });
    const other = await createUser(db, { role: "admin" }, { email: "persona.dos@libertariocoffee.com", password: "correct-horse-battery" });
    await db.run(
      `INSERT INTO gmail_tokens (user_id, google_email, refresh_token, connected_at, status) VALUES (?, ?, 'cipher', ?, 'connected')`,
      [other.id, other.email, new Date().toISOString()],
    );

    await expect(deactivateUser(db, { id: other.id, role: "user" }, admin.id)).rejects.toMatchObject({ status: 403 });
    await expect(deactivateUser(db, { id: admin.id, role: "admin" }, admin.id)).rejects.toMatchObject({ status: 400 });

    const removed = await deactivateUser(db, { id: admin.id, role: "admin" }, other.id);
    expect(removed).toEqual({ id: other.id, email: "persona.dos@libertariocoffee.com" });
    const row = await db.get<{ active: number; deleted_at: string | null; session_version: number }>(
      "SELECT active, deleted_at, session_version FROM users WHERE id = ?",
      [other.id],
    );
    expect(row?.active).toBe(0);
    expect(row?.deleted_at).toBeTruthy();
    expect(row?.session_version).toBe(2);
    expect(await db.get("SELECT user_id FROM gmail_tokens WHERE user_id = ?", [other.id])).toBeUndefined();
    const audit = await db.get<{ action: string; detail: string }>("SELECT action, detail FROM user_events WHERE target_user_id = ?", [other.id]);
    expect(audit).toEqual({ action: "deactivate", detail: "persona.dos@libertariocoffee.com" });
    await expect(authenticate(db, other.email, "correct-horse-battery")).rejects.toMatchObject({ status: 401 });
    const listed = await listUsers(db);
    expect(listed.map((user) => user.email)).not.toContain(other.email);
    await expect(createUser(db, { role: "admin" }, { email: other.email, password: "correct-horse-battery" })).rejects.toBeInstanceOf(HttpError);
  });

  it("refuses to remove the last active admin", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const admin = await createUser(db, { role: "admin" }, { email: "solo.admin@libertariocoffee.com", password: "correct-horse-battery", role: "admin" });
    const member = await createUser(db, { role: "admin" }, { email: "miembro@libertariocoffee.com", password: "correct-horse-battery" });
    await deactivateUser(db, { id: admin.id, role: "admin" }, member.id);
    await expect(deactivateUser(db, { id: admin.id, role: "admin" }, admin.id)).rejects.toMatchObject({ status: 400 });
    const still = await db.get<{ active: number }>("SELECT active FROM users WHERE id = ?", [admin.id]);
    expect(still?.active).toBe(1);
  });
});
