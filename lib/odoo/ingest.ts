import { normalizeWonStatus } from "@/lib/kpi/compute";
import { canonicalStage } from "@/lib/odoo/stages";
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
  const now = new Date().toISOString();
  const unlinked = await loadUnlinked(db);

  for (const raw of leads) {
    const odooId = raw?.id == null ? "" : String(raw.id).trim();
    if (!odooId) {
      result.errors.push({ message: "Un lead llegó sin id de Odoo." });
      continue;
    }
    try {
      const outcome = await upsertLead(db, odooId, raw, result, unlinked, dryRun);
      seen.add(odooId);
      kept.add(outcome.importKey);
      if (outcome.action === "inserted") result.wouldInsert += 1;
      else if (outcome.action === "linked") result.wouldLink += 1;
      else result.wouldUpdate += 1;
      if (!dryRun) {
        if (outcome.action === "inserted") result.inserted += 1;
        else if (outcome.action === "linked") result.linked += 1;
        else result.updated += 1;
        if (snapshotId) {
          await db.run("INSERT OR IGNORE INTO odoo_snapshot_seen (snapshot_id, odoo_id) VALUES (?, ?)", [snapshotId, odooId]);
        }
      }
      if (Array.isArray(raw.activities)) {
        const count = dryRun ? raw.activities.length : await replaceActivities(db, odooId, raw.activities);
        result.activities += count;
      }
    } catch (error) {
      result.errors.push({ id: odooId, message: error instanceof Error ? error.message : "No se pudo guardar." });
    }
  }

  if (mode === "full" && (dryRun || !snapshotId)) {
    await archiveMissing(db, seen, kept, result, dryRun);
  }

  if (!dryRun) {
    await db.run(
      `INSERT INTO odoo_sync_log (at, mode, inserted_count, updated_count, archived_count, error_text, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [body.capturedAt || now, mode, result.inserted, result.updated + result.linked, result.archived, result.errors.map((error) => error.message).join("\n"), JSON.stringify({ snapshotId: result.snapshotId, linked: result.linked, changes: result.changes.slice(0, 200) })],
    );
    await db.run(
      `INSERT INTO app_settings (key, value) VALUES ('odoo_last_ingest', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [JSON.stringify({ at: body.capturedAt || now, mode, snapshotId: result.snapshotId, inserted: result.inserted, updated: result.updated, linked: result.linked, archived: result.archived, errors: result.errors.length })],
    );
  }
  return result;
}

export async function commitSnapshot(db: SqlDb, body: CommitRequest): Promise<CommitResult> {
  const snapshotId = text(body.snapshotId);
  if (!snapshotId) throw new Error("Falta snapshotId.");
  const dryRun = body.dryRun === true;
  const seenRows = await db.all<{ odoo_id: string }>("SELECT odoo_id FROM odoo_snapshot_seen WHERE snapshot_id = ?", [snapshotId]);
  if (!seenRows.length) throw new Error("Ese snapshot no tiene leads.");
  const seen = new Set(seenRows.map((row) => row.odoo_id));
  const result = emptyResult("full", snapshotId, dryRun);
  await archiveMissing(db, seen, new Set(), result, dryRun);
  if (!dryRun) {
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO odoo_sync_log (at, mode, inserted_count, updated_count, archived_count, error_text, summary_json) VALUES (?, 'commit', 0, 0, ?, '', ?)`,
      [now, result.archived, JSON.stringify({ snapshotId, seen: seen.size })],
    );
    await db.run("DELETE FROM odoo_snapshot_seen WHERE snapshot_id = ?", [snapshotId]);
  }
  return { snapshotId, dryRun, seen: seen.size, archived: result.archived, wouldArchive: result.wouldArchive };
}

async function loadUnlinked(db: SqlDb): Promise<Map<string, StoredLead[]>> {
  const rows = await db.all<StoredLead>(
    "SELECT import_key, name, stage, odoo_stage, team, salesperson, customer, expected_revenue, odoo_expected_revenue, probability, odoo_probability, won_status, active, sync_state, odoo_id, created_at FROM leads WHERE odoo_id IS NULL OR odoo_id = ''",
  );
  const index = new Map<string, StoredLead[]>();
  for (const row of rows) {
    const key = identityKey(row.name, row.customer ?? "", row.created_at);
    if (!key) continue;
    const list = index.get(key) ?? [];
    list.push(row);
    index.set(key, list);
  }
  return index;
}

async function upsertLead(db: SqlDb, odooId: string, raw: IngestLead, result: IngestResult, unlinked: Map<string, StoredLead[]>, dryRun: boolean): Promise<LeadOutcome> {
  const key = leadKey(odooId);
  let existing =
    (await db.get<StoredLead>("SELECT import_key, name, stage, odoo_stage, team, salesperson, customer, expected_revenue, odoo_expected_revenue, probability, odoo_probability, won_status, active, sync_state, odoo_id, created_at FROM leads WHERE odoo_id = ?", [odooId])) ??
    (await db.get<StoredLead>("SELECT import_key, name, stage, odoo_stage, team, salesperson, customer, expected_revenue, odoo_expected_revenue, probability, odoo_probability, won_status, active, sync_state, odoo_id, created_at FROM leads WHERE import_key = ?", [key]));
  let action: LeadOutcome["action"] = existing ? "updated" : "inserted";
  if (!existing) {
    const matchKey = identityKey(text(raw.name), text(raw.customer ?? raw.partner), raw.createdAt ?? raw.created_at);
    const candidates = matchKey ? unlinked.get(matchKey) ?? [] : [];
    if (candidates.length === 1) {
      existing = candidates[0];
      action = "linked";
      unlinked.delete(matchKey);
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

  if (existing) {
    pushChange(result, odooId, "stage", existing.odoo_stage || existing.stage, stage);
    pushChange(result, odooId, "active", String(existing.active), active ? "1" : "0");
    pushChange(result, odooId, "won_status", existing.won_status || "", won);
    pushChange(result, odooId, "expected_revenue", String(existing.odoo_expected_revenue ?? existing.expected_revenue ?? ""), String(revenue ?? ""));
    if (action === "linked") pushChange(result, odooId, "odoo_id", "", odooId);
    if (!dryRun) {
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
          createdAt,
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
    }
    return { action, importKey: existing.import_key };
  }

  if (!dryRun) {
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
        createdAt,
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
  }
  result.changes.push({ odooId, field: "created", from: "", to: name });
  return { action: "inserted", importKey: key };
}

async function archiveMissing(db: SqlDb, seen: Set<string>, kept: Set<string>, result: IngestResult, dryRun: boolean) {
  const rows = await db.all<{ import_key: string; odoo_id: string | null; sync_state: string }>(
    "SELECT import_key, odoo_id, sync_state FROM leads",
  );
  for (const row of rows) {
    if (row.sync_state === "pending_create") continue;
    if (kept.has(row.import_key)) continue;
    const odooId = text(row.odoo_id);
    if (odooId && seen.has(odooId)) continue;
    result.wouldArchive += 1;
    if (dryRun) continue;
    await db.run(
      "UPDATE leads SET active = 0, missing_from_odoo = 1, won_status = CASE WHEN won_status = 'Ganado' THEN won_status ELSE 'Perdido' END WHERE import_key = ?",
      [row.import_key],
    );
    if (odooId) await db.run("DELETE FROM activities WHERE odoo_lead_id = ? OR lead_import_key = ?", [odooId, row.import_key]);
    else await db.run("DELETE FROM activities WHERE lead_import_key = ?", [row.import_key]);
    result.archived += 1;
    result.changes.push({ odooId: odooId || row.import_key, field: "missing_from_odoo", from: "0", to: "1" });
  }
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
