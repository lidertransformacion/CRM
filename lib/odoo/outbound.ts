import { OUTBOUND_COLUMNS } from "@/lib/sql/columns";
import type { SqlDb } from "@/lib/sql/types";

export type OutboundRow = {
  id: number;
  kind: string;
  local_key: string;
  payload_json: string;
  status: string;
  error: string | null;
  odoo_id: string | null;
  created_at: string;
  updated_at: string;
  acked_at: string | null;
};

export type LeadPayload = {
  name: string;
  customer: string;
  salesperson: string;
  team: string;
  stage: string;
  expectedRevenue: number | null;
  probability: number | null;
  expectedClose: string | null;
  type: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

export async function queueOutbound(db: SqlDb, kind: "create" | "update", localKey: string, payload: LeadPayload): Promise<number> {
  const now = nowIso();
  const existing = await db.get<{ id: number }>(
    "SELECT id FROM odoo_outbound WHERE local_key = ? AND kind = ? AND status = 'pending'",
    [localKey, kind],
  );
  const body = JSON.stringify(payload);
  if (existing) {
    await db.run("UPDATE odoo_outbound SET payload_json = ?, updated_at = ? WHERE id = ?", [body, now, existing.id]);
    return existing.id;
  }
  const inserted = await db.run(
    `INSERT INTO odoo_outbound (kind, local_key, payload_json, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    [kind, localKey, body, now, now],
  );
  return inserted.lastInsertRowid;
}

export async function listPendingOutbound(db: SqlDb, limit = 50): Promise<OutboundRow[]> {
  return db.all<OutboundRow>(
    `SELECT ${OUTBOUND_COLUMNS} FROM odoo_outbound WHERE status = 'pending' ORDER BY id LIMIT ?`,
    [limit],
  );
}

export async function acknowledgeOutbound(
  db: SqlDb,
  id: number,
  body: { odooId?: string | number | null; error?: string | null },
): Promise<{ localKey: string; kind: string; odooId: string | null }> {
  const row = await db.get<OutboundRow>(`SELECT ${OUTBOUND_COLUMNS} FROM odoo_outbound WHERE id = ?`, [id]);
  if (!row) throw new Error("No está esa solicitud.");
  if (row.status !== "pending") throw new Error("Esa solicitud ya fue acusada.");
  const now = nowIso();
  if (body.error) {
    await db.run("UPDATE odoo_outbound SET status = 'error', error = ?, updated_at = ? WHERE id = ?", [body.error, now, id]);
    return { localKey: row.local_key, kind: row.kind, odooId: null };
  }
  const odooId = body.odooId == null || body.odooId === "" ? "" : String(body.odooId);
  if (row.kind === "create" && !odooId) throw new Error("Falta el id de Odoo para acusar la creación.");
  await db.exec("BEGIN");
  try {
    if (row.kind === "create") {
      await db.run(
        `UPDATE leads SET odoo_id = ?, sync_state = 'synced', odoo_stage = stage, odoo_expected_revenue = expected_revenue, odoo_probability = probability, missing_from_odoo = 0, edited_locally = 0 WHERE import_key = ?`,
        [odooId, row.local_key],
      );
    } else {
      await db.run(
        `UPDATE leads SET sync_state = 'synced', odoo_stage = stage, odoo_expected_revenue = expected_revenue, odoo_probability = probability, edited_locally = 0 WHERE import_key = ?`,
        [row.local_key],
      );
      if (odooId) await db.run("UPDATE leads SET odoo_id = ? WHERE import_key = ? AND (odoo_id IS NULL OR odoo_id = '')", [odooId, row.local_key]);
    }
    await db.run(
      `UPDATE odoo_outbound SET status = 'acknowledged', odoo_id = ?, error = NULL, acked_at = ?, updated_at = ? WHERE id = ?`,
      [odooId || null, now, now, id],
    );
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
  return { localKey: row.local_key, kind: row.kind, odooId: odooId || null };
}
