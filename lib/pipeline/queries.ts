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
export async function leadByKey(importKey: string, db?: SqlDb): Promise<LeadRecord | null> {
  const row = await (await sqlOf(db)).get<LeadRecord>("SELECT * FROM leads WHERE import_key = ?", [importKey]);
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
  const lead = await leadByKey(importKey, db);
  if (!lead) return null;
  return { lead, activities: await activitiesForLead(importKey, db) };
}
