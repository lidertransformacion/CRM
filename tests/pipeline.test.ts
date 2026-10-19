import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { importOdooFiles, kpiData, openDatabase, seedIfEmpty, xlsxAdapter } from "@/lib/db";
import { OdooSyncAdapter } from "@/lib/odoo/adapter";
import { defaultOdooPaths } from "@/lib/db";

async function tempDb() {
  const file = path.join(os.tmpdir(), `crm-pay-line-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  const db = await openDatabase(file);
  return { file, db };
}

describe("odoo import and kpis", () => {
  const created: string[] = [];
  afterEach(() => {
    for (const file of created) fs.rmSync(file, { force: true });
    created.length = 0;
  });

  it("imports the production export and computes kpis from it", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    await seedIfEmpty(db);
    const stages = db.prepare("SELECT stage, COUNT(*) AS n FROM leads GROUP BY stage").all() as { stage: string; n: number }[];
    const counts = Object.fromEntries(stages.map((row) => [row.stage, row.n]));
    expect(db.prepare("SELECT COUNT(*) AS n FROM leads").get()).toEqual({ n: 699 });
    expect(counts["CIERRE/ GANADO"]).toBe(185);
    expect(counts["OPORTUNIDAD PERDIDA"]).toBe(183);
    expect(counts["CONTACTO/VISITA /LLAMADA EN FRIO"]).toBe(95);
    expect(counts["OFERTA COMERCIAL"]).toBe(85);
    expect(counts.LEAD).toBe(59);
    expect(counts["CLIENTE RECURRENTE"]).toBe(40);
    expect(counts["NEGOCIACIÓN"]).toBe(29);
    expect(counts["PRESENTACIÓN/DISCOVERY"]).toBe(17);
    expect(counts.IMPACTADO).toBe(6);
    expect(db.prepare("SELECT COUNT(*) AS n FROM activities").get()).toEqual({ n: 72 });
    expect(db.prepare("SELECT COUNT(*) AS n FROM teams").get()).toEqual({ n: 32 });
    const linked = db.prepare("SELECT COUNT(*) AS n FROM activities WHERE lead_import_key IS NOT NULL").get() as { n: number };
    expect(linked.n).toBeGreaterThan(60);

    const kpis = await kpiData("2026-10-15", db);
    expect(kpis.team.open).toBe(169);
    expect(kpis.team.won).toBe(182);
    expect(kpis.team.lost).toBe(309);
    expect(kpis.team.recurrente).toBe(39);
    expect(kpis.team.winRate).toBeCloseTo(182 / 491, 5);
    expect(kpis.team.expectedRevenue).toBeCloseTo(302922639.78, 0);
    expect(kpis.team.missingRevenue).toBe(96);
    expect(kpis.team.overdueActivities).toBe(72);
    expect(kpis.people.length).toBe(14);
    expect(kpis.targets).toEqual([]);
  });

  it("reapplies local lead edits after a fresh import", async () => {
    const { file, db } = await tempDb();
    created.push(file);
    await importOdooFiles(db, defaultOdooPaths());
    const lead = db.prepare("SELECT import_key, stage FROM leads LIMIT 1").get() as { import_key: string; stage: string };
    db.prepare("INSERT INTO lead_edits (import_key, patch_json) VALUES (?, ?)").run(lead.import_key, JSON.stringify({ stage: "NEGOCIACIÓN" }));
    await importOdooFiles(db, defaultOdooPaths());
    const again = db.prepare("SELECT stage, edited_locally FROM leads WHERE import_key = ?").get(lead.import_key) as {
      stage: string;
      edited_locally: number;
    };
    expect(again.stage).toBe("NEGOCIACIÓN");
    expect(again.edited_locally).toBe(1);
    expect(lead.stage).not.toBe("");
  });

  it("does not call Odoo from the phase-2 adapter", async () => {
    const adapter = new OdooSyncAdapter();
    const original = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;
    await expect(adapter.pullLeads()).rejects.toThrow(/not implemented/);
    expect(called).toBe(false);
    const xlsx = xlsxAdapter();
    expect(xlsx.source).toBe("xlsx");
    const leads = await xlsx.pullLeads();
    expect(leads).toHaveLength(699);
    expect(called).toBe(false);
    globalThis.fetch = original;
    dbUnused();
  });
});

function dbUnused() {
  return null as unknown as DatabaseSync;
}
