import path from "node:path";
import { hydrateProcessEnv, readEnv } from "@/lib/env";
import { loadImportBytes, loadImportText } from "@/lib/import/load";
import { runSeed, type SeedReport } from "@/lib/seed/advance";
import { getSql, isSqlDb, type SqlDb } from "@/lib/sql";
import { applyAction, createNextCommittee } from "@/lib/committee/mutate";
import { cohortsFromDocs, diffDocuments } from "@/lib/committee/compare";
import type { CommitteeAction, CommitteeDoc } from "@/lib/committee/types";
import { assetNumber, siteById, storeCode } from "@/lib/equipment/catalog";
import { maintenanceCost, parseWarranty } from "@/lib/equipment/warranty";
import { computeKpis, type ActivityFact, type LeadFact } from "@/lib/kpi/compute";
import { OdooSyncAdapter, type OdooCrmAdapter } from "@/lib/odoo/adapter";
import { assignLeadKeys, mapActivityRow, mapLeadRow, mapTeamRows } from "@/lib/odoo/map";
import { readXlsxBuffer, readXlsxRows } from "@/lib/odoo/xlsx";
import { snapshotFromCsv } from "@/lib/sheets/csv";
import { planPull, planPush } from "@/lib/sheets/diff";
import type { EquipmentSyncRow } from "@/lib/sheets/types";
import { stripHtml, todayIso } from "@/lib/utils";


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


function plainRows<T extends object>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

type Prep = {
  get: (...params: unknown[]) => Promise<unknown>;
  all: (...params: unknown[]) => Promise<unknown[]>;
  run: (...params: unknown[]) => Promise<unknown>;
};

function facade(sql: SqlDb) {
  return {
    prepare(text: string): Prep {
      return {
        get: (...params: unknown[]) => sql.get(text, params),
        all: (...params: unknown[]) => sql.all(text, params),
        run: (...params: unknown[]) => sql.run(text, params),
      };
    },
    exec: (text: string) => sql.exec(text),
  };
}

async function rawDb(db?: unknown): Promise<SqlDb> {
  if (db === undefined || isSqlDb(db)) return db === undefined ? getSql() : db;
  const { wrapDatabaseSync } = await import("@/lib/sql/node");
  return wrapDatabaseSync(db as never);
}

async function attach(db: unknown) {
  return facade(await rawDb(db));
}

/**
 * Orders overlapping setup work. This is not a finished-setup cache:
 * every getDb() call schedules its own batch and bootstrap check.
 */
let setupTail: Promise<void> = Promise.resolve();

export async function openDatabase(file: string) {
  const { openDatabaseSync } = await import("@/lib/sql/node");
  return openDatabaseSync(file);
}

export async function getDb(): Promise<SqlDb> {
  await hydrateProcessEnv();
  const db = await getSql();
  const run = setupTail.then(() => advanceSeed(db, { maxBatches: 1 }));
  setupTail = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
  return db;
}

export async function advanceSeed(db?: unknown, options?: { maxBatches?: number; reset?: boolean }): Promise<SeedReport> {
  return runSeed(await rawDb(db), options);
}

async function sqlOf(db?: unknown) {
  if (db === undefined) return facade(await getDb());
  return attach(db);
}



export async function seedIfEmpty(db?: unknown) {
  let guard = 0;
  let report = await advanceSeed(db, { maxBatches: 40 });
  while (!report.complete && guard < 20) {
    report = await advanceSeed(db, { maxBatches: 40 });
    guard += 1;
  }
  if (!report.complete) throw new Error("La semilla no terminó.");
  return report;
}

export function defaultOdooPaths() {
  const root = path.join(process.cwd(), "data", "imports");
  return {
    leads: path.join(root, "crm_leads.xlsx"),
    activities: path.join(root, "crm_activities.xlsx"),
    teams: path.join(root, "crm_teams.xlsx"),
  };
}

export async function importOdooFiles(db: unknown, files: { leads: string; activities: string; teams: string }) {
  const sql = await sqlOf(db);
  const edits = await sql.prepare("SELECT import_key, patch_json FROM lead_edits").all() as { import_key: string; patch_json: string }[];
  const leadRows = readXlsxBuffer(await loadImportBytes(files.leads), files.leads).map(mapLeadRow).filter((lead) => lead.name);
  const keyed = assignLeadKeys(leadRows);
  const activities = readXlsxBuffer(await loadImportBytes(files.activities), files.activities).map(mapActivityRow);
  const teams = mapTeamRows(readXlsxBuffer(await loadImportBytes(files.teams), files.teams));
  await sql.exec("BEGIN");
  try {
    await sql.exec("DELETE FROM activities; DELETE FROM leads; DELETE FROM team_members; DELETE FROM teams;");
    const insertLead = await sql.prepare(
      `INSERT INTO leads (import_key, name, type, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, next_activity_type, next_activity_summary, next_activity_deadline, odoo_id, edited_locally)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    );
    const byName = new Map<string, { importKey: string; salesperson: string }[]>();
    for (const { lead, importKey } of keyed) {
      await insertLead.run(
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
    const insertActivity = await sql.prepare(
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
      await insertActivity.run(
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
    const insertTeam = await sql.prepare("INSERT INTO teams (name, leader, active, company) VALUES (?, ?, ?, ?)");
    const insertMember = await sql.prepare("INSERT OR IGNORE INTO team_members (team_name, member_name) VALUES (?, ?)");
    for (const team of teams) {
      await insertTeam.run(team.name, team.leader, team.active ? 1 : 0, team.company);
      for (const member of team.members) await insertMember.run(team.name, member);
    }
    const update = await sql.prepare(
      `UPDATE leads SET stage = COALESCE(?, stage), expected_revenue = COALESCE(?, expected_revenue), probability = COALESCE(?, probability), expected_close = COALESCE(?, expected_close), salesperson = COALESCE(?, salesperson), next_activity_summary = COALESCE(?, next_activity_summary), edited_locally = 1 WHERE import_key = ?`,
    );
    for (const edit of edits) {
      const patch = JSON.parse(edit.patch_json) as Record<string, string | number | null>;
      await update.run(
        patch.stage ?? null,
        patch.expectedRevenue ?? null,
        patch.probability ?? null,
        patch.expectedClose ?? null,
        patch.salesperson ?? null,
        patch.nextActivitySummary ?? null,
        edit.import_key,
      );
    }
    await sql.exec("COMMIT");
  } catch (error) {
    await sql.exec("ROLLBACK");
    throw error;
  }
}

async function catalog(db: unknown, kind: string, value: string) {
  const sql = await sqlOf(db);
  if (!value) return;
  const count = await sql.prepare("SELECT COUNT(*) AS n FROM catalogs WHERE kind = ?").get(kind) as { n: number };
  await sql.prepare("INSERT INTO catalogs (kind, value, sort_order) VALUES (?, ?, ?) ON CONFLICT(kind, value) DO NOTHING").run(kind, value, count.n + 1);
}

export async function currentCommittee(db?: unknown): { id: number; doc: CommitteeDoc } {
  const sql = await sqlOf(db);
  const row = await sql.prepare("SELECT id, payload FROM committee_docs WHERE is_current = 1").get() as { id: number; payload: string };
  return { id: row.id, doc: JSON.parse(row.payload) as CommitteeDoc };
}

export async function committeeHistory(db?: unknown) {
  const sql = await sqlOf(db);
  const docs = await sql.prepare("SELECT id, number, held_on, is_current FROM committee_docs ORDER BY number").all() as {
    id: number;
    number: number;
    held_on: string;
    is_current: number;
  }[];
  const current = (await currentCommittee(db)).doc;
  const withDocs = new Set(docs.map((doc) => doc.number));
  const calendarOnly = current.calendar
    .filter((entry) => !withDocs.has(entry.number))
    .map((entry) => ({ id: null, number: entry.number, held_on: entry.heldOn, is_current: 0, snapshot: false }));
  return [
    ...calendarOnly,
    ...docs.map((doc) => ({ ...doc, snapshot: true, is_current: doc.is_current })),
  ].sort((a, b) => a.number - b.number);
}

export async function committeeByNumber(number: number, db?: unknown): CommitteeDoc | null {
  const sql = await sqlOf(db);
  const row = await sql.prepare("SELECT payload FROM committee_docs WHERE number = ?").get(number) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as CommitteeDoc) : null;
}

export async function mutateCommittee(action: CommitteeAction, db?: unknown): CommitteeDoc {
  const sql = await sqlOf(db);
  const current = await currentCommittee(db);
  if (action.type === "newCommittee") {
    const { next } = createNextCommittee(current.doc, action.heldOn);
    await sql.exec("BEGIN");
    try {
      await sql.prepare("UPDATE committee_docs SET is_current = 0 WHERE id = ?").run(current.id);
      await sql.prepare("INSERT INTO committee_docs (number, held_on, is_current, payload, created_at) VALUES (?, ?, 1, ?, ?)").run(
        next.committee.number,
        next.committee.heldOn,
        JSON.stringify(next),
        new Date().toISOString(),
      );
      await sql.exec("COMMIT");
    } catch (error) {
      await sql.exec("ROLLBACK");
      throw error;
    }
    return next;
  }
  const next = applyAction(current.doc, action);
  await sql.prepare("UPDATE committee_docs SET payload = ?, held_on = ?, number = ? WHERE id = ?").run(
    JSON.stringify(next),
    next.committee.heldOn,
    next.committee.number,
    current.id,
  );
  return next;
}

export async function allCommitteeDocs(db?: unknown): CommitteeDoc[] {
  const sql = await sqlOf(db);
  return (await sql.prepare("SELECT payload FROM committee_docs ORDER BY number").all() as { payload: string }[]).map(
    (row) => JSON.parse(row.payload) as CommitteeDoc,
  );
}

export async function compareCommittees(left: number, right: number, db?: unknown) {
  const docs = await allCommitteeDocs(db);
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

export async function listLeads(db?: unknown): LeadRecord[] {
  const sql = await sqlOf(db);
  return plainRows(await sql.prepare("SELECT * FROM leads").all() as LeadRecord[]);
}

export async function updateLead(importKey: string, patch: Record<string, string | number | null>, db?: unknown) {
  const sql = await sqlOf(db);
  const allowed = ["stage", "expectedRevenue", "probability", "expectedClose", "salesperson", "nextActivitySummary"] as const;
  const clean: Record<string, string | number | null> = {};
  for (const key of allowed) if (key in patch) clean[key] = patch[key];
  const existing = await sql.prepare("SELECT patch_json FROM lead_edits WHERE import_key = ?").get(importKey) as { patch_json: string } | undefined;
  const merged = { ...(existing ? JSON.parse(existing.patch_json) : {}), ...clean };
  await sql.prepare(
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
  await sql.prepare("INSERT INTO lead_edits (import_key, patch_json) VALUES (?, ?) ON CONFLICT(import_key) DO UPDATE SET patch_json = excluded.patch_json").run(
    importKey,
    JSON.stringify(merged),
  );
}

export async function searchLeads(query: string, db?: unknown) {
  const sql = await sqlOf(db);
  const like = `%${query.trim()}%`;
  return (await sql
    .prepare(
      `SELECT import_key, name, customer, salesperson, stage, expected_revenue FROM leads
       WHERE name LIKE ? OR customer LIKE ? OR salesperson LIKE ?
       ORDER BY customer LIMIT 20`,
    )
    .all(like, like, like)) as Pick<LeadRecord, "import_key" | "name" | "customer" | "salesperson" | "stage" | "expected_revenue">[];
}

export async function leadLabel(importKey: string | null, db?: unknown) {
  const sql = await sqlOf(db);
  if (!importKey) return null;
  return (
    (await sql.prepare("SELECT import_key, name, customer, stage FROM leads WHERE import_key = ?").get(importKey) as
      | { import_key: string; name: string; customer: string; stage: string }
      | undefined) ?? null
  );
}

async function leadFacts(db?: unknown): LeadFact[] {
  const sql = await sqlOf(db);
  return (await sql.prepare("SELECT import_key, name, stage, salesperson, customer, expected_revenue, probability, created_at, active, won_status FROM leads").all() as LeadRecord[]).map(
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
      wonStatus: lead.won_status,
    }),
  );
}

export async function kpiData(asOf = todayIso(), db?: unknown) {
  const sql = await sqlOf(db);
  const activities = await sql.prepare("SELECT assignee, deadline, state FROM activities").all() as ActivityFact[];
  const bundle = computeKpis(await leadFacts(db), activities, asOf);
  const targets = plainRows(
    await sql.prepare("SELECT id, salesperson, metric, period, target_value FROM kpi_targets ORDER BY period, salesperson").all() as {
      id: number;
      salesperson: string;
      metric: string;
      period: string;
      target_value: number;
    }[],
  );
  return { ...bundle, targets, metricsReady: true };
}

export async function saveTarget(input: { salesperson: string; metric: string; period: string; targetValue: number }, db?: unknown) {
  const sql = await sqlOf(db);
  await sql.prepare(
    `INSERT INTO kpi_targets (salesperson, metric, period, target_value) VALUES (?, ?, ?, ?)
     ON CONFLICT (salesperson, metric, period) DO UPDATE SET target_value = excluded.target_value`,
  ).run(input.salesperson, input.metric, input.period, input.targetValue);
}

export async function deleteTarget(id: number, db?: unknown) {
  const sql = await sqlOf(db);
  await sql.prepare("DELETE FROM kpi_targets WHERE id = ?").run(id);
}

export async function listEquipment(db?: unknown): EquipmentRow[] {
  const sql = await sqlOf(db);
  return plainRows(await sql.prepare("SELECT * FROM equipment ORDER BY site_id, site_seq").all() as EquipmentRow[]);
}

export async function getEquipment(serial: string, db?: unknown): EquipmentRow | undefined {
  const sql = await sqlOf(db);
  return await sql.prepare("SELECT * FROM equipment WHERE serial = ?").get(serial) as EquipmentRow | undefined;
}

export async function equipmentHistory(serial: string, db?: unknown) {
  const sql = await sqlOf(db);
  return await sql.prepare("SELECT * FROM equipment_history WHERE serial = ? ORDER BY id DESC").all(serial) as {
    id: number;
    serial: string;
    at: string;
    field: string;
    from_value: string | null;
    to_value: string | null;
  }[];
}

export async function maintenanceLogs(serial: string, db?: unknown) {
  const sql = await sqlOf(db);
  return await sql.prepare("SELECT * FROM maintenance_logs WHERE serial = ? ORDER BY performed_on DESC, id DESC").all(serial) as {
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

export async function hourlyRate(db?: unknown): Promise<number> {
  const sql = await sqlOf(db);
  const row = await sql.prepare("SELECT value FROM app_settings WHERE key = ?").get("maintenance_hourly_rate_cop") as { value: string } | undefined;
  return Number(row?.value ?? 50000);
}

export async function setHourlyRate(value: number, db?: unknown) {
  const sql = await sqlOf(db);
  await sql.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    "maintenance_hourly_rate_cop",
    String(value),
  );
}

export async function catalogValues(kind: string, db?: unknown): string[] {
  const sql = await sqlOf(db);
  return (await sql.prepare("SELECT value FROM catalogs WHERE kind = ? ORDER BY sort_order, value").all(kind) as { value: string }[]).map((row) => row.value);
}

export async function addCatalogValue(kind: string, value: string, db?: unknown) {
  await catalog(db, kind, value.trim());
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

export async function createEquipment(input: EquipmentInput, db?: unknown): EquipmentRow {
  const sql = await sqlOf(db);
  const serial = input.serial.trim();
  if (!serial) throw new Error("El serial es obligatorio.");
  if (await getEquipment(serial, db)) throw new Error("Ese serial ya existe.");
  if (!siteById(input.siteId)) throw new Error("La sede no está en la lista.");
  if (!input.name.trim()) throw new Error("El nombre es obligatorio.");
  if (!input.category.trim()) throw new Error("La categoría es obligatoria.");
  const maxAsset = await sql.prepare("SELECT asset_number FROM equipment ORDER BY asset_number DESC LIMIT 1").get() as { asset_number: string } | undefined;
  const assetSeq = maxAsset ? Number(maxAsset.asset_number.replace(/\D/g, "")) + 1 : 1;
  const maxSeq = await sql.prepare("SELECT COALESCE(MAX(site_seq), 0) AS n FROM equipment WHERE site_id = ?").get(input.siteId) as { n: number };
  const seq = Number(maxSeq.n) + 1;
  const now = new Date().toISOString();
  const status = input.status || (input.clientName ? "en_comodato" : "en_tienda");
  const warranty = parseWarranty(input.warrantyUntil ?? "");
  await sql.prepare(
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
  await sql.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'alta', '', ?)").run(serial, now, status);
  await catalog(db, "category", input.category.trim());
  if (input.supplier) await catalog(db, "supplier", input.supplier.trim());
  if (input.clientName) await catalog(db, "client", input.clientName.trim());
  if (input.city) await catalog(db, "city", input.city.trim());
  return (await getEquipment(serial, db))!;
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

export async function updateEquipment(serial: string, input: EquipmentInput, db?: unknown): EquipmentRow {
  const sql = await sqlOf(db);
  const current = await getEquipment(serial, db);
  if (!current) throw new Error("No está ese equipo.");
  if (!siteById(input.siteId)) throw new Error("La sede no está en la lista.");
  let siteSeq = current.site_seq;
  let code = current.store_code;
  if (input.siteId !== current.site_id) {
    const maxSeq = await sql.prepare("SELECT COALESCE(MAX(site_seq), 0) AS n FROM equipment WHERE site_id = ?").get(input.siteId) as { n: number };
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
      await sql.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, ?, ?, ?)").run(serial, now, tracked.field, before, after);
      if (tracked.dirty) dirty.push(tracked.dirty);
    }
  }
  if ((input.supplierReference ?? "") !== (current.supplier_reference ?? "")) dirty.push("supplier_reference");
  if ((input.model ?? "") !== (current.model ?? "")) dirty.push("model");
  if ((warrantyUntil ?? "") !== (current.warranty_until ?? "")) dirty.push("warranty");
  if ((input.everyDays ?? null) !== current.maintenance_every_days) dirty.push("maintenance");
  if ((input.hoursMin ?? null) !== current.hours_min || (input.hoursMax ?? null) !== current.hours_max) dirty.push("hours");
  if (code !== current.store_code) {
    await sql.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'store_code', ?, ?)").run(
      serial,
      now,
      current.store_code,
      code,
    );
  }
  await sql.prepare(
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
  await catalog(db, "category", input.category.trim());
  if (input.supplier) await catalog(db, "supplier", input.supplier.trim());
  if (input.clientName) await catalog(db, "client", input.clientName.trim());
  if (input.city) await catalog(db, "city", input.city.trim());
  return (await getEquipment(serial, db))!;
}

export async function addMaintenance(
  serial: string,
  input: { performedOn: string; kind: string; hours: number; partsCost: number; technician: string; notes: string; conditionAfter: string },
  db?: unknown,
) {
  const sql = await sqlOf(db);
  if (!await getEquipment(serial, db)) throw new Error("No está ese equipo.");
  const rate = await hourlyRate(db);
  const visit = input.hours * rate + (input.partsCost || 0);
  const now = new Date().toISOString();
  await sql.prepare(
    `INSERT INTO maintenance_logs (serial, performed_on, kind, hours, parts_cost, technician, notes, condition_after, visit_cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(serial, input.performedOn, input.kind, input.hours, input.partsCost || 0, input.technician, input.notes, input.conditionAfter, visit, now);
  await sql.prepare("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'mantenimiento', '', ?)").run(
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

export async function sheetPlans(db?: unknown) {
  const local = (await listEquipment(db)).map(toSyncRow);
  const enabled = (await readEnv("SHEETS_SYNC_ENABLED")) === "true";
  if (enabled) {
    const { livePlans } = await import("@/lib/sheets/sync");
    const plans = await livePlans(await rawDb(db));
    return { enabled: true, mode: "live" as const, push: plans.push, pull: plans.pull };
  }
  const snapshot = snapshotFromCsv(await loadImportText("listado_equipos.csv"));
  return {
    enabled: false,
    mode: "dry-run" as const,
    push: planPush(local, snapshot),
    pull: planPull(local, snapshot),
  };
}

export async function clientDirectory(db?: unknown) {
  const sql = await sqlOf(db);
  const leads = await sql.prepare(
    `SELECT customer, COUNT(*) AS opportunities,
            SUM(CASE WHEN active = 1
              AND lower(COALESCE(won_status, '')) NOT IN ('ganado', 'won', 'perdido', 'lost')
              AND stage NOT IN ('CIERRE/ GANADO', 'OPORTUNIDAD PERDIDA', 'CLIENTE RECURRENTE')
              THEN COALESCE(expected_revenue, 0) ELSE 0 END) AS pipeline
     FROM leads WHERE customer != '' GROUP BY customer`,
  ).all() as { customer: string; opportunities: number; pipeline: number }[];
  const equipment = await sql.prepare(
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

export async function clientTimeline(customer: string, db?: unknown) {
  const sql = await sqlOf(db);
  const leads = await sql.prepare("SELECT * FROM leads WHERE customer = ?").all(customer) as LeadRecord[];
  const keys = leads.map((lead) => lead.import_key);
  const activities = keys.length
    ? (await sql.prepare(`SELECT * FROM activities WHERE lead_import_key IN (${keys.map(() => "?").join(",")})`).all(...keys) as {
        activity_type: string;
        deadline: string | null;
        state: string;
        note: string;
        assignee: string;
        created_at: string | null;
        document_name: string;
      }[])
    : [];
  const equipment = await sql.prepare("SELECT * FROM equipment WHERE client_name = ?").all(customer) as EquipmentRow[];
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
  const doc = (await currentCommittee(db)).doc;
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

export function costFor(row: EquipmentRow, rate: number): ReturnType<typeof maintenanceCost> {
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
