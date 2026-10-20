import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { ensureVisitPoints, importVisitCodes } from "@/lib/visits/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    await ensureVisitPoints(db);
    const body = (await request.json()) as { text?: string };
    const result = await importVisitCodes(db, body.text ?? "", session.uid);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
