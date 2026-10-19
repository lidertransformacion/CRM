import { getDb, type LeadRecord } from "@/lib/db";
import type { SqlDb } from "@/lib/sql/types";

/** Fila de la tabla `activities` tal como la deja el import de Odoo. */
export type ActivityRecord = {
  id: number;
  odoo_lead_id: string | null;
  document_name: string;
  summary: string;
  activity_type: string;
  deadline: string | null;
  state: string;
  created_at: string | null;
  note: string;
  assignee: string;
  lead_import_key: string | null;
};

export type LeadDetail = { lead: LeadRecord; activities: ActivityRecord[] };

async function sqlOf(db?: SqlDb): Promise<SqlDb> {
  return db ?? (await getDb());
}

/** Una oportunidad por su import_key, o null si no existe. */
const LEAD_DETAIL_SQL = `SELECT import_key, name, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, next_activity_type, next_activity_summary, next_activity_deadline, edited_locally FROM leads WHERE import_key = ?`;

export async function leadByKey(importKey: string, db?: SqlDb): Promise<LeadRecord | null> {
  const row = await (await sqlOf(db)).get<LeadRecord>(LEAD_DETAIL_SQL, [importKey]);
  return row ? { ...row } : null;
}

/**
 * Actividades vinculadas a una oportunidad. El import las enlaza por nombre del documento
 * (y vendedor cuando hay varias con el mismo nombre), así que algunas quedan sin vincular.
 */
export async function activitiesForLead(importKey: string, db?: SqlDb): Promise<ActivityRecord[]> {
  return (await sqlOf(db)).all<ActivityRecord>(
    "SELECT * FROM activities WHERE lead_import_key = ? ORDER BY COALESCE(deadline, substr(created_at, 1, 10)) ASC, id ASC",
    [importKey],
  );
}

/** Actividades de varias oportunidades a la vez (línea de tiempo del cliente). */
export async function activitiesForLeads(importKeys: string[], db?: SqlDb): Promise<ActivityRecord[]> {
  if (!importKeys.length) return [];
  const placeholders = importKeys.map(() => "?").join(",");
  return (await sqlOf(db)).all<ActivityRecord>(
    `SELECT * FROM activities WHERE lead_import_key IN (${placeholders}) ORDER BY COALESCE(deadline, substr(created_at, 1, 10)) DESC, id DESC`,
    importKeys,
  );
}

/** Oportunidad + sus actividades, para el panel de detalle del pipeline. */
export async function leadDetail(importKey: string, db?: SqlDb): Promise<LeadDetail | null> {
  const sql = await sqlOf(db);
  const [leads, activities] = await sql.batch([
    { sql: LEAD_DETAIL_SQL, params: [importKey] },
    {
      sql: "SELECT id, odoo_lead_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key FROM activities WHERE lead_import_key = ? ORDER BY COALESCE(deadline, substr(created_at, 1, 10)) ASC, id ASC",
      params: [importKey],
    },
  ]);
  const lead = leads[0] as LeadRecord | undefined;
  if (!lead) return null;
  return { lead: { ...lead }, activities: activities as ActivityRecord[] };
}
