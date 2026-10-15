import { composeLocation } from "@/lib/equipment/clients";
import { FORMULA_HEADERS, type EquipmentSyncRow, type PullPlan, type PushPlan, type SheetSnapshot } from "@/lib/sheets/types";

function normSerial(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function cell(row: EquipmentSyncRow, header: string): string {
  return row.sheetCells[header] ?? "";
}

function dirty(row: EquipmentSyncRow, field: string): boolean {
  return row.dirty.includes(field);
}

/** Value we would write. Null means the column is formula-owned and must not be written. */
export function outboundCell(row: EquipmentSyncRow, header: string): string | null {
  if (FORMULA_HEADERS.has(header)) return null;
  const original = row.sheetCells[header];
  const hasOriginal = original !== undefined;
  switch (header) {
    case "Nº de serie":
      return dirty(row, "serial") || !hasOriginal ? row.serial : original;
    case "Nombre del equipo":
      return dirty(row, "name") || !hasOriginal ? row.name : original;
    case "Categoría del equipo":
      return dirty(row, "category") || !hasOriginal ? row.category : original;
    case "ID":
      return dirty(row, "site") || !hasOriginal ? row.siteId : original;
    case "Ubicación":
      return dirty(row, "site") || !hasOriginal ? row.siteName : original;
    case "Ubicación Comercial cliente hospitality":
      if (!dirty(row, "location") && hasOriginal) return original;
      return row.locationRaw && !dirty(row, "location")
        ? row.locationRaw
        : composeLocation(row.clientName, row.address, row.city);
    case "Proveedor":
      return dirty(row, "supplier") || !hasOriginal ? row.supplier : original;
    case "Referencia de Proveedor":
      return dirty(row, "supplier_reference") || !hasOriginal ? row.supplierReference : original;
    case "Modelo":
      return dirty(row, "model") || !hasOriginal ? row.model : original;
    case "Fecha expiración Garantía":
      if (!dirty(row, "warranty") && hasOriginal) return original;
      return row.warrantyUntil ?? row.warrantyRaw ?? "";
    case "Frecuencia Mantenimiento [dias]":
      if (!dirty(row, "maintenance") && hasOriginal) return original;
      return row.everyDays == null ? "" : String(row.everyDays);
    case "Duracción Mantenimiento [horas]":
      if (!dirty(row, "hours") && hasOriginal) return original;
      return row.hoursLabel;
    default:
      return hasOriginal ? original : "";
  }
}

export function planPush(local: EquipmentSyncRow[], snapshot: SheetSnapshot): PushPlan {
  const bySerial = new Map<string, (typeof snapshot.rows)[number]>();
  for (const row of snapshot.rows) {
    const key = normSerial(row.serial);
    if (!key || bySerial.has(key)) continue;
    bySerial.set(key, row);
  }
  const updates: PushPlan["updates"] = [];
  const inserts: PushPlan["inserts"] = [];
  const formulaNotes: PushPlan["formulaNotes"] = [];

  for (const equipment of local) {
    const matchKey = normSerial(equipment.sheetSerial || equipment.serial);
    const sheetRow = bySerial.get(matchKey);
    if (!sheetRow) {
      const values: Record<string, string> = {};
      for (const header of snapshot.headers) {
        const next = outboundCell(equipment, header);
        if (next == null) {
          formulaNotes.push({ serial: equipment.serial, column: header, localValue: header === "Codigo Tienda" ? equipment.storeCode : String(equipment.siteSeq) });
          continue;
        }
        values[header] = next;
      }
      inserts.push({ serial: equipment.serial, values });
      continue;
    }
    const changes = [];
    for (const header of snapshot.headers) {
      if (FORMULA_HEADERS.has(header)) {
        const localValue = header === "Codigo Tienda" ? equipment.storeCode : String(equipment.siteSeq);
        if (localValue && localValue !== (sheetRow.cells[header] ?? "") && dirty(equipment, "site")) {
          formulaNotes.push({ serial: sheetRow.serial, column: header, localValue });
        }
        continue;
      }
      const next = outboundCell(equipment, header) ?? "";
      const prev = sheetRow.cells[header] ?? "";
      if (next !== prev) changes.push({ column: header, from: prev, to: next });
    }
    if (changes.length) updates.push({ serial: sheetRow.serial, rowNumber: sheetRow.rowNumber, changes });
  }

  return { updates, inserts, deletes: [], formulaNotes };
}

export function planPull(local: EquipmentSyncRow[], snapshot: SheetSnapshot): PullPlan {
  const locals = new Map(local.map((row) => [normSerial(row.sheetSerial || row.serial), row]));
  const seen = new Set<string>();
  const updates: PullPlan["updates"] = [];
  const inserts: PullPlan["inserts"] = [];
  for (const row of snapshot.rows) {
    const key = normSerial(row.serial);
    if (!key) continue;
    seen.add(key);
    const current = locals.get(key);
    if (!current) {
      inserts.push({ serial: row.serial, cells: row.cells });
      continue;
    }
    const changes = [];
    for (const header of snapshot.headers) {
      if (FORMULA_HEADERS.has(header)) continue;
      const sheetValue = row.cells[header] ?? "";
      const localValue = outboundCell(current, header) ?? "";
      if (sheetValue !== localValue) {
        changes.push({ serial: row.serial, column: header, local: localValue, sheet: sheetValue });
      }
    }
    if (changes.length) updates.push({ serial: row.serial, changes });
  }
  const localOnly = local
    .filter((row) => !seen.has(normSerial(row.sheetSerial || row.serial)))
    .map((row) => row.serial);
  return { updates, inserts, localOnly };
}
