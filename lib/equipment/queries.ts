import { getDb, type EquipmentRow } from "@/lib/db";
import type { SqlDb } from "@/lib/sql/types";
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

async function sqlOf(db?: SqlDb): Promise<SqlDb> {
  return db ?? (await getDb());
}

/** Una sola consulta: último mantenimiento registrado de cada serial. */
export async function lastMaintenanceBySerial(db?: SqlDb): Promise<Record<string, string>> {
  const rows = await (await sqlOf(db)).all<{ serial: string; last_on: string }>(
    "SELECT serial, MAX(performed_on) AS last_on FROM maintenance_logs GROUP BY serial",
  );
  return Object.fromEntries(rows.map((row) => [row.serial, row.last_on]));
}

/** Mapa serial → próximo mantenimiento para toda la lista (una consulta, sin N+1). */
export async function nextMaintenanceBySerial(rows: EquipmentRow[], db?: SqlDb): Promise<NextMaintenanceMap> {
  const last = await lastMaintenanceBySerial(db);
  const map: NextMaintenanceMap = {};
  for (const row of rows) {
    map[row.serial] = nextMaintenanceDate({ everyDays: row.maintenance_every_days, lastPerformedOn: last[row.serial] ?? null, deliveredOn: row.delivered_on });
  }
  return map;
}

/** Próximo mantenimiento de un solo equipo (hoja de vida y respuestas del API). */
export async function nextMaintenanceFor(row: EquipmentRow, db?: SqlDb): Promise<string | null> {
  const last = await (await sqlOf(db)).get<{ last_on: string | null }>(
    "SELECT MAX(performed_on) AS last_on FROM maintenance_logs WHERE serial = ?",
    [row.serial],
  );
  return nextMaintenanceDate({ everyDays: row.maintenance_every_days, lastPerformedOn: last?.last_on ?? null, deliveredOn: row.delivered_on });
}
