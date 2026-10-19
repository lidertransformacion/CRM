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

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const view = new URL(request.url).searchParams.get("view");
  if (view === "sync") return NextResponse.json(await sheetPlans());
  const [equipment, rate, categories, clients, cities, suppliers, salespeople] = await Promise.all([
    listEquipment(),
    hourlyRate(),
    catalogValues("category"),
    catalogValues("client"),
    catalogValues("city"),
    catalogValues("supplier"),
    catalogValues("salesperson"),
  ]);
  return NextResponse.json({ equipment, hourlyRate: rate, categories, clients, cities, suppliers, salespeople });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EquipmentInput & { catalogKind?: string; catalogValue?: string };
    if (body.catalogKind && body.catalogValue) {
      await addCatalogValue(body.catalogKind, body.catalogValue);
      return NextResponse.json({ ok: true });
    }
    const row = await createEquipment(body);
    return NextResponse.json({ equipment: row });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as EquipmentInput & { hourlyRate?: number };
    if (body.hourlyRate != null && !body.serial) {
      await setHourlyRate(Number(body.hourlyRate));
      return NextResponse.json({ ok: true, hourlyRate: await hourlyRate() });
    }
    const row = await updateEquipment(body.serial, body);
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
    await addMaintenance(body.serial, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo registrar." }, { status: 400 });
  }
}
