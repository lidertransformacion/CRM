import { activityRows, listLeads, type LeadRecord } from "@/lib/db";
import { binaryCompare } from "@/lib/sql/read-cache";
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

/** Una oportunidad por su import_key, o null si no existe. */
export async function leadByKey(importKey: string, db?: SqlDb): Promise<LeadRecord | null> {
  const row = (await listLeads(db)).find((lead) => lead.import_key === importKey);
  return row ? { ...row } : null;
}

function activityWhen(row: ActivityRecord): string {
  return row.deadline != null ? row.deadline : (row.created_at ?? "").slice(0, 10);
}

/**
 * Actividades vinculadas a una oportunidad. El import las enlaza por nombre del documento
 * (y vendedor cuando hay varias con el mismo nombre), así que algunas quedan sin vincular.
 */
export async function activitiesForLead(importKey: string, db?: SqlDb): Promise<ActivityRecord[]> {
  return (await activityRows(db))
    .filter((row) => row.lead_import_key === importKey)
    .sort((a, b) => binaryCompare(activityWhen(a), activityWhen(b)) || a.id - b.id);
}

/** Actividades de varias oportunidades a la vez (línea de tiempo del cliente). */
export async function activitiesForLeads(importKeys: string[], db?: SqlDb): Promise<ActivityRecord[]> {
  if (!importKeys.length) return [];
  const keys = new Set(importKeys);
  return (await activityRows(db))
    .filter((row) => row.lead_import_key != null && keys.has(row.lead_import_key))
    .sort((a, b) => binaryCompare(activityWhen(b), activityWhen(a)) || b.id - a.id);
}

/** Oportunidad + sus actividades, para el panel de detalle del pipeline. */
export async function leadDetail(importKey: string, db?: SqlDb): Promise<LeadDetail | null> {
  const lead = await leadByKey(importKey, db);
  if (!lead) return null;
  return { lead, activities: await activitiesForLead(importKey, db) };
}
