import { NextResponse } from "next/server";
import {
  addCatalogValue,
  addMaintenance,
  catalogValues,
  createEquipment,
  getEquipment,
  hourlyRate,
  setHourlyRate,
  sheetPlans,
  updateEquipment,
  type EquipmentInput,
} from "@/lib/db";
import { equipmentDesk, nextMaintenanceFor } from "@/lib/equipment/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATALOG_KINDS = new Set(["category", "client", "supplier", "city"]);

export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view");
  if (view === "sync") return NextResponse.json(await sheetPlans());
  const desk = await equipmentDesk();
  return NextResponse.json({
    equipment: desk.equipment,
    nextMaintenance: desk.nextMaintenance,
    hourlyRate: desk.hourlyRate,
    categories: desk.categories,
    clients: desk.clients,
    cities: desk.cities,
    suppliers: desk.suppliers,
    salespeople: desk.salespeople,
  });
}

/** Crea un equipo, o agrega un valor a una lista fija cuando llega `catalogKind` + `catalogValue`. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EquipmentInput & { catalogKind?: string; catalogValue?: string };
    if (body.catalogKind && body.catalogValue) {
      if (!CATALOG_KINDS.has(body.catalogKind)) return NextResponse.json({ error: "Esa lista no existe." }, { status: 400 });
      const value = body.catalogValue.trim();
      if (!value) return NextResponse.json({ error: "Escribe un valor." }, { status: 400 });
      await addCatalogValue(body.catalogKind, value);
      return NextResponse.json({ ok: true, kind: body.catalogKind, values: await catalogValues(body.catalogKind) });
    }
    const row = await createEquipment(body);
    return NextResponse.json({ equipment: row, nextMaintenance: await nextMaintenanceFor(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear." }, { status: 400 });
  }
}

/** Edita un equipo, o cambia la tarifa hora cuando llega `hourlyRate` sin serial. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as EquipmentInput & { hourlyRate?: number };
    if (body.hourlyRate != null && !body.serial) {
      const value = Number(body.hourlyRate);
      if (!Number.isFinite(value) || value < 0) return NextResponse.json({ error: "La tarifa debe ser un número mayor o igual a cero." }, { status: 400 });
      await setHourlyRate(value);
      return NextResponse.json({ ok: true, hourlyRate: await hourlyRate() });
    }
    const row = await updateEquipment(body.serial, body);
    return NextResponse.json({ equipment: row, nextMaintenance: await nextMaintenanceFor(row) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}

/** Registra un mantenimiento en la hoja de vida. */
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      serial: string;
      performedOn: string;
      kind: string;
      hours: number;
      partsCost: number;
      technician: string;
      notes: string;
      conditionAfter: string;
    };
    if (!body.performedOn) return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });
    if (!Number.isFinite(body.hours) || body.hours < 0) return NextResponse.json({ error: "Las horas deben ser un número mayor o igual a cero." }, { status: 400 });
    await addMaintenance(body.serial, { ...body, partsCost: Number.isFinite(body.partsCost) ? body.partsCost : 0 });
    const row = await getEquipment(body.serial);
    return NextResponse.json({ ok: true, nextMaintenance: row ? await nextMaintenanceFor(row) : null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo registrar." }, { status: 400 });
  }
}
