import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_ADMIN_EMAIL } from "@/lib/auth/email";
import { getDb, seedIfEmpty } from "@/lib/db";
import { resetSqlCache } from "@/lib/sql";

describe("request setup", () => {
  const previous = {
    CRM_DB_PATH: process.env.CRM_DB_PATH,
    BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  };
  const created: string[] = [];

  afterEach(() => {
    resetSqlCache();
    for (const file of created) fs.rmSync(file, { force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("bootstraps and advances the seed on every request in the same isolate", async () => {
    const file = path.join(os.tmpdir(), `crm-setup-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    created.push(file);
    process.env.CRM_DB_PATH = file;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    resetSqlCache();

    const db = await getDb();
    const firstCursor = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_cursor'");
    await db.run("DELETE FROM users");
    expect(await db.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 0 });

    await getDb();
    const secondCursor = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_cursor'");
    const user = await db.get<{ email: string; must_change_password: number; role: string }>(
      "SELECT email, must_change_password, role FROM users",
    );
    expect(secondCursor?.value).not.toBe(firstCursor?.value);
    expect(user).toEqual({ email: BOOTSTRAP_ADMIN_EMAIL, must_change_password: 1, role: "admin" });
  });

  it("skips seed checks in the same isolate after seed_complete is set", async () => {
    const file = path.join(os.tmpdir(), `crm-setup-done-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    created.push(file);
    process.env.CRM_DB_PATH = file;
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    resetSqlCache();

    await seedIfEmpty();
    resetSqlCache();
    const db = await getDb();
    const cursor = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'seed_cursor'");
    await db.run("DELETE FROM users");
    await getDb();
    expect(await db.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 0 });
    expect(await db.get("SELECT value FROM app_settings WHERE key = 'seed_cursor'")).toEqual(cursor);
    const index = await db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'leads_stage'");
    expect(index?.name).toBe("leads_stage");

    resetSqlCache();
    await getDb();
    const user = await db.get<{ email: string; must_change_password: number; role: string }>(
      "SELECT email, must_change_password, role FROM users",
    );
    expect(user).toEqual({ email: BOOTSTRAP_ADMIN_EMAIL, must_change_password: 1, role: "admin" });
  });
});
