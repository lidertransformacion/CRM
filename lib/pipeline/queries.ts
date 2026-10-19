import { getDb, type LeadRecord } from "@/lib/db";

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

/** Las filas de node:sqlite no son objetos planos; las copiamos para poder serializarlas. */
function plainRows<T extends object>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

/** Una oportunidad por su import_key, o null si no existe. */
export function leadByKey(importKey: string, db = getDb()): LeadRecord | null {
  const row = db.prepare("SELECT * FROM leads WHERE import_key = ?").get(importKey) as LeadRecord | undefined;
  return row ? { ...row } : null;
}

/**
 * Actividades vinculadas a una oportunidad. El import las enlaza por nombre del documento
 * (y vendedor cuando hay varias con el mismo nombre), así que algunas quedan sin vincular.
 */
export function activitiesForLead(importKey: string, db = getDb()): ActivityRecord[] {
  return plainRows(
    db
      .prepare("SELECT * FROM activities WHERE lead_import_key = ? ORDER BY COALESCE(deadline, substr(created_at, 1, 10)) ASC, id ASC")
      .all(importKey) as ActivityRecord[],
  );
}

/** Actividades de varias oportunidades a la vez (línea de tiempo del cliente). */
export function activitiesForLeads(importKeys: string[], db = getDb()): ActivityRecord[] {
  if (!importKeys.length) return [];
  const placeholders = importKeys.map(() => "?").join(",");
  return plainRows(
    db
      .prepare(`SELECT * FROM activities WHERE lead_import_key IN (${placeholders}) ORDER BY COALESCE(deadline, substr(created_at, 1, 10)) DESC, id DESC`)
      .all(...importKeys) as ActivityRecord[],
  );
}

/** Oportunidad + sus actividades, para el panel de detalle del pipeline. */
export function leadDetail(importKey: string, db = getDb()): LeadDetail | null {
  const lead = leadByKey(importKey, db);
  if (!lead) return null;
  return { lead, activities: activitiesForLead(importKey, db) };
}
