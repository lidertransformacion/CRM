import { catalogRows, getDb, hourlyRate, lastMaintenanceMap, listEquipment, type EquipmentRow } from "@/lib/db";
import { recordTiming } from "@/lib/observe";
import { readThrough } from "@/lib/sql/read-cache";
import type { SqlDb } from "@/lib/sql/types";
import { addDays } from "@/lib/utils";

function deskRow(row: EquipmentRow): EquipmentRow {
  return {
    serial: row.serial,
    asset_number: row.asset_number,
    name: row.name,
    category: row.category,
    site_id: row.site_id,
    site_seq: row.site_seq,
    store_code: row.store_code,
    supplier: row.supplier,
    supplier_reference: row.supplier_reference,
    model: row.model,
    warranty_until: row.warranty_until,
    warranty_state: row.warranty_state,
    maintenance_every_days: row.maintenance_every_days,
    hours_min: row.hours_min,
    hours_max: row.hours_max,
    hours_label: row.hours_label,
    client_name: row.client_name,
    address: row.address,
    city: row.city,
    status: row.status,
    delivered_on: row.delivered_on,
    salesperson: row.salesperson,
    lead_import_key: row.lead_import_key,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } as EquipmentRow;
}

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

/** List, next maintenance, rate, and catalogs. The assembled desk is cached until a write. */
export async function equipmentDesk(db?: SqlDb): Promise<EquipmentDeskData> {
  const sql = db ?? (await getDb());
  return readThrough(sql, "equipment:desk", ["equipment", "maintenance", "settings", "catalogs"], async () => {
    const started = performance.now();
    const [stored, last, rate, catalogs] = await Promise.all([
      listEquipment(sql),
      lastMaintenanceMap(sql),
      hourlyRate(sql),
      catalogRows(sql),
    ]);
    const equipment = stored.map(deskRow);
    recordTiming("db", performance.now() - started);
    const nextMaintenance: NextMaintenanceMap = {};
    for (const row of equipment) {
      nextMaintenance[row.serial] = nextMaintenanceDate({
        everyDays: row.maintenance_every_days,
        lastPerformedOn: last[row.serial] ?? null,
        deliveredOn: row.delivered_on,
      });
    }
    const lists: Record<string, string[]> = { category: [], client: [], city: [], supplier: [], salesperson: [] };
    for (const row of catalogs) lists[row.kind]?.push(row.value);
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
  });
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

/** Último mantenimiento registrado de cada serial, leído del registro ya cacheado. */
export async function lastMaintenanceBySerial(db?: SqlDb): Promise<Record<string, string>> {
  return lastMaintenanceMap(db ?? (await getDb()));
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
  const last = await lastMaintenanceBySerial(db);
  return nextMaintenanceDate({ everyDays: row.maintenance_every_days, lastPerformedOn: last[row.serial] ?? null, deliveredOn: row.delivered_on });
}
