import type { EquipmentRow } from "@/lib/db";
import { warrantyStateOn, type WarrantyState } from "@/lib/equipment/warranty";
import { daysBetween, shortDate } from "@/lib/utils";

/** Listas fijas que alimentan los selects del formulario. */
export type Lists = { categories: string[]; clients: string[]; cities: string[]; suppliers: string[]; salespeople: string[] };

export type CatalogKind = "category" | "client" | "supplier" | "city";

export const CATALOG_KINDS: { kind: CatalogKind; listKey: keyof Lists; label: string; placeholder: string }[] = [
  { kind: "category", listKey: "categories", label: "Categorías", placeholder: "Nueva categoría" },
  { kind: "client", listKey: "clients", label: "Clientes", placeholder: "Nuevo cliente" },
  { kind: "supplier", listKey: "suppliers", label: "Proveedores", placeholder: "Nuevo proveedor" },
  { kind: "city", listKey: "cities", label: "Ciudades", placeholder: "Nueva ciudad" },
];

/** Estado del formulario: todo como texto para que los inputs sean controlados. */
export type EquipmentForm = {
  serial: string;
  name: string;
  category: string;
  siteId: string;
  supplier: string;
  supplierReference: string;
  model: string;
  warrantyUntil: string;
  everyDays: string;
  hoursMin: string;
  hoursMax: string;
  clientName: string;
  address: string;
  city: string;
  status: string;
  deliveredOn: string;
  salesperson: string;
  notes: string;
};

export const EMPTY_FORM: EquipmentForm = {
  serial: "",
  name: "",
  category: "",
  siteId: "COM",
  supplier: "",
  supplierReference: "",
  model: "",
  warrantyUntil: "",
  everyDays: "90",
  hoursMin: "1",
  hoursMax: "3",
  clientName: "",
  address: "",
  city: "",
  status: "en_tienda",
  deliveredOn: "",
  salesperson: "",
  notes: "",
};

export function toForm(row: EquipmentRow): EquipmentForm {
  return {
    serial: row.serial,
    name: row.name,
    category: row.category,
    siteId: row.site_id,
    supplier: row.supplier ?? "",
    supplierReference: row.supplier_reference ?? "",
    model: row.model ?? "",
    warrantyUntil: row.warranty_until ?? "",
    everyDays: row.maintenance_every_days ? String(row.maintenance_every_days) : "",
    hoursMin: row.hours_min == null ? "" : String(row.hours_min),
    hoursMax: row.hours_max == null ? "" : String(row.hours_max),
    clientName: row.client_name ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    status: row.status,
    deliveredOn: row.delivered_on ?? "",
    salesperson: row.salesperson ?? "",
    notes: row.notes ?? "",
  };
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Cuerpo que se envía al API (POST al crear, PATCH al editar). */
export function toPayload(form: EquipmentForm) {
  return {
    serial: form.serial.trim(),
    name: form.name.trim(),
    category: form.category,
    siteId: form.siteId,
    supplier: form.supplier,
    supplierReference: form.supplierReference.trim(),
    model: form.model.trim(),
    warrantyUntil: form.warrantyUntil || null,
    everyDays: numberOrNull(form.everyDays),
    hoursMin: numberOrNull(form.hoursMin),
    hoursMax: numberOrNull(form.hoursMax),
    clientName: form.clientName || null,
    address: form.address.trim(),
    city: form.city,
    status: form.status,
    deliveredOn: form.deliveredOn || null,
    salesperson: form.salesperson || null,
    notes: form.notes.trim(),
  };
}

export type Tone = "neutral" | "ok" | "warn" | "danger" | "info";

/** Fecha corta con año cuando no es el año en curso: "30 jun 2027". */
export function dateLabel(iso: string | null | undefined, today: string): string {
  if (!iso) return "Sin fecha";
  const year = iso.slice(0, 4);
  const short = shortDate(iso);
  return year === today.slice(0, 4) ? short : `${short} ${year}`;
}

export const STATUS_TONE: Record<string, Tone> = {
  en_tienda: "neutral",
  en_comodato: "info",
  en_bodega: "neutral",
  en_mantenimiento: "warn",
  devuelto: "neutral",
  baja: "danger",
};

/** Estado de garantía calculado hoy a partir de la fecha o, si no hay, del estado leído de la hoja. */
export function warrantyOf(row: Pick<EquipmentRow, "warranty_until" | "warranty_state">, today: string): WarrantyState {
  return warrantyStateOn(row.warranty_until, row.warranty_state as WarrantyState, today);
}

export function warrantyBadge(until: string | null, fallback: WarrantyState, today: string): { tone: Tone; label: string; state: WarrantyState } {
  const state = warrantyStateOn(until, fallback, today);
  if (state === "vencida") return { tone: "danger", label: until ? `Vencida · ${dateLabel(until, today)}` : "Vencida", state };
  if (state === "vigente") {
    if (until) {
      const days = daysBetween(today, until);
      if (days <= 30) return { tone: "warn", label: days === 0 ? "Vence hoy" : `Vence en ${days} ${days === 1 ? "día" : "días"}`, state };
      return { tone: "ok", label: `Vigente · ${dateLabel(until, today)}`, state };
    }
    return { tone: "ok", label: "Vigente", state };
  }
  return { tone: "neutral", label: "Sin dato", state };
}

/** Etiqueta que acompaña a la fecha del próximo mantenimiento. Tono neutral = sin aviso. */
export function maintenanceBadge(next: string | null | undefined, today: string): { tone: Tone; label: string } {
  if (!next) return { tone: "neutral", label: "Sin fecha base" };
  const days = daysBetween(today, next);
  if (days < 0) return { tone: "danger", label: "Vencido" };
  if (days <= 7) return { tone: "warn", label: days === 0 ? "Hoy" : `En ${days} ${days === 1 ? "día" : "días"}` };
  return { tone: "neutral", label: dateLabel(next, today) };
}

/** Mantenimiento vencido o sin fecha base: lo que requiere atención. */
export function maintenanceNeedsAttention(next: string | null | undefined, today: string): boolean {
  return !next || next < today;
}

export const HISTORY_FIELD_LABELS: Record<string, string> = {
  alta: "Alta del equipo",
  name: "Nombre",
  category: "Categoría",
  site: "Sede",
  supplier: "Proveedor",
  client: "Cliente",
  address: "Dirección",
  city: "Ciudad",
  status: "Estado",
  salesperson: "Vendedor",
  delivered_on: "Fecha de entrega",
  store_code: "Código de tienda",
  mantenimiento: "Mantenimiento",
};

export const MAINTENANCE_KIND_TONE: Record<string, Tone> = { preventivo: "info", correctivo: "warn" };

export const CONDITION_TONE: Record<string, Tone> = { Operativo: "ok", Observación: "warn", "Fuera de servicio": "danger" };

export const CONDITIONS = ["Operativo", "Observación", "Fuera de servicio"] as const;
