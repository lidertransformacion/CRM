import { NextResponse } from "next/server";
import { committeeHistory, currentCommittee, mutateCommittee } from "@/lib/db";
import type { CommitteeAction } from "@/lib/committee/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = await currentCommittee();
  return NextResponse.json({ doc: current.doc, history: await committeeHistory() });
}

export async function POST(request: Request) {
  try {
    const action = (await request.json()) as CommitteeAction;
    const doc = await mutateCommittee(action);
    return NextResponse.json({ doc, history: await committeeHistory() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}
