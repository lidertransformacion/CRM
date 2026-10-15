import { NextResponse } from "next/server";
import { committeeHistory, currentCommittee, mutateCommittee } from "@/lib/db";
import type { CommitteeAction } from "@/lib/committee/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const current = currentCommittee();
  return NextResponse.json({ doc: current.doc, history: committeeHistory() });
}

export async function POST(request: Request) {
  try {
    const action = (await request.json()) as CommitteeAction;
    const doc = mutateCommittee(action);
    return NextResponse.json({ doc, history: committeeHistory() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}
