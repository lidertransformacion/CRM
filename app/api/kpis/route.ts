import { NextResponse } from "next/server";
import { deleteTarget, kpiData, saveTarget } from "@/lib/db";
import { KPI_METRICS } from "@/lib/kpi/compute";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...(await kpiData()), catalog: KPI_METRICS });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { salesperson?: string; metric: string; period: string; targetValue: number };
  await saveTarget({ salesperson: body.salesperson ?? "", metric: body.metric, period: body.period, targetValue: Number(body.targetValue) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  await deleteTarget(id);
  return NextResponse.json({ ok: true });
}
