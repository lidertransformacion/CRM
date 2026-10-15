import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildSeedCommittee } from "@/lib/committee/seed-data";
import { applyAction, createNextCommittee } from "@/lib/committee/mutate";
import { cohortsFromDocs, diffDocuments } from "@/lib/committee/compare";
import type { CommitteeAction, CommitteeDoc } from "@/lib/committee/types";
import { parseCsv } from "@/lib/csv";
import { assetNumber, canonicalCategory, canonicalSupplier, CITIES, siteById, SITES, storeCode } from "@/lib/equipment/catalog";
import { knownClients, splitLocation } from "@/lib/equipment/clients";
import { maintenanceCost, parseHours, parseWarranty } from "@/lib/equipment/warranty";
import { EMAIL_TEMPLATES } from "@/lib/emails/templates";
import { computeKpis, type ActivityFact, type LeadFact } from "@/lib/kpi/compute";
import { OdooSyncAdapter, type OdooCrmAdapter } from "@/lib/odoo/adapter";
import { assignLeadKeys, mapActivityRow, mapLeadRow, mapTeamRows } from "@/lib/odoo/map";
import { STAGES } from "@/lib/odoo/stages";
import { readXlsxRows } from "@/lib/odoo/xlsx";
import { snapshotFromCsv } from "@/lib/sheets/csv";
import { planPull, planPush } from "@/lib/sheets/diff";
import type { EquipmentSyncRow } from "@/lib/sheets/types";
import { stripHtml, todayIso } from "@/lib/utils";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS committee_docs (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL,
  held_on TEXT NOT NULL,
  is_current INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
  name TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  is_won INTEGER NOT NULL,
  is_lost INTEGER NOT NULL,
  team_restriction TEXT,
  short_label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  name TEXT PRIMARY KEY,
  leader TEXT,
  active INTEGER NOT NULL,
  company TEXT
);
CREATE TABLE IF NOT EXISTS team_members (
  team_name TEXT NOT NULL,
  member_name TEXT NOT NULL,
  PRIMARY KEY (team_name, member_name)
);
CREATE TABLE IF NOT EXISTS leads (
  import_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  stage TEXT NOT NULL,
  team TEXT,
  salesperson TEXT,
  customer TEXT,
  expected_revenue REAL,
  probability REAL,
  created_at TEXT,
  expected_close TEXT,
  closed_at TEXT,
  won_status TEXT,
  active INTEGER NOT NULL,
  loss_reason TEXT,
  tags TEXT,
  next_activity_type TEXT,
  next_activity_summary TEXT,
  next_activity_deadline TEXT,
  odoo_id TEXT,
  edited_locally INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  odoo_lead_id TEXT,
  document_name TEXT,
  summary TEXT,
  activity_type TEXT,
  deadline TEXT,
  state TEXT,
  created_at TEXT,
  note TEXT,
  assignee TEXT,
  lead_import_key TEXT
);
CREATE TABLE IF NOT EXISTS lead_edits (
  import_key TEXT PRIMARY KEY,
  patch_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equipment (
  serial TEXT PRIMARY KEY,
  sheet_serial TEXT,
  asset_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_seq INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  supplier TEXT,
  supplier_reference TEXT,
  model TEXT,
  warranty_until TEXT,
  warranty_state TEXT NOT NULL,
  warranty_raw TEXT,
  maintenance_every_days INTEGER,
  hours_min REAL,
  hours_max REAL,
  hours_label TEXT,
  client_name TEXT,
  address TEXT,
  city TEXT,
  city_source TEXT,
  location_raw TEXT,
  status TEXT NOT NULL,
  delivered_on TEXT,
  salesperson TEXT,
  lead_import_key TEXT,
  notes TEXT,
  dirty_json TEXT NOT NULL DEFAULT '[]',
  sheet_cells_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equipment_history (
  id INTEGER PRIMARY KEY,
  serial TEXT NOT NULL,
  at TEXT NOT NULL,
  field TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT
);
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY,
  serial TEXT NOT NULL,
  performed_on TEXT NOT NULL,
  kind TEXT NOT NULL,
  hours REAL NOT NULL,
  parts_cost REAL NOT NULL DEFAULT 0,
  technician TEXT,
  notes TEXT,
  condition_after TEXT,
  visit_cost REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppliers (
  name TEXT PRIMARY KEY,
  odoo_name TEXT,
  nit TEXT,
  email TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS catalogs (
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (kind, value)
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kpi_targets (
  id INTEGER PRIMARY KEY,
  salesperson TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  target_value REAL NOT NULL,
  UNIQUE (salesperson, metric, period)
);
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
`;

export type EquipmentRow = {
  serial: string;
  sheet_serial: string | null;
  asset_number: string;
  name: string;
  category: string;
  site_id: string;
  site_seq: number;
  store_code: string;
  supplier: string | null;
  supplier_reference: string | null;
  model: string | null;
  warranty_until: string | null;
  warranty_state: string;
  warranty_raw: string | null;
  maintenance_every_days: number | null;
  hours_min: number | null;
  hours_max: number | null;
  hours_label: string | null;
  client_name: string | null;
  address: string | null;
  city: string | null;
  city_source: string | null;
  location_raw: string | null;
  status: string;
  delivered_on: string | null;
  salesperson: string | null;
  lead_import_key: string | null;
  notes: string | null;
  dirty_json: string;
  sheet_cells_json: string;
  created_at: string;
  updated_at: string;
};

const g = globalThis as unknown as { __crmDbs?: Map<string, DatabaseSync> };

export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export function getDb(): DatabaseSync {
  const file = process.env.CRM_DB_PATH || path.join(process.cwd(), "data", "crm.sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!g.__crmDbs) g.__crmDbs = new Map();
  let db = g.__crmDbs.get(file);
  if (!db) {
    db = openDatabase(file);
    seedIfEmpty(db);
    g.__crmDbs.set(file, db);
  }
  return db;
}

export function seedIfEmpty(db: DatabaseSync) {
  const committee = db.prepare("SELECT COUNT(*) AS n FROM committee_docs").get() as { n: number };
  if (!committee.n) seedCommittee(db);
  const leads = db.prepare("SELECT COUNT(*) AS n FROM leads").get() as { n: number };
  if (!leads.n) importOdooFiles(db, defaultOdooPaths());
  const equipment = db.prepare("SELECT COUNT(*) AS n FROM equipment").get() as { n: number };
  if (!equipment.n) seedEquipment(db);
  const templates = db.prepare("SELECT COUNT(*) AS n FROM email_templates").get() as { n: number };
  if (!templates.n) {
    const insert = db.prepare("INSERT INTO email_templates (id, name, subject, body, sort_order) VALUES (?, ?, ?, ?, ?)");
    for (const template of EMAIL_TEMPLATES) insert.run(template.id, template.name, template.subject, template.body, template.sortOrder);
  }
  const rate = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("maintenance_hourly_rate_cop") as { value: string } | undefined;
  if (!rate) db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?)").run("maintenance_hourly_rate_cop", "50000");
  for (const stage of STAGES) {
    db.prepare(
      "INSERT INTO stages (name, position, is_won, is_lost, team_restriction, short_label) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO NOTHING",
    ).run(stage.name, stage.position, stage.isWon ? 1 : 0, stage.isLost ? 1 : 0, stage.teamRestriction, stage.short);
  }
}

function seedCommittee(db: DatabaseSync) {
  const doc = buildSeedCommittee();
  db.prepare("INSERT INTO committee_docs (number, held_on, is_current, payload, created_at) VALUES (?, ?, 1, ?, ?)").run(
    doc.committee.number,
    doc.committee.heldOn,
    JSON.stringify(doc),
    new Date().toISOString(),
  );
}

export function defaultOdooPaths() {
  const root = path.join(process.cwd(), "data", "imports");
  return {
    leads: path.join(root, "crm_leads.xlsx"),
    activities: path.join(root, "crm_activities.xlsx"),
    teams: path.join(root, "crm_teams.xlsx"),
  };
}

export function importOdooFiles(db: DatabaseSync, files: { leads: string; activities: string; teams: string }) {
  const edits = db.prepare("SELECT import_key, patch_json FROM lead_edits").all() as { import_key: string; patch_json: string }[];
  const leadRows = readXlsxRows(files.leads).map(mapLeadRow).filter((lead) => lead.name);
  const keyed = assignLeadKeys(leadRows);
  const activities = readXlsxRows(files.activities).map(mapActivityRow);
  const teams = mapTeamRows(readXlsxRows(files.teams));
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM activities; DELETE FROM leads; DELETE FROM team_members; DELETE FROM teams;");
    const insertLead = db.prepare(
      `INSERT INTO leads (import_key, name, type, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, next_activity_type, next_activity_summary, next_activity_deadline, odoo_id, edited_locally)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const byName = new Map<string, { importKey: string; salesperson: string }[]>();
    for (const { lead, importKey } of keyed) {
      insertLead.run(
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
      );
      const list = byName.get(lead.name) ?? [];
      list.push({ importKey, salesperson: lead.salesperson });
      byName.set(lead.name, list);
    }
    const insertActivity = db.prepare(
      `INSERT INTO activities (odoo_lead_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const activity of activities) {
      const candidates = byName.get(activity.documentName) ?? [];
      let match = candidates.length === 1 ? candidates[0] : null;
      if (!match && candidates.length > 1) {
        const byPerson = candidates.filter((candidate) => candidate.salesperson === activity.assignee);
        if (byPerson.length === 1) match = byPerson[0];
      }
      insertActivity.run(
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
      );
    }
    const insertTeam = db.prepare("INSERT INTO teams (name, leader, active, company) VALUES (?, ?, ?, ?)");
    const insertMember = db.prepare("INSERT OR IGNORE INTO team_members (team_name, member_name) VALUES (?, ?)");
    for (const team of teams) {
      insertTeam.run(team.name, team.leader, team.active ? 1 : 0, team.company);
      for (const member of team.members) insertMember.run(team.name, member);
    }
    const update = db.prepare(
      `UPDATE leads SET stage = COALESCE(?, stage), expected_revenue = COALESCE(?, expected_revenue), probability = COALESCE(?, probability), expected_close = COALESCE(?, expected_close), salesperson = COALESCE(?, salesperson), next_activity_summary = COALESCE(?, next_activity_summary), edited_locally = 1 WHERE import_key = ?`,
    );
    for (const edit of edits) {
      const patch = JSON.parse(edit.patch_json) as Record<string, string | number | null>;
      update.run(
        patch.stage ?? null,
        patch.expectedRevenue ?? null,
        patch.probability ?? null,
        patch.expectedClose ?? null,
        patch.salesperson ?? null,
        patch.nextActivitySummary ?? null,
        edit.import_key,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function catalog(db: DatabaseSync, kind: string, value: string) {
  if (!value) return;
  const count = db.prepare("SELECT COUNT(*) AS n FROM catalogs WHERE kind = ?").get(kind) as { n: number };
  db.prepare("INSERT INTO catalogs (kind, value, sort_order) VALUES (?, ?, ?) ON CONFLICT(kind, value) DO NOTHING").run(kind, value, count.n + 1);
}

function seedEquipment(db: DatabaseSync) {
  const csvPath = path.join(process.cwd(), "data", "imports", "listado_equipos.csv");
  const snapshot = snapshotFromCsv(fs.readFileSync(csvPath, "utf8"));
  const suppliers = parseCsv(fs.readFileSync(path.join(process.cwd(), "data", "imports", "info_proveedores.csv"), "utf8"));
  const headers = suppliers[0] ?? [];
  const insertSupplier = db.prepare("INSERT OR REPLACE INTO suppliers (name, odoo_name, nit, email, needs_review) VALUES (?, ?, ?, ?, ?)");
  for (const cells of suppliers.slice(1)) {
    const record = Object.fromEntries(headers.map((header, index) => [header.trim(), (cells[index] ?? "").trim()]));
    const name = record["Nombre"] ?? "";
    if (!name) continue;
    const odoo = record["Nombre Odoo"] ?? "";
    const nit = record["NIT"] ?? "";
    const email = record["Correo Electronico Facturacion"] ?? "";
    const needs = /revisar/i.test(odoo) || !nit ? 1 : 0;
    insertSupplier.run(name, odoo, nit, email, needs);
    catalog(db, "supplier", canonicalSupplier(name));
  }
  const insert = db.prepare(
    `INSERT INTO equipment (
      serial, sheet_serial, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model,
      warranty_until, warranty_state, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label,
      client_name, address, city, city_source, location_raw, status, delivered_on, salesperson, lead_import_key, notes,
      dirty_json, sheet_cells_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, '', '[]', ?, ?, ?)`,
  );
  const now = new Date().toISOString();
  snapshot.rows.forEach((row, index) => {
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
    insert.run(
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
    );
    catalog(db, "category", category);
    if (supplier) catalog(db, "supplier", supplier);
    if (location.client) catalog(db, "client", location.client);
    if (location.city) catalog(db, "city", location.city);
  });
  for (const client of knownClients()) catalog(db, "client", client);
  for (const city of CITIES) catalog(db, "city", city);
  for (const site of SITES) catalog(db, "site", site.id);
  const sellers = db.prepare("SELECT DISTINCT salesperson FROM leads WHERE salesperson != ''").all() as { salesperson: string }[];
  for (const seller of sellers) catalog(db, "salesperson", seller.salesperson);
}

export function currentCommittee(db = getDb()): { id: number; doc: CommitteeDoc } {
  const row = db.prepare("SELECT id, payload FROM committee_docs WHERE is_current = 1").get() as { id: number; payload: string };
  return { id: row.id, doc: JSON.parse(row.payload) as CommitteeDoc };
}

export function committeeHistory(db = getDb()) {
  const docs = db.prepare("SELECT id, number, held_on, is_current FROM committee_docs ORDER BY number").all() as {
    id: number;
    number: number;
    held_on: string;
    is_current: number;
  }[];
  const current = currentCommittee(db).doc;
  const withDocs = new Set(docs.map((doc) => doc.number));
  const calendarOnly = current.calendar
    .filter((entry) => !withDocs.has(entry.number))
    .map((entry) => ({ id: null, number: entry.number, held_on: entry.heldOn, is_current: 0, snapshot: false }));
  return [
    ...calendarOnly,
    ...docs.map((doc) => ({ ...doc, snapshot: true, is_current: doc.is_current })),
  ].sort((a, b) => a.number - b.number);
}

export function committeeByNumber(number: number, db = getDb()): CommitteeDoc | null {
  const row = db.prepare("SELECT payload FROM committee_docs WHERE number = ?").get(number) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as CommitteeDoc) : null;
}

export function mutateCommittee(action: CommitteeAction, db = getDb()): CommitteeDoc {
  const current = currentCommittee(db);
  if (action.type === "newCommittee") {
    const { next } = createNextCommittee(current.doc, action.heldOn);
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE committee_docs SET is_current = 0 WHERE id = ?").run(current.id);
      db.prepare("INSERT INTO committee_docs (number, held_on, is_current, payload, created_at) VALUES (?, ?, 1, ?, ?)").run(
        next.committee.number,
        next.committee.heldOn,
        JSON.stringify(next),
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return next;
  }
  const next = applyAction(current.doc, action);
  db.prepare("UPDATE committee_docs SET payload = ?, held_on = ?, number = ? WHERE id = ?").run(
    JSON.stringify(next),
    next.committee.heldOn,
    next.committee.number,
    current.id,
  );
  return next;
}

export function allCommitteeDocs(db = getDb()): CommitteeDoc[] {
  return (db.prepare("SELECT payload FROM committee_docs ORDER BY number").all() as { payload: string }[]).map(
    (row) => JSON.parse(row.payload) as CommitteeDoc,
  );
}

export function compareCommittees(left: number, right: number, db = getDb()) {
  const docs = allCommitteeDocs(db);
  const leftDoc = docs.find((doc) => doc.committee.number === left);
  const rightDoc = docs.find((doc) => doc.committee.number === right);
  return {
    cohorts: cohortsFromDocs(docs),
    diff: leftDoc && rightDoc ? diffDocuments(leftDoc, rightDoc) : null,
    available: docs.map((doc) => ({ number: doc.committee.number, heldOn: doc.committee.heldOn })),
  };
}

export type LeadRecord = {
  import_key: string;
  name: string;
  stage: string;
  team: string;
  salesperson: string;
  customer: string;
  expected_revenue: number | null;
  probability: number | null;
  created_at: string | null;
  expected_close: string | null;
  closed_at: string | null;
  won_status: string;
  active: number;
  loss_reason: string;
  tags: string;
  next_activity_type: string;
  next_activity_summary: string;
  next_activity_deadline: string | null;
  edited_locally: number;
};

export function listLeads(db = getDb()): LeadRecord[] {
  return db.prepare("SELECT * FROM leads").all() as LeadRecord[];
}

export function updateLead(importKey: string, patch: Record<string, string | number | null>, db = getDb()) {
  const allowed = ["stage", "expectedRevenue", "probability", "expectedClose", "salesperson", "nextActivitySummary"] as const;
  const clean: Record<string, string | number | null> = {};
  for (const key of allowed) if (key in patch) clean[key] = patch[key];
  const existing = db.prepare("SELECT patch_json FROM lead_edits WHERE import_key = ?").get(importKey) as { patch_json: string } | undefined;
  const merged = { ...(existing ? JSON.parse(existing.patch_json) : {}), ...clean };
  db.prepare(
    `UPDATE leads SET
      stage = COALESCE(?, stage),
      expected_revenue = CASE WHEN ? IS NULL THEN expected_revenue ELSE ? END,
      probability = CASE WHEN ? IS NULL THEN probability ELSE ? END,
      expected_close = CASE WHEN ? IS NULL THEN expected_close ELSE ? END,
      salesperson = COALESCE(?, salesperson),
      next_activity_summary = CASE WHEN ? IS NULL THEN next_activity_summary ELSE ? END,
      edited_locally = 1
     WHERE import_key = ?`,
  ).run(
    clean.stage ?? null,
    "expectedRevenue" in clean ? 1 : null,
    clean.expectedRevenue ?? null,
    "probability" in clean ? 1 : null,
    clean.probability ?? null,
    "expectedClose" in clean ? 1 : null,
    clean.expectedClose ?? null,
    clean.salesperson ?? null,
    "nextActivitySummary" in clean ? 1 : null,
    clean.nextActivitySummary ?? null,
    importKey,
  );
  db.prepare("INSERT INTO lead_edits (import_key, patch_json) VALUES (?, ?) ON CONFLICT(import_key) DO UPDATE SET patch_json = excluded.patch_json").run(
    importKey,
    JSON.stringify(merged),
  );
}

export function searchLeads(query: string, db = getDb()) {
  const like = `%${query.trim()}%`;
  return db
    .prepare(
      `SELECT import_key, name, customer, salesperson, stage, expected_revenue FROM leads
       WHERE name LIKE ? OR customer LIKE ? OR salesperson LIKE ?
       ORDER BY customer LIMIT 20`,
    )
    .all(like, like, like) as Pick<LeadRecord, "import_key" | "name" | "customer" | "salesperson" | "stage" | "expected_revenue">[];
}

export function leadLabel(importKey: string | null, db = getDb()) {
  if (!importKey) return null;
  return (
    (db.prepare("SELECT import_key, name, customer, stage FROM leads WHERE import_key = ?").get(importKey) as
      | { import_key: string; name: string; customer: string; stage: string }
      | undefined) ?? null
  );
}

function leadFacts(db: DatabaseSync): LeadFact[] {
  return (db.prepare("SELECT import_key, name, stage, salesperson, customer, expected_revenue, probability, created_at, active FROM leads").all() as LeadRecord[]).map(
    (lead) => ({
      importKey: lead.import_key,
      name: lead.name,
      stage: lead.stage,
      salesperson: lead.salesperson,
      customer: lead.customer,
      expectedRevenue: lead.expected_revenue,
      probability: lead.probability,
      createdAt: lead.created_at,
      active: !!lead.active,
    }),
  );
}

export function kpiData(asOf = todayIso(), db = getDb()) {
  const activities = db.prepare("SELECT assignee, deadline, state FROM activities").all() as ActivityFact[];
  const bundle = computeKpis(leadFacts(db), activities, asOf);
  const targets = db.prepare("SELECT id, salesperson, metric, period, target_value FROM kpi_targets ORDER BY period, salesperson").all();
  return { ...bundle, targets, metricsReady: true };
}

export function saveTarget(input: { salesperson: string; metric: string; period: string; targetValue: number }, db = getDb()) {
  db.prepare(
    `INSERT INTO kpi_targets (salesperson, metric, period, target_value) VALUES (?, ?, ?, ?)
     ON CONFLICT (salesperson, metric, period) DO UPDATE SET target_value = excluded.target_value`,
  ).run(input.salesperson, input.metric, input.period, input.targetValue);
}

export function deleteTarget(id: number, db = getDb()) {
  db.prepare("DELETE FROM kpi_targets WHERE id = ?").run(id);
}

export function listEquipment(db = getDb()): EquipmentRow[] {
  return db.prepare("SELECT * FROM equipment ORDER BY site_id, site_seq").all() as EquipmentRow[];
}

export function getEquipment(serial: string, db = getDb()): EquipmentRow | undefined {
  return db.prepare("SELECT * FROM equipment WHERE serial = ?").get(serial) as EquipmentRow | undefined;
}

export function equipmentHistory(serial: string, db = getDb()) {
  return db.prepare("SELECT * FROM equipment_history WHERE serial = ? ORDER BY id DESC").all(serial) as {
    id: number;
    serial: string;
    at: string;
    field: string;
    from_value: string | null;
    to_value: string | null;
  }[];
}

export function maintenanceLogs(serial: string, db = getDb()) {
  return db.prepare("SELECT * FROM maintenance_logs WHERE serial = ? ORDER BY performed_on DESC, id DESC").all(serial) as {
    id: number;
    serial: string;
    performed_on: string;
    kind: string;
    hours: number;
    parts_cost: number;
    technician: string | null;
    notes: string | null;
    condition_after: string | null;
    visit_cost: number;
    created_at: string;
  }[];
}

export function hourlyRate(db = getDb()): number {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get("maintenance_hourly_rate_cop") as { value: string } | undefined;
  return Number(row?.value ?? 50000);
}

export function setHourlyRate(value: number, db = getDb()) {
  db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "maintenance_hourly_rate_cop",
    String(value),
  );
}

export function catalogValues(kind: string, db = getDb()): string[] {
  return (db.prepare("SELECT value FROM catalogs WHERE kind = ? ORDER BY sort_order, value").all(kind) as { value: string }[]).map((row) => row.value);
}

export function addCatalogValue(kind: string, value: string, db = getDb()) {
  catalog(db, kind, value.trim());
}

export type EquipmentInput = {
  serial: string;
  name: string;
  category: string;
  siteId: string;
  supplier?: string;
  supplierReference?: string;
  model?: string;
  warrantyUntil?: string | null;
  everyDays?: number | null;
  hoursMin?: number | null;
  hoursMax?: number | null;
  clientName?: string | null;
  address?: string;
  city?: string;
  status?: string;
  deliveredOn?: string | null;
  salesperson?: string | null;
  leadImportKey?: string | null;
  notes?: string;
};

function markDirty(current: string[], fields: string[]): string[] {
  return [...new Set([...current, ...fields])];
}

export function createEquipment(input: EquipmentInput, db = getDb()): EquipmentRow {
  const serial = input.serial.trim();
  if (!serial) throw new Error("El serial es obligatorio.");
  if (getEquipment(serial, db)) throw new Error("Ese serial ya existe.");
  if (!siteById(input.siteId)) throw new Error("La sede no está en la lista.");
  if (!input.name.trim()) throw new Error("El nombre es obligatorio.");
  if (!input.category.trim()) throw new Error("La categoría es obligatoria.");
  const maxAsset = db.prepare("SELECT asset_number FROM equipment ORDER BY asset_number DESC LIMIT 1").get() as { asset_number: string } | undefined;
  const assetSeq = maxAsset ? Number(maxAsset.asset_number.replace(/\D/g, "")) + 1 : 1;
  const maxSeq = db.prepare("SELECT COALESCE(MAX(site_seq), 0) AS n FROM equipment WHERE site_id = ?").get(input.siteId) as { n: number };
  const seq = Number(maxSeq.n) + 1;
  const now = new Date().toISOString();
  const status = input.status || (input.clientName ? "en_comodato" : "en_tienda");
  const warranty = parseWarranty(input.warrantyUntil ?? "");
  db.prepare(
    `INSERT INTO equipment (
      serial, sheet_serial, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model,
      warranty_until, warranty_state, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label,
      client_name, address, city, city_source, location_raw, status, delivered_on, salesperson, lead_import_key, notes,
      dirty_json, sheet_cells_json, created_at, updated_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, 'sheet', '', ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
  ).run(
    serial,
    assetNumber(assetSeq),
    input.name.trim(),
    input.category.trim(),
    input.siteId,
    seq,
    storeCode(input.siteId, seq),
    input.supplier ?? "",
    input.supplierReference ?? "",
    input.model ?? "",
    input.warrantyUntil || warranty.until,
    input.warrantyUntil ? (input.warrantyUntil < todayIso() ? "vencida" : "vigente") : "desconocida",
    input.everyDays ?? null,
    input.hoursMin ?? null,
    input.hoursMax ?? null,
    input.hoursMin != null && input.hoursMax != null ? `${input.hoursMin} - ${input.hoursMax}` : "",
    input.clientName || null,
    input.address ?? "",
    input.city ?? "",
    status,
    input.deliveredOn || null,
    input.salesperson || null,
    input.leadImportKey || null,
    input.notes ?? "",
    JSON.stringify(["serial", "name", "category", "site", "supplier", "supplier_reference", "model", "warranty", "maintenance", "hours", "location"]),
    now,
    now,
  );
  db.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'alta', '', ?)").run(serial, now, status);
  catalog(db, "category", input.category.trim());
  if (input.supplier) catalog(db, "supplier", input.supplier.trim());
  if (input.clientName) catalog(db, "client", input.clientName.trim());
  if (input.city) catalog(db, "city", input.city.trim());
  return getEquipment(serial, db)!;
}

const TRACKED: { field: string; column: keyof EquipmentRow; dirty?: string }[] = [
  { field: "name", column: "name", dirty: "name" },
  { field: "category", column: "category", dirty: "category" },
  { field: "site", column: "site_id", dirty: "site" },
  { field: "supplier", column: "supplier", dirty: "supplier" },
  { field: "client", column: "client_name", dirty: "location" },
  { field: "address", column: "address", dirty: "location" },
  { field: "city", column: "city", dirty: "location" },
  { field: "status", column: "status" },
  { field: "salesperson", column: "salesperson" },
  { field: "delivered_on", column: "delivered_on" },
];

export function updateEquipment(serial: string, input: EquipmentInput, db = getDb()): EquipmentRow {
  const current = getEquipment(serial, db);
  if (!current) throw new Error("No está ese equipo.");
  if (!siteById(input.siteId)) throw new Error("La sede no está en la lista.");
  let siteSeq = current.site_seq;
  let code = current.store_code;
  if (input.siteId !== current.site_id) {
    const maxSeq = db.prepare("SELECT COALESCE(MAX(site_seq), 0) AS n FROM equipment WHERE site_id = ?").get(input.siteId) as { n: number };
    siteSeq = Number(maxSeq.n) + 1;
    code = storeCode(input.siteId, siteSeq);
  }
  const warrantyUntil = input.warrantyUntil || null;
  const warrantyState = warrantyUntil ? (warrantyUntil < todayIso() ? "vencida" : "vigente") : current.warranty_state;
  const nextValues: Record<string, string | null> = {
    name: input.name.trim(),
    category: input.category.trim(),
    site_id: input.siteId,
    supplier: input.supplier ?? "",
    client_name: input.clientName || null,
    address: input.address ?? "",
    city: input.city ?? "",
    status: input.status || current.status,
    salesperson: input.salesperson || null,
    delivered_on: input.deliveredOn || null,
  };
  const dirty = JSON.parse(current.dirty_json) as string[];
  const now = new Date().toISOString();
  for (const tracked of TRACKED) {
    const before = current[tracked.column] == null ? "" : String(current[tracked.column]);
    const after = nextValues[tracked.column] == null ? "" : String(nextValues[tracked.column]);
    if (before !== after) {
      db.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, ?, ?, ?)").run(serial, now, tracked.field, before, after);
      if (tracked.dirty) dirty.push(tracked.dirty);
    }
  }
  if ((input.supplierReference ?? "") !== (current.supplier_reference ?? "")) dirty.push("supplier_reference");
  if ((input.model ?? "") !== (current.model ?? "")) dirty.push("model");
  if ((warrantyUntil ?? "") !== (current.warranty_until ?? "")) dirty.push("warranty");
  if ((input.everyDays ?? null) !== current.maintenance_every_days) dirty.push("maintenance");
  if ((input.hoursMin ?? null) !== current.hours_min || (input.hoursMax ?? null) !== current.hours_max) dirty.push("hours");
  if (code !== current.store_code) {
    db.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'store_code', ?, ?)").run(
      serial,
      now,
      current.store_code,
      code,
    );
  }
  db.prepare(
    `UPDATE equipment SET name=?, category=?, site_id=?, site_seq=?, store_code=?, supplier=?, supplier_reference=?, model=?,
      warranty_until=?, warranty_state=?, maintenance_every_days=?, hours_min=?, hours_max=?, hours_label=?,
      client_name=?, address=?, city=?, status=?, delivered_on=?, salesperson=?, lead_import_key=?, notes=?, dirty_json=?, updated_at=?
     WHERE serial=?`,
  ).run(
    nextValues.name,
    nextValues.category,
    nextValues.site_id,
    siteSeq,
    code,
    nextValues.supplier,
    input.supplierReference ?? "",
    input.model ?? "",
    warrantyUntil,
    warrantyState,
    input.everyDays ?? null,
    input.hoursMin ?? null,
    input.hoursMax ?? null,
    input.hoursMin != null && input.hoursMax != null ? `${input.hoursMin} - ${input.hoursMax}` : current.hours_label,
    nextValues.client_name,
    nextValues.address,
    nextValues.city,
    nextValues.status,
    nextValues.delivered_on,
    nextValues.salesperson,
    input.leadImportKey || null,
    input.notes ?? "",
    JSON.stringify(markDirty(dirty, [])),
    now,
    serial,
  );
  catalog(db, "category", input.category.trim());
  if (input.supplier) catalog(db, "supplier", input.supplier.trim());
  if (input.clientName) catalog(db, "client", input.clientName.trim());
  if (input.city) catalog(db, "city", input.city.trim());
  return getEquipment(serial, db)!;
}

export function addMaintenance(
  serial: string,
  input: { performedOn: string; kind: string; hours: number; partsCost: number; technician: string; notes: string; conditionAfter: string },
  db = getDb(),
) {
  if (!getEquipment(serial, db)) throw new Error("No está ese equipo.");
  const rate = hourlyRate(db);
  const visit = input.hours * rate + (input.partsCost || 0);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO maintenance_logs (serial, performed_on, kind, hours, parts_cost, technician, notes, condition_after, visit_cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(serial, input.performedOn, input.kind, input.hours, input.partsCost || 0, input.technician, input.notes, input.conditionAfter, visit, now);
  db.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'mantenimiento', '', ?)").run(
    serial,
    now,
    `${input.kind} · ${input.performedOn}`,
  );
}

export function toSyncRow(row: EquipmentRow): EquipmentSyncRow {
  const site = siteById(row.site_id);
  return {
    serial: row.serial,
    sheetSerial: row.sheet_serial,
    name: row.name,
    category: row.category,
    siteId: row.site_id,
    siteName: site?.name ?? row.site_id,
    siteSeq: row.site_seq,
    storeCode: row.store_code,
    supplier: row.supplier ?? "",
    supplierReference: row.supplier_reference ?? "",
    model: row.model ?? "",
    warrantyUntil: row.warranty_until,
    warrantyRaw: row.warranty_raw ?? "",
    everyDays: row.maintenance_every_days,
    hoursLabel: row.hours_label ?? "",
    locationRaw: row.location_raw ?? "",
    clientName: row.client_name,
    address: row.address ?? "",
    city: row.city ?? "",
    dirty: JSON.parse(row.dirty_json) as string[],
    sheetCells: JSON.parse(row.sheet_cells_json) as Record<string, string>,
  };
}

export function sheetPlans(db = getDb()) {
  const snapshot = snapshotFromCsv(fs.readFileSync(path.join(process.cwd(), "data", "imports", "listado_equipos.csv"), "utf8"));
  const local = listEquipment(db).map(toSyncRow);
  return {
    enabled: process.env.SHEETS_SYNC_ENABLED === "true",
    mode: process.env.SHEETS_SYNC_ENABLED === "true" ? "live" : "dry-run",
    push: planPush(local, snapshot),
    pull: planPull(local, snapshot),
  };
}

export function clientDirectory(db = getDb()) {
  const leads = db.prepare(
    `SELECT customer, COUNT(*) AS opportunities,
            SUM(CASE WHEN stage NOT IN ('CIERRE/ GANADO', 'OPORTUNIDAD PERDIDA', 'CLIENTE RECURRENTE') THEN COALESCE(expected_revenue, 0) ELSE 0 END) AS pipeline
     FROM leads WHERE customer != '' GROUP BY customer`,
  ).all() as { customer: string; opportunities: number; pipeline: number }[];
  const equipment = db.prepare(
    `SELECT client_name AS customer, COUNT(*) AS comodatos FROM equipment WHERE client_name IS NOT NULL AND client_name != '' GROUP BY client_name`,
  ).all() as { customer: string; comodatos: number }[];
  const map = new Map<string, { customer: string; opportunities: number; pipeline: number; comodatos: number }>();
  for (const lead of leads) map.set(lead.customer, { ...lead, comodatos: 0 });
  for (const item of equipment) {
    const current = map.get(item.customer) ?? { customer: item.customer, opportunities: 0, pipeline: 0, comodatos: 0 };
    current.comodatos = item.comodatos;
    map.set(item.customer, current);
  }
  return [...map.values()].sort((a, b) => b.pipeline - a.pipeline || a.customer.localeCompare(b.customer, "es"));
}

export function clientTimeline(customer: string, db = getDb()) {
  const leads = db.prepare("SELECT * FROM leads WHERE customer = ?").all(customer) as LeadRecord[];
  const keys = leads.map((lead) => lead.import_key);
  const activities = keys.length
    ? (db.prepare(`SELECT * FROM activities WHERE lead_import_key IN (${keys.map(() => "?").join(",")})`).all(...keys) as {
        activity_type: string;
        deadline: string | null;
        state: string;
        note: string;
        assignee: string;
        created_at: string | null;
        document_name: string;
      }[])
    : [];
  const equipment = db.prepare("SELECT * FROM equipment WHERE client_name = ?").all(customer) as EquipmentRow[];
  const events: { at: string; kind: string; title: string; detail: string }[] = [];
  for (const lead of leads) {
    events.push({
      at: (lead.created_at ?? "").slice(0, 10) || "1970-01-01",
      kind: "oportunidad",
      title: lead.name,
      detail: `${lead.stage} · ${lead.salesperson}`,
    });
  }
  for (const activity of activities) {
    events.push({
      at: activity.deadline || (activity.created_at ?? "").slice(0, 10) || "1970-01-01",
      kind: "actividad",
      title: activity.activity_type || "Actividad",
      detail: `${activity.state} · ${activity.assignee} · ${stripHtml(activity.note)}`.trim(),
    });
  }
  for (const item of equipment) {
    events.push({
      at: item.delivered_on || item.created_at.slice(0, 10),
      kind: "comodato",
      title: `${item.store_code} · ${item.name}`,
      detail: `${item.serial} · ${item.status}`,
    });
  }
  const doc = currentCommittee(db).doc;
  for (const topic of doc.topics) {
    for (const punto of topic.puntos) {
      const linked = [punto.leadImportKey, ...punto.pendientes.map((item) => item.leadImportKey)].filter(Boolean);
      const hit = linked.some((key) => keys.includes(key!));
      if (!hit) continue;
      for (const pendiente of punto.pendientes) {
        if (pendiente.leadImportKey && keys.includes(pendiente.leadImportKey)) {
          events.push({
            at: pendiente.dueOn || doc.committee.heldOn,
            kind: "comité",
            title: pendiente.title || punto.title,
            detail: `${topic.title} · ${pendiente.status}`,
          });
        }
      }
    }
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  return { customer, leads, equipment, events };
}

export function costFor(row: EquipmentRow, rate = hourlyRate()): ReturnType<typeof maintenanceCost> {
  return maintenanceCost({
    everyDays: row.maintenance_every_days,
    hoursMin: row.hours_min,
    hoursMax: row.hours_max,
    hourlyRate: rate,
  });
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

export { OdooSyncAdapter };
