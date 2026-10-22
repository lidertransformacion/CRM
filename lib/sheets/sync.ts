import { assetNumber, canonicalCategory, canonicalSupplier, siteById, storeCode } from "@/lib/equipment/catalog";
import { splitLocation } from "@/lib/equipment/clients";
import { parseHours, parseWarranty, warrantyStateOn } from "@/lib/equipment/warranty";
import { getSheetsAdapter } from "@/lib/sheets/adapter";
import { planPull, planPush } from "@/lib/sheets/diff";
import type { EquipmentSyncRow, PullPlan, PushPlan, SheetSnapshot } from "@/lib/sheets/types";
import { EQUIPMENT_SYNC_COLUMNS } from "@/lib/sql/columns";
import type { SqlDb } from "@/lib/sql/types";
import { todayIso } from "@/lib/utils";

const OFF_REASON =
  "La sincronización está apagada. Nada se escribió en Google Sheets ni se cambió el inventario local.";

type EquipmentRecord = {
  serial: string;
  sheet_serial: string | null;
  name: string;
  category: string;
  site_id: string;
  site_seq: number;
  store_code: string;
  supplier: string | null;
  supplier_reference: string | null;
  model: string | null;
  warranty_until: string | null;
  warranty_raw: string | null;
  maintenance_every_days: number | null;
  hours_min: number | null;
  hours_max: number | null;
  hours_label: string | null;
  location_raw: string | null;
  client_name: string | null;
  address: string | null;
  city: string | null;
  status: string;
  dirty_json: string;
  sheet_cells_json: string;
};

export type PullApplyResult = {
  written: boolean;
  reason: string;
  updated: number;
  inserted: number;
  skipped: { serial: string; message: string }[];
};

export type PushApplyResult = {
  written: boolean;
  reason: string;
  updates: number;
  inserts: number;
  cleared: number;
};

function toSyncRow(row: EquipmentRecord): EquipmentSyncRow {
  const site = siteById(row.site_id);
  return {
    serial: row.serial,
    sheetSerial: row.sheet_serial,
    name: row.name,
    category: row.category,
    siteId: row.site_id,
    siteName: site?.name ?? row.site_id,
    siteSeq: row.site_seq,
    storeCode: row.store_code,
    supplier: row.supplier ?? "",
    supplierReference: row.supplier_reference ?? "",
    model: row.model ?? "",
    warrantyUntil: row.warranty_until,
    warrantyRaw: row.warranty_raw ?? "",
    everyDays: row.maintenance_every_days,
    hoursLabel: row.hours_label ?? "",
    locationRaw: row.location_raw ?? "",
    clientName: row.client_name,
    address: row.address ?? "",
    city: row.city ?? "",
    dirty: JSON.parse(row.dirty_json) as string[],
    sheetCells: JSON.parse(row.sheet_cells_json) as Record<string, string>,
  };
}

async function localRows(db: SqlDb): Promise<EquipmentSyncRow[]> {
  const rows = await db.all<EquipmentRecord>(`SELECT ${EQUIPMENT_SYNC_COLUMNS} FROM equipment`);
  return rows.map(toSyncRow);
}

function mapped(cells: Record<string, string>) {
  const siteId = (cells.ID ?? "").trim();
  const seqRaw = Number(cells.idnum || "0");
  const warranty = parseWarranty(cells["Fecha expiración Garantía"]);
  const hours = parseHours(cells["Duracción Mantenimiento [horas]"]);
  const everyRaw = (cells["Frecuencia Mantenimiento [dias]"] ?? "").trim();
  const every = everyRaw ? Number(everyRaw) : null;
  const location = splitLocation(cells["Ubicación Comercial cliente hospitality"]);
  const until = warranty.until;
  return {
    siteId,
    seq: Number.isFinite(seqRaw) && seqRaw > 0 ? seqRaw : null,
    name: (cells["Nombre del equipo"] ?? "").trim(),
    category: canonicalCategory(cells["Categoría del equipo"]),
    supplier: canonicalSupplier(cells["Proveedor"]),
    reference: cells["Referencia de Proveedor"] ?? "",
    model: cells.Modelo ?? "",
    warrantyUntil: until,
    warrantyState: until ? warrantyStateOn(until, warranty.state, todayIso()) : warranty.state,
    warrantyRaw: warranty.raw,
    every: every != null && Number.isFinite(every) ? every : null,
    hours,
    hoursLabel: cells["Duracción Mantenimiento [horas]"] ?? "",
    location,
    locationRaw: cells["Ubicación Comercial cliente hospitality"] ?? "",
  };
}

async function equipmentIndex(db: SqlDb) {
  const rows = await db.all<EquipmentRecord>(`SELECT ${EQUIPMENT_SYNC_COLUMNS} FROM equipment`);
  const bySerial = new Map<string, EquipmentRecord>();
  const bySheet = new Map<string, EquipmentRecord>();
  const maxSeq = new Map<string, number>();
  for (const row of rows) {
    bySerial.set(row.serial, row);
    if (row.sheet_serial) bySheet.set(row.sheet_serial, row);
    maxSeq.set(row.site_id, Math.max(maxSeq.get(row.site_id) ?? 0, row.site_seq));
  }
  const assetRow = await db.get<{ asset_number: string }>("SELECT asset_number FROM equipment ORDER BY asset_number DESC LIMIT 1");
  let asset = assetRow ? Number(assetRow.asset_number.replace(/\D/g, "")) : 0;
  if (!Number.isFinite(asset)) asset = 0;
  return {
    find(serial: string) {
      return bySerial.get(serial) ?? bySheet.get(serial);
    },
    seqFor(siteId: string, preferred: number | null, current?: EquipmentRecord) {
      if (preferred != null) {
        maxSeq.set(siteId, Math.max(maxSeq.get(siteId) ?? 0, preferred));
        return preferred;
      }
      if (current && current.site_id === siteId) return current.site_seq;
      const next = (maxSeq.get(siteId) ?? 0) + 1;
      maxSeq.set(siteId, next);
      return next;
    },
    nextAsset() {
      asset += 1;
      return asset;
    },
    remember(row: EquipmentRecord) {
      bySerial.set(row.serial, row);
      if (row.sheet_serial) bySheet.set(row.sheet_serial, row);
      maxSeq.set(row.site_id, Math.max(maxSeq.get(row.site_id) ?? 0, row.site_seq));
    },
  };
}

/** Sheet wins. Local-only serials stay. Rows are never deleted. */
export async function applySnapshot(db: SqlDb, snapshot: SheetSnapshot): Promise<PullApplyResult> {
  const result: PullApplyResult = { written: true, reason: "La hoja quedó aplicada por serial.", updated: 0, inserted: 0, skipped: [] };
  const now = new Date().toISOString();
  const index = await equipmentIndex(db);
  for (const row of snapshot.rows) {
    const serial = row.serial.trim();
    if (!serial) continue;
    const fields = mapped(row.cells);
    if (!fields.name) {
      result.skipped.push({ serial, message: "La fila no tiene nombre." });
      continue;
    }
    if (!siteById(fields.siteId)) {
      result.skipped.push({ serial, message: "La sede de la hoja no está en la lista." });
      continue;
    }
    const current = index.find(serial);
    const seq = index.seqFor(fields.siteId, fields.seq, current);
    const code = storeCode(fields.siteId, seq);
    const status = fields.location.client || fields.location.address ? "en_comodato" : "en_tienda";
    const cells = JSON.stringify(row.cells);
    if (current) {
      const nextStatus = current.status === "en_tienda" || current.status === "en_comodato" ? status : current.status;
      await db.run(
        `UPDATE equipment SET sheet_serial = ?, name = ?, category = ?, site_id = ?, site_seq = ?, store_code = ?, supplier = ?,
          supplier_reference = ?, model = ?, warranty_until = ?, warranty_state = ?, warranty_raw = ?, maintenance_every_days = ?,
          hours_min = ?, hours_max = ?, hours_label = ?, client_name = ?, address = ?, city = ?, city_source = ?, location_raw = ?,
          status = ?, dirty_json = '[]', sheet_cells_json = ?, updated_at = ? WHERE serial = ?`,
        [
          serial,
          fields.name,
          fields.category || current.category,
          fields.siteId,
          seq,
          code,
          fields.supplier,
          fields.reference,
          fields.model,
          fields.warrantyUntil,
          fields.warrantyState,
          fields.warrantyRaw,
          fields.every,
          fields.hours.min,
          fields.hours.max,
          fields.hoursLabel,
          fields.location.client,
          fields.location.address,
          fields.location.city,
          fields.location.citySource,
          fields.locationRaw,
          nextStatus,
          cells,
          now,
          current.serial,
        ],
      );
      if (current.name !== fields.name) {
        await db.run("INSERT INTO equipment_history (serial, at, field, from_value, to_value) VALUES (?, ?, 'sheets', ?, ?)", [
          current.serial,
          now,
          current.name,
          fields.name,
        ]);
      }
      current.site_id = fields.siteId;
      current.site_seq = seq;
      current.sheet_serial = serial;
      current.name = fields.name;
      current.category = fields.category || current.category;
      current.status = nextStatus;
      index.remember(current);
      result.updated += 1;
      continue;
    }
    const asset = index.nextAsset();
    await db.run(
      `INSERT INTO equipment (
        serial, sheet_serial, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model,
        warranty_until, warranty_state, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label,
        client_name, address, city, city_source, location_raw, status, notes, dirty_json, sheet_cells_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '[]', ?, ?, ?)`,
      [
        serial,
        serial,
        assetNumber(asset),
        fields.name,
        fields.category || "Sin categoría",
        fields.siteId,
        seq,
        code,
        fields.supplier,
        fields.reference,
        fields.model,
        fields.warrantyUntil,
        fields.warrantyState,
        fields.warrantyRaw,
        fields.every,
        fields.hours.min,
        fields.hours.max,
        fields.hoursLabel,
        fields.location.client,
        fields.location.address,
        fields.location.city,
        fields.location.citySource,
        fields.locationRaw,
        status,
        cells,
        now,
        now,
      ],
    );
    index.remember({
      serial,
      sheet_serial: serial,
      name: fields.name,
      category: fields.category || "Sin categoría",
      site_id: fields.siteId,
      site_seq: seq,
      store_code: code,
      supplier: fields.supplier,
      supplier_reference: fields.reference,
      model: fields.model,
      warranty_until: fields.warrantyUntil,
      warranty_raw: fields.warrantyRaw,
      maintenance_every_days: fields.every,
      hours_min: fields.hours.min,
      hours_max: fields.hours.max,
      hours_label: fields.hoursLabel,
      location_raw: fields.locationRaw,
      client_name: fields.location.client,
      address: fields.location.address,
      city: fields.location.city,
      status,
      dirty_json: "[]",
      sheet_cells_json: cells,
    });
    result.inserted += 1;
  }
  return result;
}

export async function rememberPush(db: SqlDb, plan: PushPlan): Promise<number> {
  const now = new Date().toISOString();
  const rows = await db.all<{ serial: string; sheet_serial: string | null; sheet_cells_json: string }>(
    "SELECT serial, sheet_serial, sheet_cells_json FROM equipment",
  );
  const byKey = new Map<string, { sheet_cells_json: string }>();
  for (const row of rows) {
    byKey.set(row.serial, row);
    if (row.sheet_serial) byKey.set(row.sheet_serial, row);
  }
  let cleared = 0;
  for (const update of plan.updates) {
    const current = byKey.get(update.serial);
    if (!current) continue;
    const cells = JSON.parse(current.sheet_cells_json) as Record<string, string>;
    for (const change of update.changes) cells[change.column] = change.to;
    const sheetCells = JSON.stringify(cells);
    const result = await db.run("UPDATE equipment SET dirty_json = '[]', sheet_serial = ?, sheet_cells_json = ?, updated_at = ? WHERE serial = ? OR sheet_serial = ?", [
      update.serial,
      sheetCells,
      now,
      update.serial,
      update.serial,
    ]);
    current.sheet_cells_json = sheetCells;
    cleared += result.changes;
  }
  for (const insert of plan.inserts) {
    const result = await db.run("UPDATE equipment SET dirty_json = '[]', sheet_serial = ?, sheet_cells_json = ?, updated_at = ? WHERE serial = ?", [
      insert.serial,
      JSON.stringify(insert.values),
      now,
      insert.serial,
    ]);
    cleared += result.changes;
  }
  return cleared;
}

export async function pullFromSheet(db: SqlDb): Promise<PullApplyResult> {
  const adapter = await getSheetsAdapter();
  if (adapter.mode !== "live") return { written: false, reason: OFF_REASON, updated: 0, inserted: 0, skipped: [] };
  const snapshot = await adapter.pull();
  return applySnapshot(db, snapshot);
}

export async function pushToSheet(db: SqlDb): Promise<PushApplyResult> {
  const adapter = await getSheetsAdapter();
  if (adapter.mode !== "live") return { written: false, reason: OFF_REASON, updates: 0, inserts: 0, cleared: 0 };
  const snapshot = await adapter.pull();
  const plan = planPush(await localRows(db), snapshot);
  const applied = await adapter.apply(plan);
  const cleared = applied.written ? await rememberPush(db, plan) : 0;
  return { ...applied, cleared };
}

export async function livePlans(db: SqlDb): Promise<{ push: PushPlan; pull: PullPlan; snapshot: SheetSnapshot }> {
  const adapter = await getSheetsAdapter();
  const snapshot = await adapter.pull();
  const local = await localRows(db);
  return { push: planPush(local, snapshot), pull: planPull(local, snapshot), snapshot };
}
