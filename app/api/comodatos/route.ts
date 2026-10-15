import { NextResponse } from "next/server";
import {
  addCatalogValue,
  addMaintenance,
  catalogValues,
  createEquipment,
  hourlyRate,
  listEquipment,
  setHourlyRate,
  sheetPlans,
  updateEquipment,
  type EquipmentInput,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view");
  if (view === "sync") return NextResponse.json(sheetPlans());
  return NextResponse.json({
    equipment: listEquipment(),
    hourlyRate: hourlyRate(),
    categories: catalogValues("category"),
    clients: catalogValues("client"),
    cities: catalogValues("city"),
    suppliers: catalogValues("supplier"),
    salespeople: catalogValues("salesperson"),
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EquipmentInput & { catalogKind?: string; catalogValue?: string };
    if (body.catalogKind && body.catalogValue) {
      addCatalogValue(body.catalogKind, body.catalogValue);
      return NextResponse.json({ ok: true });
    }
    const row = createEquipment(body);
    return NextResponse.json({ equipment: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as EquipmentInput & { hourlyRate?: number };
    if (body.hourlyRate != null && !body.serial) {
      setHourlyRate(Number(body.hourlyRate));
      return NextResponse.json({ ok: true, hourlyRate: hourlyRate() });
    }
    const row = updateEquipment(body.serial, body);
    return NextResponse.json({ equipment: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}

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
    addMaintenance(body.serial, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo registrar." }, { status: 400 });
  }
}
