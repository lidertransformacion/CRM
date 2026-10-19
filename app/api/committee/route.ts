import { NextResponse } from "next/server";
import { committeeByNumber, committeeHistory, currentCommittee, mutateCommittee } from "@/lib/db";
import type { CommitteeAction } from "@/lib/committee/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `GET /api/committee` devuelve el acta actual; `?number=N` devuelve un acta archivada (solo lectura). */
export async function GET(request: Request) {
  const number = Number(new URL(request.url).searchParams.get("number"));
  if (Number.isFinite(number) && number > 0) {
    const doc = await committeeByNumber(number);
    if (!doc) return NextResponse.json({ error: "No hay acta guardada para ese comité." }, { status: 404 });
    return NextResponse.json({ doc });
  }
  const current = await currentCommittee();
  return NextResponse.json({ doc: current.doc, history: await committeeHistory() });
}

export async function POST(request: Request) {
  try {
    const action = (await request.json()) as CommitteeAction | null;
    if (!action || typeof action !== "object" || typeof action.type !== "string") {
      return NextResponse.json({ error: "La acción no es válida." }, { status: 400 });
    }
    const doc = await mutateCommittee(action);
    return NextResponse.json({ doc, history: await committeeHistory() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}
