import os from "node:os";
import path from "node:path";
import { clientDirectory, clientTimeline, currentCommittee, committeeHistory, equipmentHistory, getEquipment, globalSearch, hourlyRate, kpiData, listEquipment, listLeads, maintenanceLogs, openDatabase, searchLeads, seedIfEmpty } from "@/lib/db";
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

const actor = { uid: 1, email: "medida@libertariocoffee.com", role: "admin" as const, ip: null, userAgent: null };

async function main() {
  const file = path.join(os.tmpdir(), `crm-reads-${Date.now()}.sqlite`);
  const db = await openDatabase(file);
  await seedIfEmpty(db);
  const sql = wrapDatabaseSync(db);
  const asOf = "2026-10-15";
  const lead = db.prepare("SELECT import_key, customer FROM leads WHERE customer != '' LIMIT 1").get() as { import_key: string; customer: string };
  const serial = (db.prepare("SELECT serial FROM equipment LIMIT 1").get() as { serial: string } | undefined)?.serial;
  await ensureVisitPoints(sql);

  async function view(name: string, before: number, fn: () => Promise<unknown>) {
    await fn();
    clearReadMemory();
    const cold = await measureRows(fn);
    const warm = await measureRows(fn);
    return { name, before, cold: cold.rowsRead, warm: warm.rowsRead };
  }

  const rows = [
    await view("screen:inicio", 996, () => homeData(asOf, sql)),
    await view("screen:inicio+firmas", 996, async () => {
      await homeData(asOf, sql);
      await pendingForUser(sql, 1, actor.email);
    }),
    await view("screen:pipeline", 699, () => listLeads(sql)),
    await view("route:GET /api/pipeline", 699, () => listLeads(sql)),
    await view("screen:kpis", 771, () => kpiData(asOf, sql)),
    await view("route:GET /api/kpis", 771, () => kpiData(asOf, sql)),
    await view("screen:comodatos", 303, () => equipmentDesk(sql)),
    await view("route:GET /api/comodatos", 303, () => equipmentDesk(sql)),
    await view("screen:comodatos/[serial]", 5, async () => {
      if (!serial) return null;
      const equipment = await getEquipment(serial, sql);
      await Promise.all([
        equipmentHistory(serial, sql),
        maintenanceLogs(serial, sql),
        hourlyRate(sql),
        equipment ? nextMaintenanceFor(equipment, sql) : null,
      ]);
      return equipment?.serial;
    }),
    await view("screen:clientes", 923, () => clientDirectory(sql)),
    await view("route:GET /api/clients", 923, () => clientDirectory(sql)),
    await view("route:GET /api/clients?customer", 6, () => clientTimeline(lead.customer, sql)),
    await view("route:GET /api/leads?key", 2, () => leadDetail(lead.import_key, sql)),
    await view("route:GET /api/leads?q", 699, () => searchLeads(lead.customer.slice(0, 4), sql)),
    await view("route:GET /api/search?q", 2769, () => globalSearch(lead.customer.slice(0, 4), sql)),
    await view("screen:comites", 3, async () => {
      await currentCommittee(sql);
      await committeeHistory(sql);
    }),
    await view("route:GET /api/committee", 3, async () => {
      const current = await currentCommittee(sql);
      await committeeHistory(sql);
      return current.doc.committee.number;
    }),
    await view("screen:visitas", 142, async () => {
      await ensureVisitPoints(sql);
      await listPoints(sql);
      await listVisits(sql);
    }),
    await view("screen:gerencia", 701, async () => {
      await gerenciaSnapshot(sql, actor, new Date("2026-10-15T12:00:00Z"));
    }),
    await view("screen:legal", 0, async () => {
      await listContracts(sql, actor, "");
    }),
    await view("screen:legal-resumen", 0, async () => {
      await legalSummary(sql, actor);
    }),
    await view("screen:firmas", 0, async () => {
      await listMySignatures(sql, 1, actor.email);
    }),
    await view("screen:equipos-sync", 224, () => listEquipment(sql)),
  ];

  console.log(JSON.stringify({ file, lead, serial, rows }, null, 2));
  db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
