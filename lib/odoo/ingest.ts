import { normalizeWonStatus } from "@/lib/kpi/compute";
import { canonicalStage } from "@/lib/odoo/stages";
import { SQL_BATCH_LIMIT, type SqlBatch, type SqlDb } from "@/lib/sql/types";

export type IngestActivity = {
  id?: string | number | null;
  resId?: string | number | null;
  res_id?: string | number | null;
  summary?: string | null;
  activityType?: string | null;
  activity_type?: string | null;
  type?: string | null;
  deadline?: string | null;
  date_deadline?: string | null;
  state?: string | null;
  assignee?: string | null;
  user?: string | null;
  note?: string | null;
  createdAt?: string | null;
  documentName?: string | null;
  document_name?: string | null;
};

export type IngestLead = {
  id: string | number;
  name?: string | null;
  type?: string | null;
  stage?: string | null;
  active?: boolean | null;
  wonStatus?: string | null;
  won_status?: string | null;
  expectedRevenue?: number | null;
  expected_revenue?: number | null;
  probability?: number | null;
  salesperson?: string | null;
  user?: string | null;
  team?: string | null;
  customer?: string | null;
  partner?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  expectedClose?: string | null;
  closedAt?: string | null;
  lossReason?: string | null;
  tags?: string | null;
  activities?: IngestActivity[];
};

export type IngestRequest = {
  mode?: "full" | "incremental";
  snapshotId?: string | null;
  dryRun?: boolean;
  capturedAt?: string;
  leads?: IngestLead[];
};

export type IngestResult = {
  mode: "full" | "incremental";
  snapshotId: string | null;
  dryRun: boolean;
  inserted: number;
  updated: number;
  linked: number;
  archived: number;
  activities: number;
  wouldInsert: number;
  wouldUpdate: number;
  wouldLink: number;
  wouldArchive: number;
  errors: { id?: string; message: string }[];
  changes: { odooId: string; field: string; from: string; to: string }[];
};

export type CommitRequest = {
  snapshotId?: string | null;
  dryRun?: boolean;
};

export type CommitResult = {
  snapshotId: string;
  dryRun: boolean;
  seen: number;
  archived: number;
  wouldArchive: number;
};

type StoredLead = {
  import_key: string;
  name: string;
  stage: string;
  odoo_stage: string | null;
  team: string | null;
  salesperson: string | null;
  customer: string | null;
  expected_revenue: number | null;
  odoo_expected_revenue: number | null;
  probability: number | null;
  odoo_probability: number | null;
  won_status: string | null;
  active: number;
  sync_state: string;
  odoo_id: string | null;
  created_at: string | null;
};

type LeadOutcome = { action: "inserted" | "updated" | "linked"; importKey: string };

type LeadIndex = {
  rows: StoredLead[];
  byOdoo: Map<string, StoredLead>;
  byKey: Map<string, StoredLead>;
  unlinked: Map<string, StoredLead[]>;
};

const LEAD_SQL =
  "SELECT import_key, name, stage, odoo_stage, team, salesperson, customer, expected_revenue, odoo_expected_revenue, probability, odoo_probability, won_status, active, sync_state, odoo_id, created_at FROM leads";

const UPDATE_LEAD = `UPDATE leads SET name=?, type=?, stage=?, team=?, salesperson=?, customer=?, expected_revenue=?, probability=?, created_at=COALESCE(?, created_at), expected_close=?, closed_at=?, won_status=?, active=?, loss_reason=?, tags=?, odoo_id=?, odoo_stage=?, odoo_expected_revenue=?, odoo_probability=?, missing_from_odoo=0, sync_state=CASE WHEN sync_state IN ('pending_local','pending_create') THEN sync_state ELSE 'synced' END WHERE import_key=?`;

const INSERT_LEAD = `INSERT INTO leads (import_key, name, type, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, odoo_id, edited_locally, sync_state, odoo_stage, odoo_expected_revenue, odoo_probability, missing_from_odoo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'synced', ?, ?, ?, 0)`;

const INSERT_ACTIVITY = `INSERT INTO activities (odoo_lead_id, odoo_activity_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function text(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function num(value: number | null | undefined): number | null {
  if (value == null || value === ("" as unknown)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function wonLabel(value: string | null | undefined): string {
  const normalized = normalizeWonStatus(value);
  if (normalized === "ganado") return "Ganado";
  if (normalized === "perdido") return "Perdido";
  return "Pendiente";
}

function leadKey(odooId: string): string {
  return `odoo:${odooId}`;
}

function foldLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dayKey(value: string | null | undefined): string {
  const match = (value ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function identityKey(name: string, customer: string, createdAt: string | null | undefined): string {
  const day = dayKey(createdAt);
  const foldedName = foldLabel(name);
  const foldedCustomer = foldLabel(customer);
  if (!foldedName || !foldedCustomer || !day) return "";
  return `${foldedName}|${foldedCustomer}|${day}`;
}

function emptyResult(mode: "full" | "incremental", snapshotId: string, dryRun: boolean): IngestResult {
  return {
    mode,
    snapshotId: snapshotId || null,
    dryRun,
    inserted: 0,
    updated: 0,
    linked: 0,
    archived: 0,
    activities: 0,
    wouldInsert: 0,
    wouldUpdate: 0,
    wouldLink: 0,
    wouldArchive: 0,
    errors: [],
    changes: [],
  };
}

export async function ingestSnapshot(db: SqlDb, body: IngestRequest): Promise<IngestResult> {
  const mode = body.mode === "incremental" ? "incremental" : "full";
  const dryRun = body.dryRun === true;
  const snapshotId = text(body.snapshotId);
  if (snapshotId && mode !== "full") throw new Error("snapshotId solo aplica a un snapshot completo (mode=full).");
  const leads = Array.isArray(body.leads) ? body.leads : [];
  const result = emptyResult(mode, snapshotId, dryRun);
  const seen = new Set<string>();
  const kept = new Set<string>();
  const statements: SqlBatch[] = [];
  const index = indexLeads(await db.all<StoredLead>(LEAD_SQL));

  for (const raw of leads) {
    const odooId = raw?.id == null ? "" : String(raw.id).trim();
    if (!odooId) {
      result.errors.push({ message: "Un lead llegó sin id de Odoo." });
      continue;
    }
    try {
      const outcome = planLead(index, odooId, raw, result, statements, dryRun);
      seen.add(odooId);
      kept.add(outcome.importKey);
      if (outcome.action === "inserted") result.wouldInsert += 1;
      else if (outcome.action === "linked") result.wouldLink += 1;
      else result.wouldUpdate += 1;
      if (!dryRun) {
        if (outcome.action === "inserted") result.inserted += 1;
        else if (outcome.action === "linked") result.linked += 1;
        else result.updated += 1;
        if (snapshotId) statements.push({ sql: "INSERT OR IGNORE INTO odoo_snapshot_seen (snapshot_id, odoo_id) VALUES (?, ?)", params: [snapshotId, odooId] });
      }
      if (Array.isArray(raw.activities)) {
        result.activities += raw.activities.length;
        if (!dryRun) appendActivities(statements, odooId, outcome.importKey, raw.activities);
      }
    } catch (error) {
      result.errors.push({ id: odooId, message: error instanceof Error ? error.message : "No se pudo guardar." });
    }
  }

  if (mode === "full" && (dryRun || !snapshotId)) planArchive(index.rows, seen, kept, result, statements, dryRun);
  if (!dryRun) {
    const now = new Date().toISOString();
    statements.push(
      {
        sql: `INSERT INTO odoo_sync_log (at, mode, inserted_count, updated_count, archived_count, error_text, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [body.capturedAt || now, mode, result.inserted, result.updated + result.linked, result.archived, result.errors.map((error) => error.message).join("\n"), JSON.stringify({ snapshotId: result.snapshotId, linked: result.linked, changes: result.changes.slice(0, 200) })],
      },
      {
        sql: `INSERT INTO app_settings (key, value) VALUES ('odoo_last_ingest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        params: [JSON.stringify({ at: body.capturedAt || now, mode, snapshotId: result.snapshotId, inserted: result.inserted, updated: result.updated, linked: result.linked, archived: result.archived, errors: result.errors.length })],
      },
    );
    await writeChunks(db, statements);
  }
  return result;
}

export async function commitSnapshot(db: SqlDb, body: CommitRequest): Promise<CommitResult> {
  const snapshotId = text(body.snapshotId);
  if (!snapshotId) throw new Error("Falta snapshotId.");
  const dryRun = body.dryRun === true;
  const [seenRows, leadRows] = (await db.batch([
    { sql: "SELECT odoo_id FROM odoo_snapshot_seen WHERE snapshot_id = ?", params: [snapshotId] },
    { sql: "SELECT import_key, odoo_id, sync_state FROM leads" },
  ])) as [{ odoo_id: string }[], { import_key: string; odoo_id: string | null; sync_state: string }[]];
  if (!seenRows.length) throw new Error("Ese snapshot no tiene leads.");
  const seen = new Set(seenRows.map((row) => row.odoo_id));
  const result = emptyResult("full", snapshotId, dryRun);
  const statements: SqlBatch[] = [];
  planArchive(leadRows, seen, new Set(), result, statements, dryRun);
  if (!dryRun) {
    const now = new Date().toISOString();
    statements.push(
      {
        sql: `INSERT INTO odoo_sync_log (at, mode, inserted_count, updated_count, archived_count, error_text, summary_json) VALUES (?, 'commit', 0, 0, ?, '', ?)`,
        params: [now, result.archived, JSON.stringify({ snapshotId, seen: seen.size })],
      },
      { sql: "DELETE FROM odoo_snapshot_seen WHERE snapshot_id = ?", params: [snapshotId] },
    );
    await writeChunks(db, statements);
  }
  return { snapshotId, dryRun, seen: seen.size, archived: result.archived, wouldArchive: result.wouldArchive };
}

function indexLeads(rows: StoredLead[]): LeadIndex {
  const byOdoo = new Map<string, StoredLead>();
  const byKey = new Map<string, StoredLead>();
  const unlinked = new Map<string, StoredLead[]>();
  for (const row of rows) {
    byKey.set(row.import_key, row);
    const odooId = text(row.odoo_id);
    if (odooId) {
      byOdoo.set(odooId, row);
      continue;
    }
    const key = identityKey(row.name, row.customer ?? "", row.created_at);
    if (!key) continue;
    const list = unlinked.get(key) ?? [];
    list.push(row);
    unlinked.set(key, list);
  }
  return { rows, byOdoo, byKey, unlinked };
}

function planLead(index: LeadIndex, odooId: string, raw: IngestLead, result: IngestResult, statements: SqlBatch[], dryRun: boolean): LeadOutcome {
  const key = leadKey(odooId);
  let existing = index.byOdoo.get(odooId) ?? index.byKey.get(key);
  let action: LeadOutcome["action"] = existing ? "updated" : "inserted";
  if (!existing) {
    const matchKey = identityKey(text(raw.name), text(raw.customer ?? raw.partner), raw.createdAt ?? raw.created_at);
    const candidates = matchKey ? index.unlinked.get(matchKey) ?? [] : [];
    if (candidates.length === 1) {
      existing = candidates[0];
      action = "linked";
      index.unlinked.delete(matchKey);
    } else if (candidates.length > 1) {
      result.errors.push({ id: odooId, message: "Hay varias oportunidades locales con el mismo nombre, cliente y fecha. No se enlazó." });
    }
  }
  const name = text(raw.name) || existing?.name || "";
  if (!name) throw new Error("El lead no tiene nombre.");
  const stage = canonicalStage(text(raw.stage)) || existing?.stage || "LEAD";
  const won = wonLabel(raw.wonStatus ?? raw.won_status ?? existing?.won_status);
  const active = raw.active == null ? (existing ? existing.active === 1 : true) : Boolean(raw.active);
  const revenue = raw.expectedRevenue !== undefined || raw.expected_revenue !== undefined ? num(raw.expectedRevenue ?? raw.expected_revenue) : (existing?.odoo_expected_revenue ?? existing?.expected_revenue ?? null);
  const probability = raw.probability !== undefined ? num(raw.probability) : (existing?.odoo_probability ?? existing?.probability ?? null);
  const salesperson = text(raw.salesperson ?? raw.user) || existing?.salesperson || "";
  const team = text(raw.team) || existing?.team || "";
  const customer = text(raw.customer ?? raw.partner) || existing?.customer || "";
  const pending = existing?.sync_state === "pending_local" || existing?.sync_state === "pending_create";
  const displayStage = pending ? existing?.stage ?? stage : stage;
  const displayRevenue = pending && existing ? existing.expected_revenue : revenue;
  const displayProbability = pending && existing ? existing.probability : probability;
  const createdAt = raw.createdAt ?? raw.created_at ?? null;
  const leadType = text(raw.type) || "Oportunidad";

  if (existing) {
    pushChange(result, odooId, "stage", existing.odoo_stage || existing.stage, stage);
    pushChange(result, odooId, "active", String(existing.active), active ? "1" : "0");
    pushChange(result, odooId, "won_status", existing.won_status || "", won);
    pushChange(result, odooId, "expected_revenue", String(existing.odoo_expected_revenue ?? existing.expected_revenue ?? ""), String(revenue ?? ""));
    if (action === "linked") pushChange(result, odooId, "odoo_id", "", odooId);
    if (!dryRun) {
      statements.push({
        sql: UPDATE_LEAD,
        params: [name, leadType, displayStage, team, salesperson, customer, displayRevenue, displayProbability, createdAt, raw.expectedClose ?? null, raw.closedAt ?? null, won, active ? 1 : 0, text(raw.lossReason), text(raw.tags), odooId, stage, revenue, probability, existing.import_key],
      });
    }
    remember(existing, { name, displayStage, stage, team, salesperson, customer, displayRevenue, displayProbability, revenue, probability, won, active, createdAt, odooId, pending });
    index.byOdoo.set(odooId, existing);
    return { action, importKey: existing.import_key };
  }

  if (!dryRun) {
    statements.push({
      sql: INSERT_LEAD,
      params: [key, name, leadType, stage, team, salesperson, customer, revenue, probability, createdAt, raw.expectedClose ?? null, raw.closedAt ?? null, won, active ? 1 : 0, text(raw.lossReason), text(raw.tags), odooId, stage, revenue, probability],
    });
  }
  const created: StoredLead = {
    import_key: key,
    name,
    stage,
    odoo_stage: stage,
    team,
    salesperson,
    customer,
    expected_revenue: revenue,
    odoo_expected_revenue: revenue,
    probability,
    odoo_probability: probability,
    won_status: won,
    active: active ? 1 : 0,
    sync_state: "synced",
    odoo_id: odooId,
    created_at: createdAt,
  };
  index.rows.push(created);
  index.byKey.set(key, created);
  index.byOdoo.set(odooId, created);
  result.changes.push({ odooId, field: "created", from: "", to: name });
  return { action: "inserted", importKey: key };
}

function remember(
  row: StoredLead,
  next: {
    name: string;
    displayStage: string;
    stage: string;
    team: string;
    salesperson: string;
    customer: string;
    displayRevenue: number | null;
    displayProbability: number | null;
    revenue: number | null;
    probability: number | null;
    won: string;
    active: boolean;
    createdAt: string | null;
    odooId: string;
    pending: boolean;
  },
) {
  row.name = next.name;
  row.stage = next.displayStage;
  row.odoo_stage = next.stage;
  row.team = next.team;
  row.salesperson = next.salesperson;
  row.customer = next.customer;
  row.expected_revenue = next.displayRevenue;
  row.odoo_expected_revenue = next.revenue;
  row.probability = next.displayProbability;
  row.odoo_probability = next.probability;
  row.won_status = next.won;
  row.active = next.active ? 1 : 0;
  if (next.createdAt) row.created_at = next.createdAt;
  row.odoo_id = next.odooId;
  if (!next.pending) row.sync_state = "synced";
}

function planArchive(
  rows: { import_key: string; odoo_id: string | null; sync_state: string }[],
  seen: Set<string>,
  kept: Set<string>,
  result: IngestResult,
  statements: SqlBatch[],
  dryRun: boolean,
) {
  for (const row of rows) {
    if (row.sync_state === "pending_create") continue;
    if (kept.has(row.import_key)) continue;
    const odooId = text(row.odoo_id);
    if (odooId && seen.has(odooId)) continue;
    result.wouldArchive += 1;
    if (dryRun) continue;
    statements.push({
      sql: "UPDATE leads SET active = 0, missing_from_odoo = 1, won_status = CASE WHEN won_status = 'Ganado' THEN won_status ELSE 'Perdido' END WHERE import_key = ?",
      params: [row.import_key],
    });
    statements.push(
      odooId
        ? { sql: "DELETE FROM activities WHERE odoo_lead_id = ? OR lead_import_key = ?", params: [odooId, row.import_key] }
        : { sql: "DELETE FROM activities WHERE lead_import_key = ?", params: [row.import_key] },
    );
    result.archived += 1;
    result.changes.push({ odooId: odooId || row.import_key, field: "missing_from_odoo", from: "0", to: "1" });
  }
}

function appendActivities(statements: SqlBatch[], odooId: string, importKey: string, activities: IngestActivity[]) {
  statements.push({ sql: "DELETE FROM activities WHERE odoo_lead_id = ?", params: [odooId] });
  for (const activity of activities) {
    statements.push({
      sql: INSERT_ACTIVITY,
      params: [
        String(activity.resId ?? activity.res_id ?? odooId),
        activity.id == null ? null : String(activity.id),
        text(activity.documentName ?? activity.document_name),
        text(activity.summary),
        text(activity.activityType ?? activity.activity_type ?? activity.type),
        activity.deadline ?? activity.date_deadline ?? null,
        text(activity.state),
        activity.createdAt ?? null,
        text(activity.note),
        text(activity.assignee ?? activity.user),
        importKey,
      ],
    });
  }
}

async function writeChunks(db: SqlDb, statements: SqlBatch[]) {
  for (let index = 0; index < statements.length; index += SQL_BATCH_LIMIT) {
    await db.batch(statements.slice(index, index + SQL_BATCH_LIMIT));
  }
}

function pushChange(result: IngestResult, odooId: string, field: string, from: string, to: string) {
  if (from === to) return;
  if (result.changes.length >= 200) return;
  result.changes.push({ odooId, field, from, to });
}

export async function syncStatus(db: SqlDb) {
  const last = await db.get<{ value: string }>("SELECT value FROM app_settings WHERE key = 'odoo_last_ingest'");
  const pending = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM odoo_outbound WHERE status = 'pending'");
  const errors = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM odoo_outbound WHERE status = 'error'");
  const log = await db.all("SELECT id, at, mode, inserted_count, updated_count, archived_count, error_text, summary_json FROM odoo_sync_log ORDER BY id DESC LIMIT 20");
  const pendingRows = await db.all("SELECT id, kind, local_key, payload_json, created_at FROM odoo_outbound WHERE status = 'pending' ORDER BY id LIMIT 20");
  return {
    lastIngest: last ? (JSON.parse(last.value) as Record<string, unknown>) : null,
    pendingCreations: pending?.n ?? 0,
    outboundErrors: errors?.n ?? 0,
    log,
    pending: pendingRows,
  };
}
