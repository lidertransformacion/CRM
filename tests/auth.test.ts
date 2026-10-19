import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { BOOTSTRAP_ADMIN_EMAIL, isLibertarioEmail } from "@/lib/auth/email";
import { createUser, ensureBootstrapAdmin, HttpError } from "@/lib/auth/users";
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
    await expect(ensureBootstrapAdmin(db)).rejects.toThrow(/12/);

    process.env.BOOTSTRAP_ADMIN_PASSWORD = "correct-horse-battery";
    await ensureBootstrapAdmin(db);
    await ensureBootstrapAdmin(db);
    const user = await db.get<{ email: string; role: string; must_change_password: number }>(
      "SELECT email, role, must_change_password FROM users",
    );
    expect(user).toEqual({ email: BOOTSTRAP_ADMIN_EMAIL, role: "admin", must_change_password: 1 });
    expect(await db.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
  });

  it("lets an admin create a company user and rejects everyone else", async () => {
    const { file, db } = await tempSql();
    created.push(file);
    const admin = { role: "admin" as const };
    const user = { role: "user" as const };
    await expect(createUser(db, user, { email: "nueva@libertariocoffee.com", password: "correct-horse-battery" })).rejects.toBeInstanceOf(HttpError);
    await expect(createUser(db, user, { email: "nueva@libertariocoffee.com", password: "correct-horse-battery" })).rejects.toMatchObject({ status: 403 });
    await expect(createUser(db, admin, { email: "nueva@gmail.com", password: "correct-horse-battery" })).rejects.toMatchObject({ status: 400 });
    await expect(createUser(db, admin, { email: "Nueva@LibertarioCoffee.com", password: "short" })).rejects.toMatchObject({ status: 400 });
    const createdUser = await createUser(db, admin, { email: "Nueva@LibertarioCoffee.com", password: "correct-horse-battery" });
    expect(createdUser).toMatchObject({ email: "nueva@libertariocoffee.com", role: "user" });
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
      if (route.startsWith("/api/")) {
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
});
