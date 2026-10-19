import { normalizeWonStatus } from "@/lib/kpi/compute";
import type { SqlDb } from "@/lib/sql/types";

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
  expectedClose?: string | null;
  closedAt?: string | null;
  lossReason?: string | null;
  tags?: string | null;
  activities?: IngestActivity[];
};

export type IngestRequest = {
  mode?: "full" | "incremental";
  capturedAt?: string;
  leads?: IngestLead[];
};

export type IngestResult = {
  mode: "full" | "incremental";
  inserted: number;
  updated: number;
  archived: number;
  activities: number;
  errors: { id?: string; message: string }[];
  changes: { odooId: string; field: string; from: string; to: string }[];
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
};

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

export async function ingestSnapshot(db: SqlDb, body: IngestRequest): Promise<IngestResult> {
  const mode = body.mode === "incremental" ? "incremental" : "full";
  const leads = Array.isArray(body.leads) ? body.leads : [];
  const result: IngestResult = { mode, inserted: 0, updated: 0, archived: 0, activities: 0, errors: [], changes: [] };
  const seen = new Set<string>();
  const now = new Date().toISOString();

  for (const raw of leads) {
    const odooId = raw?.id == null ? "" : String(raw.id).trim();
    if (!odooId) {
      result.errors.push({ message: "Un lead llegó sin id de Odoo." });
      continue;
    }
    seen.add(odooId);
    try {
      const outcome = await upsertLead(db, odooId, raw, result);
      if (outcome === "inserted") result.inserted += 1;
      else result.updated += 1;
      if (Array.isArray(raw.activities)) {
        result.activities += await replaceActivities(db, odooId, raw.activities);
      }
    } catch (error) {
      result.errors.push({ id: odooId, message: error instanceof Error ? error.message : "No se pudo guardar." });
    }
  }

  if (mode === "full") {
    const existing = await db.all<{ import_key: string; odoo_id: string; sync_state: string }>(
      "SELECT import_key, odoo_id, sync_state FROM leads WHERE odoo_id IS NOT NULL AND odoo_id != ''",
    );
    for (const row of existing) {
      if (row.sync_state === "pending_create") continue;
      if (seen.has(String(row.odoo_id))) continue;
      await db.run("UPDATE leads SET active = 0, missing_from_odoo = 1, won_status = CASE WHEN won_status = 'Ganado' THEN won_status ELSE 'Perdido' END WHERE import_key = ?", [
        row.import_key,
      ]);
      await db.run("DELETE FROM activities WHERE odoo_lead_id = ? OR lead_import_key = ?", [String(row.odoo_id), row.import_key]);
      result.archived += 1;
      result.changes.push({ odooId: String(row.odoo_id), field: "missing_from_odoo", from: "0", to: "1" });
    }
  }

  await db.run(
    `INSERT INTO odoo_sync_log (at, mode, inserted_count, updated_count, archived_count, error_text, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.capturedAt || now, mode, result.inserted, result.updated, result.archived, result.errors.map((error) => error.message).join("\n"), JSON.stringify(result.changes.slice(0, 200))],
  );
  await db.run(
    `INSERT INTO app_settings (key, value) VALUES ('odoo_last_ingest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify({ at: body.capturedAt || now, mode, inserted: result.inserted, updated: result.updated, archived: result.archived, errors: result.errors.length })],
  );
  return result;
}

async function upsertLead(db: SqlDb, odooId: string, raw: IngestLead, result: IngestResult): Promise<"inserted" | "updated"> {
  const key = leadKey(odooId);
  const existing =
    (await db.get<StoredLead>("SELECT * FROM leads WHERE odoo_id = ?", [odooId])) ??
    (await db.get<StoredLead>("SELECT * FROM leads WHERE import_key = ?", [key]));
  const name = text(raw.name) || existing?.name || "";
  if (!name) throw new Error("El lead no tiene nombre.");
  const stage = text(raw.stage) || existing?.stage || "LEAD";
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

  if (existing) {
    pushChange(result, odooId, "stage", existing.odoo_stage || existing.stage, stage);
    pushChange(result, odooId, "active", String(existing.active), active ? "1" : "0");
    pushChange(result, odooId, "won_status", existing.won_status || "", won);
    pushChange(result, odooId, "expected_revenue", String(existing.odoo_expected_revenue ?? existing.expected_revenue ?? ""), String(revenue ?? ""));
    await db.run(
      `UPDATE leads SET name=?, type=?, stage=?, team=?, salesperson=?, customer=?, expected_revenue=?, probability=?, created_at=COALESCE(?, created_at), expected_close=?, closed_at=?, won_status=?, active=?, loss_reason=?, tags=?, odoo_id=?, odoo_stage=?, odoo_expected_revenue=?, odoo_probability=?, missing_from_odoo=0, sync_state=CASE WHEN sync_state IN ('pending_local','pending_create') THEN sync_state ELSE 'synced' END WHERE import_key=?`,
      [
        name,
        text(raw.type) || "Oportunidad",
        displayStage,
        team,
        salesperson,
        customer,
        displayRevenue,
        displayProbability,
        raw.createdAt ?? null,
        raw.expectedClose ?? null,
        raw.closedAt ?? null,
        won,
        active ? 1 : 0,
        text(raw.lossReason),
        text(raw.tags),
        odooId,
        stage,
        revenue,
        probability,
        existing.import_key,
      ],
    );
    return "updated";
  }

  await db.run(
    `INSERT INTO leads (import_key, name, type, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, odoo_id, edited_locally, sync_state, odoo_stage, odoo_expected_revenue, odoo_probability, missing_from_odoo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'synced', ?, ?, ?, 0)`,
    [
      key,
      name,
      text(raw.type) || "Oportunidad",
      stage,
      team,
      salesperson,
      customer,
      revenue,
      probability,
      raw.createdAt ?? null,
      raw.expectedClose ?? null,
      raw.closedAt ?? null,
      won,
      active ? 1 : 0,
      text(raw.lossReason),
      text(raw.tags),
      odooId,
      stage,
      revenue,
      probability,
    ],
  );
  result.changes.push({ odooId, field: "created", from: "", to: name });
  return "inserted";
}

function pushChange(result: IngestResult, odooId: string, field: string, from: string, to: string) {
  if (from === to) return;
  if (result.changes.length >= 200) return;
  result.changes.push({ odooId, field, from, to });
}

async function replaceActivities(db: SqlDb, odooId: string, activities: IngestActivity[]): Promise<number> {
  const lead = await db.get<{ import_key: string }>("SELECT import_key FROM leads WHERE odoo_id = ?", [odooId]);
  await db.run("DELETE FROM activities WHERE odoo_lead_id = ?", [odooId]);
  let count = 0;
  for (const activity of activities) {
    const resId = String(activity.resId ?? activity.res_id ?? odooId);
    await db.run(
      `INSERT INTO activities (odoo_lead_id, odoo_activity_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resId,
        activity.id == null ? null : String(activity.id),
        text(activity.documentName ?? activity.document_name),
        text(activity.summary),
        text(activity.activityType ?? activity.activity_type ?? activity.type),
        activity.deadline ?? activity.date_deadline ?? null,
        text(activity.state),
        activity.createdAt ?? null,
        text(activity.note),
        text(activity.assignee ?? activity.user),
        lead?.import_key ?? null,
      ],
    );
    count += 1;
  }
  return count;
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
