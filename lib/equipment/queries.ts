import { getDb, type EquipmentRow } from "@/lib/db";
import { recordTiming } from "@/lib/observe";
import type { SqlDb } from "@/lib/sql/types";
import { addDays } from "@/lib/utils";

const DESK_SQL = `SELECT serial, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model,
      warranty_until, warranty_state, maintenance_every_days, hours_min, hours_max, hours_label,
      client_name, address, city, status, delivered_on, salesperson, lead_import_key, notes, created_at, updated_at
    FROM equipment ORDER BY site_id, site_seq`;

export type EquipmentDeskData = {
  equipment: EquipmentRow[];
  nextMaintenance: NextMaintenanceMap;
  hourlyRate: number;
  categories: string[];
  clients: string[];
  cities: string[];
  suppliers: string[];
  salespeople: string[];
};

/** List, next maintenance, rate, and catalogs in one D1 batch. */
export async function equipmentDesk(db?: SqlDb): Promise<EquipmentDeskData> {
  const sql = db ?? (await getDb());
  const started = performance.now();
  const [equipmentRows, maintenanceRows, rateRows, catalogRows] = await sql.batch([
    { sql: DESK_SQL },
    { sql: "SELECT serial, MAX(performed_on) AS last_on FROM maintenance_logs GROUP BY serial" },
    { sql: "SELECT value FROM app_settings WHERE key = ?", params: ["maintenance_hourly_rate_cop"] },
    {
      sql: `SELECT kind, value FROM catalogs WHERE kind IN ('category', 'client', 'city', 'supplier', 'salesperson') ORDER BY sort_order, value`,
    },
  ]);
  recordTiming("db", performance.now() - started);
  const last = Object.fromEntries((maintenanceRows as { serial: string; last_on: string }[]).map((row) => [row.serial, row.last_on]));
  const equipment = equipmentRows as EquipmentRow[];
  const nextMaintenance: NextMaintenanceMap = {};
  for (const row of equipment) {
    nextMaintenance[row.serial] = nextMaintenanceDate({
      everyDays: row.maintenance_every_days,
      lastPerformedOn: last[row.serial] ?? null,
      deliveredOn: row.delivered_on,
    });
  }
  const lists: Record<string, string[]> = { category: [], client: [], city: [], supplier: [], salesperson: [] };
  for (const row of catalogRows as { kind: string; value: string }[]) {
    lists[row.kind]?.push(row.value);
  }
  const rate = Number((rateRows[0] as { value: string } | undefined)?.value ?? 50000);
  return {
    equipment,
    nextMaintenance,
    hourlyRate: rate,
    categories: lists.category,
    clients: lists.client,
    cities: lists.city,
    suppliers: lists.supplier,
    salespeople: lists.salesperson,
  };
}

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
