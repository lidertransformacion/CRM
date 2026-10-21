import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { can } from "@/lib/auth/permissions";
import { SESSION_COOKIE, signSession } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { canAccess, scopeForPath } from "@/lib/auth/scopes";
import { navItems } from "@/components/shell/nav";
import { openDatabase } from "@/lib/db";
import { gerenciaSnapshot } from "@/lib/gerencia/metrics";
import { legalSummary } from "@/lib/legal/summary";
import { middleware } from "@/middleware";
import { wrapDatabaseSync } from "@/lib/sql/node";

const SECRET = "test-session-secret-value";

const MENUS: Record<Role, string[]> = {
  admin: ["/", "/comites", "/pipeline", "/kpis", "/comodatos", "/clientes", "/visitas", "/legal", "/legal/drive", "/firmas", "/correos", "/gerencia"],
  comercial: ["/", "/comites", "/pipeline", "/kpis", "/comodatos", "/clientes", "/visitas", "/legal", "/legal/drive", "/firmas", "/correos", "/gerencia"],
  legal: ["/", "/legal", "/legal/drive", "/firmas", "/correos"],
  gerencia: ["/", "/legal", "/firmas", "/correos"],
};

async function cookie(role: Role) {
  process.env.SESSION_SECRET = SECRET;
  const token = await signSession({
    uid: 1,
    email: `${role}@libertariocoffee.com`,
    role,
    mustChangePassword: false,
    sv: 1,
  });
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

async function ask(role: Role, url: string, method = "GET") {
  const response = await middleware(new NextRequest(`http://localhost${url}`, { method, headers: { cookie: await cookie(role) } }));
  return response;
}

describe("role scopes", () => {
  const previous = process.env.SESSION_SECRET;
  afterEach(() => {
    if (previous == null) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  });

  it("gives each role only its menu and the same API gate", async () => {
    for (const role of Object.keys(MENUS) as Role[]) {
      expect(navItems(role).map((item) => item.href)).toEqual(MENUS[role]);
    }
    expect(navItems("legal").some((item) => item.href === "/pipeline" || item.href === "/visitas" || item.href === "/comites")).toBe(false);
    expect(navItems("gerencia").some((item) => item.href === "/legal/drive" || item.href === "/ajustes")).toBe(false);
    expect(can("comercial", "manage_users")).toBe(false);
    expect(can("admin", "manage_users")).toBe(true);
    expect(canAccess("legal", "files")).toBe(true);
    expect(canAccess("legal", "commercial")).toBe(false);
    expect(canAccess("gerencia", "contracts")).toBe(true);
    expect(canAccess("gerencia", "files")).toBe(false);
    expect(canAccess("comercial", "users")).toBe(false);
    expect(canAccess("comercial", "gerencia")).toBe(true);

    expect(scopeForPath("/api/legal/files/4", "GET")).toBe("contracts");
    expect(scopeForPath("/api/legal/files/4", "DELETE")).toBe("files");
    expect(scopeForPath("/api/legal/contracts/4/firma", "POST")).toBe("signatures");
    expect(scopeForPath("/api/users", "POST")).toBe("users");
    expect(scopeForPath("/", "GET")).toBeNull();

    const legalHome = await ask("legal", "/");
    expect(legalHome.status).toBe(200);
    const legalPipeline = await ask("legal", "/pipeline");
    expect(legalPipeline.status).toBe(307);
    expect(new URL(legalPipeline.headers.get("location") || "", "http://localhost").pathname).toBe("/sin-acceso");
    expect((await ask("legal", "/api/visits")).status).toBe(403);
    expect((await ask("legal", "/api/committee")).status).toBe(403);
    expect((await ask("legal", "/api/leads")).status).toBe(403);
    expect((await ask("legal", "/api/users", "POST")).status).toBe(403);
    expect((await ask("legal", "/api/correos")).status).toBe(200);
    expect((await ask("legal", "/api/legal/contracts")).status).toBe(200);
    expect((await ask("legal", "/api/legal/drive")).status).toBe(200);
    expect((await ask("legal", "/firmas")).status).toBe(200);
    expect((await ask("legal", "/cuenta")).status).toBe(200);

    expect((await ask("gerencia", "/gerencia")).status).toBe(200);
    expect((await ask("gerencia", "/legal")).status).toBe(200);
    expect((await ask("gerencia", "/api/legal/files/9")).status).toBe(200);
    expect((await ask("gerencia", "/legal/drive")).status).toBe(307);
    expect((await ask("gerencia", "/api/legal/contracts", "POST")).status).toBe(403);
    expect((await ask("gerencia", "/api/pipeline")).status).toBe(403);
    expect((await ask("gerencia", "/visitas")).status).toBe(307);
    expect((await ask("gerencia", "/api/users")).status).toBe(403);
    expect((await ask("gerencia", "/api/mail/favorites")).status).toBe(200);

    expect((await ask("comercial", "/pipeline")).status).toBe(200);
    expect((await ask("comercial", "/gerencia")).status).toBe(200);
    expect((await ask("comercial", "/api/visits")).status).toBe(200);
    expect((await ask("comercial", "/api/users")).status).toBe(403);
    expect((await ask("comercial", "/ajustes")).status).toBe(307);
    expect((await ask("admin", "/ajustes")).status).toBe(200);
    expect((await ask("admin", "/api/users", "DELETE")).status).toBe(200);
    expect((await ask("admin", "/api/admin/seed", "POST")).status).toBe(200);
  });

  it("builds the legal summary and the pipeline projection from stored rows", async () => {
    const file = path.join(os.tmpdir(), `crm-scope-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
    const db = wrapDatabaseSync(await openDatabase(file));
    const now = "2026-10-20T12:00:00.000Z";
    await db.run(
      `INSERT INTO users (email, password_hash, role, must_change_password, email_opt_out, session_version, created_at, updated_at)
       VALUES ('legal@libertariocoffee.com', 'x', 'legal', 0, 0, 1, ?, ?)`,
      [now, now],
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, salesperson, customer, expected_revenue, probability, expected_close, won_status, active, edited_locally, sync_state, missing_from_odoo)
       VALUES ('L1', 'Norte', 'Nuevo', 'ana', 'Cafe', 1000000, 50, '2026-11-01', 'pendiente', 1, 0, 'synced', 0)`,
    );
    await db.run(
      `INSERT INTO leads (import_key, name, stage, salesperson, customer, expected_revenue, probability, expected_close, won_status, active, edited_locally, sync_state, missing_from_odoo)
       VALUES ('L2', 'Sur', 'Nuevo', 'ana', 'Sur', 400000, NULL, '2027-01-01', 'pendiente', 1, 0, 'synced', 0)`,
    );
    await db.run(
      `INSERT INTO contracts (title, type, country, status, end_date, renewal_notice_days, owner_id, created_at, updated_at)
       VALUES ('Comodato', 'comodato', 'CO', 'active', '2026-10-25', 30, 1, ?, ?)`,
      [now, now],
    );
    const contractId = (await db.get<{ id: number }>("SELECT id FROM contracts"))!.id;
    await db.run(
      `INSERT INTO contract_novedades (contract_id, kind, body, created_by, created_at) VALUES (?, 'nota', 'Cambio de sede', 1, ?)`,
      [contractId, now],
    );
    const actor = { uid: 1, email: "legal@libertariocoffee.com", role: "legal" as const, ip: null, userAgent: null };
    const summary = await legalSummary(db, actor);
    expect(summary.expiring.map((row) => row.title)).toEqual(["Comodato"]);
    expect(summary.recentNotes[0]?.body).toBe("Cambio de sede");
    expect(summary.recentContracts[0]?.end_date).toBe("2026-10-25");

    const snapshot = await gerenciaSnapshot(db, { ...actor, role: "gerencia" }, new Date("2026-10-21T00:00:00.000Z"));
    expect(snapshot.openDeals).toBe(2);
    expect(snapshot.pipelineValue).toBe(1_400_000);
    expect(snapshot.projection.weighted).toBe(500_000);
    expect(snapshot.projection.missingProbability).toBe(1);
    expect(snapshot.projection.closingSoon).toBe(1);
    expect(snapshot.projection.closingSoonValue).toBe(1_000_000);
    expect(snapshot.projection.byStage).toEqual([{ stage: "Nuevo", count: 2, value: 1_400_000 }]);
    fs.rmSync(file, { force: true });
  });
});
