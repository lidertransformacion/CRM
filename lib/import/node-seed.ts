import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "@/lib/csv";
import { assetNumber, canonicalCategory, canonicalSupplier, CITIES, SITES, storeCode } from "@/lib/equipment/catalog";
import { knownClients, splitLocation } from "@/lib/equipment/clients";
import { fingerprintFromCells, internalIdFor } from "@/lib/equipment/identity";
import { parseHours, parseWarranty } from "@/lib/equipment/warranty";
import { assignLeadKeys, mapActivityRow, mapLeadRow, mapTeamRows } from "@/lib/odoo/map";
import type { OdooCrmAdapter } from "@/lib/odoo/adapter";
import { queueOutbound } from "@/lib/odoo/outbound";
import { readXlsxRows } from "@/lib/odoo/xlsx";
import { snapshotFromCsv } from "@/lib/sheets/csv";
import type { SqlDb } from "@/lib/sql/types";

export function defaultOdooPaths() {
  const root = path.join(process.cwd(), "data", "imports");
  return {
    leads: path.join(root, "crm_leads.xlsx"),
    activities: path.join(root, "crm_activities.xlsx"),
    teams: path.join(root, "crm_teams.xlsx"),
  };
}

async function catalog(db: SqlDb, kind: string, value: string) {
  if (!value) return;
  const count = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM catalogs WHERE kind = ?", [kind]);
  await db.run("INSERT INTO catalogs (kind, value, sort_order) VALUES (?, ?, ?) ON CONFLICT(kind, value) DO NOTHING", [
    kind,
    value,
    (count?.n ?? 0) + 1,
  ]);
}

export async function importOdooFiles(db: SqlDb, files: { leads: string; activities: string; teams: string }) {
  const edits = await db.all<{ import_key: string; patch_json: string }>("SELECT import_key, patch_json FROM lead_edits");
  const leadRows = readXlsxRows(files.leads).map(mapLeadRow).filter((lead) => lead.name);
  const keyed = assignLeadKeys(leadRows);
  const activities = readXlsxRows(files.activities).map(mapActivityRow);
  const teams = mapTeamRows(readXlsxRows(files.teams));
  await db.exec("BEGIN");
  try {
    await db.exec("DELETE FROM activities; DELETE FROM leads; DELETE FROM team_members; DELETE FROM teams;");
    const byName = new Map<string, { importKey: string; salesperson: string }[]>();
    const byOdooId = new Map<string, string>();
    for (const { lead, importKey } of keyed) {
      await db.run(
        `INSERT INTO leads (import_key, name, type, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, next_activity_type, next_activity_summary, next_activity_deadline, odoo_id, edited_locally, sync_state, odoo_stage, odoo_expected_revenue, odoo_probability)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'synced', ?, ?, ?)`,
        [
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
          lead.stage,
          lead.expectedRevenue,
          lead.probability,
        ],
      );
      const list = byName.get(lead.name) ?? [];
      list.push({ importKey, salesperson: lead.salesperson });
      byName.set(lead.name, list);
      if (lead.odooId) byOdooId.set(String(lead.odooId), importKey);
    }
    for (const activity of activities) {
      const byId = activity.odooLeadId ? byOdooId.get(String(activity.odooLeadId)) : undefined;
      const candidates = byName.get(activity.documentName) ?? [];
      let match = byId ?? null;
      if (!match && candidates.length === 1) match = candidates[0].importKey;
      if (!match && candidates.length > 1) {
        const byPerson = candidates.filter((candidate) => candidate.salesperson === activity.assignee);
        if (byPerson.length === 1) match = byPerson[0].importKey;
      }
      await db.run(
        `INSERT INTO activities (odoo_lead_id, odoo_activity_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          activity.odooLeadId,
          null,
          activity.documentName,
          activity.summary,
          activity.activityType,
          activity.deadline,
          activity.state,
          activity.createdAt,
          activity.note,
          activity.assignee,
          match,
        ],
      );
    }
    for (const team of teams) {
      await db.run("INSERT INTO teams (name, leader, active, company) VALUES (?, ?, ?, ?)", [team.name, team.leader, team.active ? 1 : 0, team.company]);
      for (const member of team.members) await db.run("INSERT OR IGNORE INTO team_members (team_name, member_name) VALUES (?, ?)", [team.name, member]);
    }
    for (const edit of edits) {
      const patch = JSON.parse(edit.patch_json) as Record<string, string | number | null>;
      await db.run(
        `UPDATE leads SET stage = COALESCE(?, stage), expected_revenue = COALESCE(?, expected_revenue), probability = COALESCE(?, probability), expected_close = COALESCE(?, expected_close), salesperson = COALESCE(?, salesperson), next_activity_summary = COALESCE(?, next_activity_summary), edited_locally = 1, sync_state = 'pending_local' WHERE import_key = ?`,
        [
          patch.stage ?? null,
          patch.expectedRevenue ?? null,
          patch.probability ?? null,
          patch.expectedClose ?? null,
          patch.salesperson ?? null,
          patch.nextActivitySummary ?? null,
          edit.import_key,
        ],
      );
    }
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  for (const edit of edits) {
    const lead = await db.get<{
      name: string;
      customer: string;
      salesperson: string;
      team: string;
      stage: string;
      expected_revenue: number | null;
      probability: number | null;
      expected_close: string | null;
    }>("SELECT name, customer, salesperson, team, stage, expected_revenue, probability, expected_close FROM leads WHERE import_key = ?", [
      edit.import_key,
    ]);
    if (!lead) continue;
    await queueOutbound(db, "update", edit.import_key, {
      name: lead.name,
      customer: lead.customer ?? "",
      salesperson: lead.salesperson ?? "",
      team: lead.team ?? "",
      stage: lead.stage,
      expectedRevenue: lead.expected_revenue,
      probability: lead.probability,
      expectedClose: lead.expected_close,
      type: "opportunity",
    });
  }
}

export async function seedEquipmentFiles(db: SqlDb) {
  const csvPath = path.join(process.cwd(), "data", "imports", "listado_equipos.csv");
  const suppliersPath = path.join(process.cwd(), "data", "imports", "info_proveedores.csv");
  if (!fs.existsSync(csvPath)) return;
  const snapshot = snapshotFromCsv(fs.readFileSync(csvPath, "utf8"));
  const suppliers = fs.existsSync(suppliersPath) ? parseCsv(fs.readFileSync(suppliersPath, "utf8")) : [];
  const headers = suppliers[0] ?? [];
  for (const cells of suppliers.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header.trim(), (cells[index] ?? "").trim()]));
    const name = record["Nombre"] ?? "";
    if (!name) continue;
    const odoo = record["Nombre Odoo"] ?? "";
    const nit = record["NIT"] ?? "";
    const email = record["Correo Electronico Facturacion"] ?? "";
    const needs = /revisar/i.test(odoo) || !nit ? 1 : 0;
    await db.run("INSERT OR REPLACE INTO suppliers (name, odoo_name, nit, email, needs_review) VALUES (?, ?, ?, ?, ?)", [name, odoo, nit, email, needs]);
    await catalog(db, "supplier", canonicalSupplier(name));
  }
  const now = new Date().toISOString();
  for (const [index, row] of snapshot.rows.entries()) {
    const siteId = row.cells["ID"] ?? "";
    const seq = Number(row.cells.idnum || "0");
    const category = canonicalCategory(row.cells["Categoría del equipo"]);
    const supplier = canonicalSupplier(row.cells["Proveedor"]);
    const warranty = parseWarranty(row.cells["Fecha expiración Garantía"]);
    const hours = parseHours(row.cells["Duracción Mantenimiento [horas]"]);
    const everyRaw = row.cells["Frecuencia Mantenimiento [dias]"] ?? "";
    const every = everyRaw ? Number(everyRaw) : null;
    const location = splitLocation(row.cells["Ubicación Comercial cliente hospitality"]);
    const status = location.client || location.address ? "en_comodato" : "en_tienda";
    await db.run(
      `INSERT INTO equipment (
        serial, sheet_serial, internal_id, match_fingerprint, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model,
        warranty_until, warranty_state, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label,
        client_name, address, city, city_source, location_raw, status, delivered_on, salesperson, lead_import_key, notes,
        dirty_json, sheet_cells_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '', '[]', ?, ?, ?)`,
      [
        row.serial,
        row.serial,
        internalIdFor(index + 1),
        fingerprintFromCells(row.cells),
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
        every,
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
      ],
    );
    await catalog(db, "category", category);
    if (supplier) await catalog(db, "supplier", supplier);
    if (location.client) await catalog(db, "client", location.client);
    if (location.city) await catalog(db, "city", location.city);
  }
  for (const client of knownClients()) await catalog(db, "client", client);
  for (const city of CITIES) await catalog(db, "city", city);
  for (const site of SITES) await catalog(db, "site", site.id);
  const sellers = await db.all<{ salesperson: string }>("SELECT DISTINCT salesperson FROM leads WHERE salesperson != ''");
  for (const seller of sellers) await catalog(db, "salesperson", seller.salesperson);
}

export async function seedFromFiles(db: SqlDb) {
  const files = defaultOdooPaths();
  if (fs.existsSync(files.leads) && fs.existsSync(files.activities) && fs.existsSync(files.teams)) {
    const leads = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM leads");
    if (!leads?.n) await importOdooFiles(db, files);
  }
  const equipment = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM equipment");
  if (!equipment?.n) await seedEquipmentFiles(db);
}

export function xlsxAdapter(): OdooCrmAdapter {
  return {
    source: "xlsx",
    async pullLeads() {
      return readXlsxRows(defaultOdooPaths().leads).map(mapLeadRow);
    },
    async pullActivities() {
      return readXlsxRows(defaultOdooPaths().activities).map(mapActivityRow);
    },
    async pullTeams() {
      return mapTeamRows(readXlsxRows(defaultOdooPaths().teams));
    },
  };
}
