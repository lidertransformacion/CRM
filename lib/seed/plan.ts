import { buildSeedCommittee } from "@/lib/committee/seed-data";
import { parseCsv } from "@/lib/csv";
import { assetNumber, canonicalCategory, canonicalSupplier, CITIES, SITES, storeCode } from "@/lib/equipment/catalog";
import { knownClients, splitLocation } from "@/lib/equipment/clients";
import { parseHours, parseWarranty } from "@/lib/equipment/warranty";
import { EMAIL_TEMPLATES } from "@/lib/emails/templates";
import { loadImportBytes, loadImportText } from "@/lib/import/load";
import { assignLeadKeys, mapActivityRow, mapLeadRow, mapTeamRows } from "@/lib/odoo/map";
import { STAGES } from "@/lib/odoo/stages";
import { readXlsxBuffer } from "@/lib/odoo/xlsx";
import path from "node:path";
import { snapshotFromCsv } from "@/lib/sheets/csv";

export type SeedExpected = { leads: number; activities: number; teams: number; equipment: number };

export type SeedPlan = {
  expected: SeedExpected;
  committee: unknown[];
  leads: unknown[][];
  activities: unknown[][];
  teams: unknown[][];
  members: unknown[][];
  suppliers: unknown[][];
  equipment: unknown[][];
  catalogs: unknown[][];
  templates: unknown[][];
  stages: unknown[][];
};

let cached: Promise<SeedPlan> | null = null;

export function loadSeedPlan(): Promise<SeedPlan> {
  if (!cached) {
    cached = buildSeedPlan().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

async function buildSeedPlan(): Promise<SeedPlan> {
  const root = path.join(process.cwd(), "data", "imports");
  const files = {
    leads: path.join(root, "crm_leads.xlsx"),
    activities: path.join(root, "crm_activities.xlsx"),
    teams: path.join(root, "crm_teams.xlsx"),
  };
  const leadRows = readXlsxBuffer(await loadImportBytes(files.leads), files.leads).map(mapLeadRow).filter((lead) => lead.name);
  const keyed = assignLeadKeys(leadRows);
  const activities = readXlsxBuffer(await loadImportBytes(files.activities), files.activities).map(mapActivityRow);
  const teams = mapTeamRows(readXlsxBuffer(await loadImportBytes(files.teams), files.teams));
  const byName = new Map<string, { importKey: string; salesperson: string }[]>();
  const leads: unknown[][] = [];
  const salespeople = new Set<string>();
  for (const { lead, importKey } of keyed) {
    leads.push([
      importKey,
      lead.name,
      lead.type,
      lead.stage,
      lead.team,
      lead.salesperson,
      lead.customer,
      lead.expectedRevenue,
      lead.probability,
      lead.createdAt,
      lead.expectedClose,
      lead.closedAt,
      lead.wonStatus,
      lead.active ? 1 : 0,
      lead.lossReason,
      lead.tags,
      lead.nextActivityType,
      lead.nextActivitySummary,
      lead.nextActivityDeadline,
      lead.odooId,
    ]);
    const list = byName.get(lead.name) ?? [];
    list.push({ importKey, salesperson: lead.salesperson });
    byName.set(lead.name, list);
    if (lead.salesperson) salespeople.add(lead.salesperson);
  }
  const activityRows = activities.map((activity) => {
    const candidates = byName.get(activity.documentName) ?? [];
    let match = candidates.length === 1 ? candidates[0] : null;
    if (!match && candidates.length > 1) {
      const byPerson = candidates.filter((candidate) => candidate.salesperson === activity.assignee);
      if (byPerson.length === 1) match = byPerson[0];
    }
    return [
      activity.odooLeadId,
      activity.documentName,
      activity.summary,
      activity.activityType,
      activity.deadline,
      activity.state,
      activity.createdAt,
      activity.note,
      activity.assignee,
      match?.importKey ?? null,
    ];
  });
  const teamRows = teams.map((team) => [team.name, team.leader, team.active ? 1 : 0, team.company]);
  const members = teams.flatMap((team) => team.members.map((member) => [team.name, member]));
  const snapshot = snapshotFromCsv(await loadImportText("listado_equipos.csv"));
  const suppliers = parseCsv(await loadImportText("info_proveedores.csv"));
  const headers = suppliers[0] ?? [];
  const supplierRows: unknown[][] = [];
  const catalog = new Map<string, string[]>();
  const addCatalog = (kind: string, value: string | null | undefined) => {
    const text = (value ?? "").trim();
    if (!text) return;
    const list = catalog.get(kind) ?? [];
    if (!list.includes(text)) list.push(text);
    catalog.set(kind, list);
  };
  for (const cells of suppliers.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header.trim(), (cells[index] ?? "").trim()]));
    const name = record["Nombre"] ?? "";
    if (!name) continue;
    const odoo = record["Nombre Odoo"] ?? "";
    const nit = record["NIT"] ?? "";
    const email = record["Correo Electronico Facturacion"] ?? "";
    supplierRows.push([name, odoo, nit, email, /revisar/i.test(odoo) || !nit ? 1 : 0]);
    addCatalog("supplier", canonicalSupplier(name));
  }
  const seenSerials = new Set<string>();
  const equipment: unknown[][] = [];
  const now = new Date().toISOString();
  for (const [index, row] of snapshot.rows.entries()) {
    if (seenSerials.has(row.serial)) continue;
    seenSerials.add(row.serial);
    const siteId = row.cells["ID"] ?? "";
    const seq = Number(row.cells.idnum || "0");
    const category = canonicalCategory(row.cells["Categoría del equipo"]);
    const supplier = canonicalSupplier(row.cells["Proveedor"]);
    const warranty = parseWarranty(row.cells["Fecha expiración Garantía"]);
    const hours = parseHours(row.cells["Duracción Mantenimiento [horas]"]);
    const everyRaw = row.cells["Frecuencia Mantenimiento [dias]"] ?? "";
    const location = splitLocation(row.cells["Ubicación Comercial cliente hospitality"]);
    const status = location.client || location.address ? "en_comodato" : "en_tienda";
    equipment.push([
      row.serial,
      row.serial,
      assetNumber(index + 1),
      (row.cells["Nombre del equipo"] ?? "").trim(),
      category,
      siteId,
      seq,
      storeCode(siteId, seq),
      supplier,
      row.cells["Referencia de Proveedor"] ?? "",
      row.cells["Modelo"] ?? "",
      warranty.until,
      warranty.state,
      warranty.raw,
      everyRaw ? Number(everyRaw) : null,
      hours.min,
      hours.max,
      row.cells["Duracción Mantenimiento [horas]"] ?? "",
      location.client,
      location.address,
      location.city,
      location.citySource,
      row.cells["Ubicación Comercial cliente hospitality"] ?? "",
      status,
      JSON.stringify(row.cells),
      now,
      now,
    ]);
    addCatalog("category", category);
    addCatalog("supplier", supplier);
    addCatalog("client", location.client);
    addCatalog("city", location.city);
  }
  for (const client of knownClients()) addCatalog("client", client);
  for (const city of CITIES) addCatalog("city", city);
  for (const site of SITES) addCatalog("site", site.id);
  for (const seller of salespeople) addCatalog("salesperson", seller);
  const catalogs = [...catalog.entries()].flatMap(([kind, values]) => values.map((value, index) => [kind, value, index + 1]));
  const doc = buildSeedCommittee();
  return {
    expected: { leads: leads.length, activities: activityRows.length, teams: teamRows.length, equipment: equipment.length },
    committee: [doc.committee.number, doc.committee.heldOn, JSON.stringify(doc), now],
    leads,
    activities: activityRows,
    teams: teamRows,
    members,
    suppliers: supplierRows,
    equipment,
    catalogs,
    templates: EMAIL_TEMPLATES.map((template) => [template.id, template.name, template.subject, template.body, template.sortOrder]),
    stages: STAGES.map((stage) => [stage.name, stage.position, stage.isWon ? 1 : 0, stage.isLost ? 1 : 0, stage.teamRestriction, stage.short]),
  };
}
