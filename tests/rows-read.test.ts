import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clientDirectory,
  clientTimeline,
  committeeHistory,
  currentCommittee,
  equipmentHistory,
  getEquipment,
  globalSearch,
  hourlyRate,
  kpiData,
  listEquipment,
  listLeads,
  maintenanceLogs,
  openDatabase,
  searchLeads,
  seedIfEmpty,
  updateLead,
} from "@/lib/db";
import { equipmentDesk, nextMaintenanceFor } from "@/lib/equipment/queries";
import { gerenciaSnapshot } from "@/lib/gerencia/metrics";
import { homeData } from "@/lib/home/queries";
import { listContracts } from "@/lib/legal/contracts";
import { listMySignatures, pendingForUser } from "@/lib/legal/signatures";
import { legalSummary } from "@/lib/legal/summary";
import { leadDetail } from "@/lib/pipeline/queries";
import { clearReadMemory } from "@/lib/sql/read-cache";
import { measureRows } from "@/lib/sql/rows";
import { wrapDatabaseSync } from "@/lib/sql/node";
import { ensureVisitPoints, listPoints, listVisits } from "@/lib/visits/store";
import type { DatabaseSync } from "node:sqlite";
import type { SqlDb } from "@/lib/sql/types";

const actor = { uid: 1, email: "medida@libertariocoffee.com", role: "admin" as const, ip: null, userAgent: null };
const AS_OF = "2026-10-15";

/** Steady cost after the snapshot exists. A full lead scan is about 700 rows and must fail. */
const BUDGET = 12;

describe("rows read budget", () => {
  let file = "";
  let db: DatabaseSync;
  let sql: SqlDb;
  let lead: { import_key: string; customer: string };
  let serial = "";

  beforeAll(async () => {
    file = path.join(os.tmpdir(), `crm-budget-${Date.now()}.sqlite`);
    db = await openDatabase(file);
    await seedIfEmpty(db);
    sql = wrapDatabaseSync(db);
    await ensureVisitPoints(sql);
    lead = db.prepare("SELECT import_key, customer FROM leads WHERE customer != '' LIMIT 1").get() as { import_key: string; customer: string };
    serial = (db.prepare("SELECT serial FROM equipment LIMIT 1").get() as { serial: string }).serial;
  }, 120_000);

  afterAll(() => {
    db?.close();
    if (file) fs.rmSync(file, { force: true });
  });

  async function steady(fn: () => Promise<unknown>) {
    await fn();
    clearReadMemory();
    const cold = await measureRows(fn);
    const warm = await measureRows(fn);
    return { cold: cold.rowsRead, warm: warm.rowsRead };
  }

  it("keeps each screen and route under the rows-read budget", async () => {
    const views: { name: string; run: () => Promise<unknown> }[] = [
      { name: "screen:inicio", run: () => homeData(AS_OF, sql) },
      {
        name: "screen:inicio+firmas",
        run: async () => {
          await homeData(AS_OF, sql);
          await pendingForUser(sql, 1, actor.email);
        },
      },
      { name: "screen:pipeline", run: () => listLeads(sql) },
      { name: "route:GET /api/pipeline", run: () => listLeads(sql) },
      { name: "screen:kpis", run: () => kpiData(AS_OF, sql) },
      { name: "route:GET /api/kpis", run: () => kpiData(AS_OF, sql) },
      { name: "screen:comodatos", run: () => equipmentDesk(sql) },
      { name: "route:GET /api/comodatos", run: () => equipmentDesk(sql) },
      {
        name: "screen:comodatos/[serial]",
        run: async () => {
          const equipment = await getEquipment(serial, sql);
          await Promise.all([
            equipmentHistory(serial, sql),
            maintenanceLogs(serial, sql),
            hourlyRate(sql),
            equipment ? nextMaintenanceFor(equipment, sql) : null,
          ]);
        },
      },
      { name: "screen:clientes", run: () => clientDirectory(sql) },
      { name: "route:GET /api/clients", run: () => clientDirectory(sql) },
      { name: "route:GET /api/clients?customer", run: () => clientTimeline(lead.customer, sql) },
      { name: "route:GET /api/leads?key", run: () => leadDetail(lead.import_key, sql) },
      { name: "route:GET /api/leads?q", run: () => searchLeads(lead.customer.slice(0, 4), sql) },
      { name: "route:GET /api/search?q", run: () => globalSearch(lead.customer.slice(0, 4), sql) },
      {
        name: "screen:comites",
        run: async () => {
          await currentCommittee(sql);
          await committeeHistory(sql);
        },
      },
      {
        name: "route:GET /api/committee",
        run: async () => {
          await currentCommittee(sql);
          await committeeHistory(sql);
        },
      },
      {
        name: "screen:visitas",
        run: async () => {
          await ensureVisitPoints(sql);
          await listPoints(sql);
          await listVisits(sql);
        },
      },
      { name: "screen:gerencia", run: () => gerenciaSnapshot(sql, actor, new Date("2026-10-15T12:00:00Z")) },
      { name: "screen:legal", run: () => listContracts(sql, actor, "") },
      { name: "screen:legal-resumen", run: () => legalSummary(sql, actor) },
      { name: "screen:firmas", run: () => listMySignatures(sql, 1, actor.email) },
      { name: "screen:equipos-sync", run: () => listEquipment(sql) },
    ];

    const measured: { name: string; cold: number; warm: number }[] = [];
    for (const view of views) {
      const result = await steady(view.run);
      measured.push({ name: view.name, ...result });
      expect(result.cold, view.name).toBeLessThanOrEqual(BUDGET);
      expect(result.warm, view.name).toBeLessThanOrEqual(2);
    }
    expect(measured.length).toBe(views.length);
  }, 120_000);

  it("keeps the October KPI totals after the result is cached", async () => {
    clearReadMemory();
    const first = await kpiData(AS_OF, sql);
    clearReadMemory();
    const second = await kpiData(AS_OF, sql);
    expect(second.team).toEqual(first.team);
    expect(second.team.open).toBe(169);
    expect(second.team.won).toBe(182);
    expect(second.team.lost).toBe(309);
    expect(second.team.recurrente).toBe(39);
    expect(second.team.winRate).toBeCloseTo(182 / 491, 5);
    expect(second.team.expectedRevenue).toBeCloseTo(302922639.78, 0);
    expect(second.team.missingRevenue).toBe(96);
    expect(second.team.overdueActivities).toBe(72);
    expect(second.people.length).toBe(14);
  });

  it("reuses a stored fact for a closed month instead of scanning leads", async () => {
    const asOf = "2026-09-30";
    await kpiData(asOf, sql);
    const stored = db.prepare("SELECT COUNT(*) AS n FROM kpi_period_facts WHERE period = ? AND as_of = ?").get("2026-09", asOf) as { n: number };
    expect(stored.n).toBe(1);
    clearReadMemory();
    const again = await measureRows(() => kpiData(asOf, sql));
    expect(again.rowsRead).toBeLessThanOrEqual(BUDGET);
    expect(again.value.team.open + again.value.team.won + again.value.team.lost + again.value.team.recurrente).toBe(699);
  });

  it("drops the cache when a lead is written through the app or the raw connection", async () => {
    const before = (await listLeads(sql)).find((row) => row.import_key === lead.import_key);
    expect(before).toBeTruthy();
    await updateLead(lead.import_key, { stage: "NEGOCIACIÓN" }, sql);
    const afterApp = (await listLeads(sql)).find((row) => row.import_key === lead.import_key);
    expect(afterApp?.stage).toBe("NEGOCIACIÓN");
    db.prepare("UPDATE leads SET stage = ? WHERE import_key = ?").run(before!.stage, lead.import_key);
    const afterRaw = (await listLeads(sql)).find((row) => row.import_key === lead.import_key);
    expect(afterRaw?.stage).toBe(before!.stage);
  });
});
