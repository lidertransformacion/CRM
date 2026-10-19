import { NextResponse } from "next/server";
import { deleteTarget, kpiData, saveTarget } from "@/lib/db";
import { KPI_METRICS } from "@/lib/kpi/compute";
import { findTarget } from "@/lib/kpi/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Periodo de una meta: un mes en formato AAAA-MM. */
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET() {
  return NextResponse.json({ ...(await kpiData()), catalog: KPI_METRICS });
}

/**
 * Crea o reemplaza una meta (vendedor vacío = equipo) y devuelve la fila guardada con su id real.
 * La tasa de cierre se guarda como porcentaje de 0 a 100, que es lo que devuelve `metricActual`.
 */
export async function POST(request: Request) {
  let body: { salesperson?: unknown; metric?: unknown; period?: unknown; targetValue?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido" }, { status: 400 });
  }
  const salesperson = typeof body.salesperson === "string" ? body.salesperson.trim() : "";
  const metric = typeof body.metric === "string" ? body.metric : "";
  const period = typeof body.period === "string" ? body.period.trim() : "";
  const targetValue = Number(body.targetValue);

  if (!KPI_METRICS.some((item) => item.id === metric)) return NextResponse.json({ error: "Métrica desconocida" }, { status: 400 });
  if (!PERIOD.test(period)) return NextResponse.json({ error: "El periodo debe ser un mes con formato AAAA-MM" }, { status: 400 });
  if (!Number.isFinite(targetValue) || targetValue < 0) return NextResponse.json({ error: "La meta debe ser un número mayor o igual a 0" }, { status: 400 });
  if (metric === "win_rate" && targetValue > 100) return NextResponse.json({ error: "La tasa de cierre es un porcentaje de 0 a 100" }, { status: 400 });

  await saveTarget({ salesperson, metric, period, targetValue });
  const target = await findTarget({ salesperson, metric, period });
  if (!target) return NextResponse.json({ error: "La meta se guardó pero no se pudo leer de vuelta" }, { status: 500 });
  return NextResponse.json({ ok: true, target });
}

/** Elimina una meta por id: `DELETE /api/kpis?id=12`. */
export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Falta el id de la meta" }, { status: 400 });
  await deleteTarget(id);
  return NextResponse.json({ ok: true, id });
}
