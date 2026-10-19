import { getDb, type EquipmentRow } from "@/lib/db";
import { addDays } from "@/lib/utils";

/** Fecha del próximo mantenimiento por serial. `null` significa "Sin fecha base". */
export type NextMaintenanceMap = Record<string, string | null>;

/**
 * Próximo mantenimiento de un equipo: último registro + frecuencia; si no hay registros,
 * fecha de entrega + frecuencia. Sin frecuencia o sin ninguna fecha base devuelve null.
 */
export function nextMaintenanceDate(input: { everyDays: number | null; lastPerformedOn: string | null; deliveredOn: string | null }): string | null {
  if (!input.everyDays || input.everyDays <= 0) return null;
  const base = input.lastPerformedOn ?? input.deliveredOn;
  if (!base) return null;
  return addDays(base, input.everyDays);
}

/** Una sola consulta: último mantenimiento registrado de cada serial. */
export function lastMaintenanceBySerial(db = getDb()): Record<string, string> {
  const rows = db.prepare("SELECT serial, MAX(performed_on) AS last_on FROM maintenance_logs GROUP BY serial").all() as { serial: string; last_on: string }[];
  return Object.fromEntries(rows.map((row) => [row.serial, row.last_on]));
}

/** Mapa serial → próximo mantenimiento para toda la lista (una consulta, sin N+1). */
export function nextMaintenanceBySerial(rows: EquipmentRow[], db = getDb()): NextMaintenanceMap {
  const last = lastMaintenanceBySerial(db);
  const map: NextMaintenanceMap = {};
  for (const row of rows) {
    map[row.serial] = nextMaintenanceDate({ everyDays: row.maintenance_every_days, lastPerformedOn: last[row.serial] ?? null, deliveredOn: row.delivered_on });
  }
  return map;
}

/** Próximo mantenimiento de un solo equipo (hoja de vida y respuestas del API). */
export function nextMaintenanceFor(row: EquipmentRow, db = getDb()): string | null {
  const last = db.prepare("SELECT MAX(performed_on) AS last_on FROM maintenance_logs WHERE serial = ?").get(row.serial) as { last_on: string | null } | undefined;
  return nextMaintenanceDate({ everyDays: row.maintenance_every_days, lastPerformedOn: last?.last_on ?? null, deliveredOn: row.delivered_on });
}
