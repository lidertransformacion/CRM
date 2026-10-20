import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { BOOTSTRAP_ADMIN_EMAIL, isLibertarioEmail } from "@/lib/auth/email";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BOOTSTRAP_ERROR, authenticate, createUser, ensureBootstrapAdmin, HttpError, resetUserPassword } from "@/lib/auth/users";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import { openDatabase } from "@/lib/db";
import { wrapDatabaseSync } from "@/lib/sql/node";
import { middleware } from "@/middleware";

const SECRET = "test-session-secret-value";

function walkRoutes(dir: string, prefix: string): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith("(") && entry.name.endsWith(")") ? "" : entry.name.replace(/\[[^\]]+\]/g, "sample");
      routes.push(...walkRoutes(full, segment ? `${prefix}/${segment}` : prefix));
    } else if (entry.name === "page.tsx" || entry.name === "route.ts") {
      routes.push(prefix || "/");
    }
  }
  return routes;
}

async function tempSql() {
  const file = path.join(os.tmpdir(), `crm-auth-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const raw = await openDatabase(file);
  return { file, db: wrapDatabaseSync(raw) };
}

describe("company email", () => {
  it("accepts only the exact libertariocoffee.com host", () => {
    expect(isLibertarioEmail("LiderTransformacion@LibertarioCoffee.com")).toBe(true);
    expect(isLibertarioEmail("  ventas@libertariocoffee.com ")).toBe(true);
    expect(isLibertarioEmail("user@sub.libertariocoffee.com")).toBe(false);
    expect(isLibertarioEmail("user@libertariocoffee.com.evil.com")).toBe(false);
    expect(isLibertarioEmail("user@libertariocoffee.co")).toBe(false);
    expect(isLibertarioEmail("user@notlibertariocoffee.com")).toBe(false);
    expect(isLibertarioEmail("@libertariocoffee.com")).toBe(false);
    expect(isLibertarioEmail("user@libertariocoffee.com@extra.com")).toBe(false);
    expect(isLibertarioEmail("user libertario@libertariocoffee.com")).toBe(false);
  });
});

describe("bootstrap admin", () => {
  const created: string[] = [];
  const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
    if (previousPassword == null) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
  });

  it("creates only the named admin from the secret and forces a password change", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await ensureBootstrapAdmin(db);
    expect(await db.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 0 });

    process.env.BOOTSTRAP_ADMIN_PASSWORD = "short-pass";
    await expect(ensureBootstrapAdmin(db)).rejects.toThrow(BOOTSTRAP_ERROR);
    try {
      await ensureBootstrapAdmin(db);
      throw new Error("expected bootstrap to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe(BOOTSTRAP_ERROR);
      expect(message).not.toContain("short-pass");
      expect(message).not.toMatch(/12|caracteres|BOOTSTRAP/);
    }

    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    await ensureBootstrapAdmin(db);
    await ensureBootstrapAdmin(db);
    const user = await db.get<{ email: string; role: string; must_change_password: number }>(
      "SELECT email, role, must_change_password FROM users",
    );
    expect(user).toEqual({ email: BOOTSTRAP_ADMIN_EMAIL, role: "admin", must_change_password: 1 });
    expect(await db.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
  });

  it("trims the bootstrap secret and the typed password the same way", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "  correct-horse-battery\n";
    await ensureBootstrapAdmin(db);
    const user = await authenticate(db, `  ${BOOTSTRAP_ADMIN_EMAIL}  `, "  correct-horse-battery  ");
    expect(user.email).toBe(BOOTSTRAP_ADMIN_EMAIL);
    await expect(authenticate(db, BOOTSTRAP_ADMIN_EMAIL, "correct-horse-battery-no")).rejects.toMatchObject({ status: 401 });
  });

  it("leaves an existing admin in place when the bootstrap secret changes", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    await ensureBootstrapAdmin(db);
    const before = await db.get<{ password_hash: string }>("SELECT password_hash FROM users");
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "a-different-secret-value";
    await ensureBootstrapAdmin(db);
    const after = await db.get<{ password_hash: string }>("SELECT password_hash FROM users");
    expect(after).toEqual(before);
    await expect(authenticate(db, BOOTSTRAP_ADMIN_EMAIL, "a-different-secret-value")).rejects.toMatchObject({ status: 401 });
    await authenticate(db, BOOTSTRAP_ADMIN_EMAIL, "correct-horse-battery");
  });

  it("lets an admin set a temporary password that must be changed", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    await ensureBootstrapAdmin(db);
    await expect(resetUserPassword(db, { role: "comercial" }, { email: BOOTSTRAP_ADMIN_EMAIL, password: "temporary-password" })).rejects.toMatchObject({
      status: 403,
    });
    const reset = await resetUserPassword(db, { role: "admin" }, { email: BOOTSTRAP_ADMIN_EMAIL, password: "  temporary-password  " });
    expect(reset).toEqual({ email: BOOTSTRAP_ADMIN_EMAIL, sessionVersion: 2 });
    const row = await db.get<{ must_change_password: number; session_version: number }>(
      "SELECT must_change_password, session_version FROM users WHERE email = ?",
      [BOOTSTRAP_ADMIN_EMAIL],
    );
    expect(row).toEqual({ must_change_password: 1, session_version: 2 });
    await expect(authenticate(db, BOOTSTRAP_ADMIN_EMAIL, "correct-horse-battery")).rejects.toMatchObject({ status: 401 });
    const user = await authenticate(db, BOOTSTRAP_ADMIN_EMAIL, "temporary-password");
    expect(user.must_change_password).toBe(1);
  });

  it("recovers a password from the one-off script", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    await ensureBootstrapAdmin(db);
    const exec = promisify(execFile);
    const { stdout } = await exec("npx", ["tsx", "scripts/reset-password.ts", BOOTSTRAP_ADMIN_EMAIL, "script-temporary-password"], {
      cwd: process.cwd(),
      env: { ...process.env, CRM_DB_PATH: file },
    });
    expect(stdout).not.toContain("script-temporary-password");
    expect(JSON.parse(stdout)).toMatchObject({ email: BOOTSTRAP_ADMIN_EMAIL, mustChangePassword: true, sessionVersion: 2 });
    const row = await db.get<{ must_change_password: number }>("SELECT must_change_password FROM users WHERE email = ?", [BOOTSTRAP_ADMIN_EMAIL]);
    expect(row?.must_change_password).toBe(1);
    await authenticate(db, BOOTSTRAP_ADMIN_EMAIL, "script-temporary-password");
  });

  it("lets an admin create a company user and rejects everyone else", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const admin = { role: "admin" as const };
    const user = { role: "comercial" as const };
    await expect(createUser(db, user, { email: "nueva@libertariocoffee.com", password: "correct-horse-battery" })).rejects.toBeInstanceOf(HttpError);
    await expect(createUser(db, user, { email: "nueva@libertariocoffee.com", password: "correct-horse-battery" })).rejects.toMatchObject({ status: 403 });
    await expect(createUser(db, admin, { email: "nueva@gmail.com", password: "correct-horse-battery" })).rejects.toMatchObject({ status: 400 });
    await expect(createUser(db, admin, { email: "Nueva@LibertarioCoffee.com", password: "short" })).rejects.toMatchObject({ status: 400 });
    const createdUser = await createUser(db, admin, { email: "Nueva@LibertarioCoffee.com", password: "correct-horse-battery" });
    expect(createdUser).toMatchObject({ email: "nueva@libertariocoffee.com", role: "comercial" });
    const legal = await createUser(db, admin, { email: "legal@libertariocoffee.com", password: "correct-horse-battery", role: "legal" });
    expect(legal.role).toBe("legal");
    const row = await db.get<{ must_change_password: number }>("SELECT must_change_password FROM users WHERE email = ?", ["nueva@libertariocoffee.com"]);
    expect(row?.must_change_password).toBe(1);
    await expect(createUser(db, admin, { email: "nueva@libertariocoffee.com", password: "correct-horse-battery" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("middleware", () => {
  const previous = process.env.SESSION_SECRET;
  afterEach(() => {
    if (previous == null) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  });

  it("serves brand files without a session", async () => {
    process.env.SESSION_SECRET = SECRET;
    const assets = [
      "/favicon.png",
      "/apple-touch-icon.png",
      "/brand/logo-light.png",
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/maskable-512.png",
      "/manifest.webmanifest",
    ];
    for (const asset of assets) {
      const response = await middleware(new NextRequest(`http://localhost${asset}`));
      expect(response.headers.get("location"), asset).toBeNull();
      expect(response.status, asset).toBe(200);
    }
  });

  it("blocks every page and API except login", async () => {
    process.env.SESSION_SECRET = SECRET;
    const routes = walkRoutes(path.join(process.cwd(), "app"), "");
    const publicRoutes = new Set(["/login", "/api/auth/login"]);
    expect(routes).toEqual(expect.arrayContaining(["/login", "/api/auth/login", "/pipeline", "/api/leads", "/api/users"]));
    for (const route of routes) {
      const response = await middleware(new NextRequest(`http://localhost${route}`));
      if (publicRoutes.has(route)) {
        expect(response.headers.get("location"), route).toBeNull();
        continue;
      }
      if (route === "/api/auth/google/callback") {
        expect(response.status, route).toBe(307);
        const location = new URL(response.headers.get("location") || "", "http://localhost");
        expect(location.pathname, route).toBe("/login");
        expect(location.searchParams.get("next")).toBe("/cuenta");
      } else if (route.startsWith("/api/")) {
        expect(response.status, route).toBe(401);
        expect(await response.json()).toEqual({ error: "unauthorized" });
      } else {
        expect(response.status, route).toBe(307);
        const location = new URL(response.headers.get("location") || "", "http://localhost");
        expect(location.pathname, route).toBe("/login");
      }
    }
  });

  it("keeps a first-login session on the password page", async () => {
    process.env.SESSION_SECRET = SECRET;
    const token = await signSession({
      uid: 1,
      email: BOOTSTRAP_ADMIN_EMAIL,
      role: "admin",
      mustChangePassword: true,
      sv: 1,
    });
    const cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
    const blocked = await middleware(new NextRequest("http://localhost/pipeline", { headers: { cookie } }));
    expect(new URL(blocked.headers.get("location") || "", "http://localhost").pathname).toBe("/cuenta");
    const api = await middleware(new NextRequest("http://localhost/api/kpis", { headers: { cookie } }));
    expect(api.status).toBe(403);
    const cuenta = await middleware(new NextRequest("http://localhost/cuenta", { headers: { cookie } }));
    expect(cuenta.headers.get("location")).toBeNull();
    const password = await middleware(new NextRequest("http://localhost/api/auth/password", { headers: { cookie } }));
    expect(password.status).not.toBe(401);
    expect(password.status).not.toBe(403);
  });

  it("lets the Odoo browser agent through with its bearer token", async () => {
    process.env.SESSION_SECRET = SECRET;
    const previousToken = process.env.ODOO_AGENT_TOKEN;
    const token = "agent-token-value-16";
    process.env.ODOO_AGENT_TOKEN = token;
    const allowed = await middleware(
      new NextRequest("http://localhost/api/agent/ingest", { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(allowed.headers.get("location")).toBeNull();
    expect(allowed.status).not.toBe(401);
    const missing = await middleware(new NextRequest("http://localhost/api/agent/outbound"));
    expect(missing.status).toBe(401);
    const wrong = await middleware(
      new NextRequest("http://localhost/api/agent/outbound", { headers: { authorization: "Bearer not-the-token-value" } }),
    );
    expect(wrong.status).toBe(401);
    process.env.ODOO_AGENT_TOKEN = "short";
    const short = await middleware(
      new NextRequest("http://localhost/api/agent/outbound", { headers: { authorization: "Bearer short" } }),
    );
    expect(short.status).toBe(401);
    if (previousToken == null) delete process.env.ODOO_AGENT_TOKEN;
    else process.env.ODOO_AGENT_TOKEN = previousToken;
  });
});
