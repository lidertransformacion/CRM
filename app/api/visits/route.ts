import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { ensureVisitPoints, listVisitBriefs, listVisits, saveVisit } from "@/lib/visits/store";
import type { VisitRecord } from "@/lib/visits/model";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    await ensureVisitPoints(db);
    const [visits, briefs] = await Promise.all([listVisits(db), listVisitBriefs(db)]);
    return NextResponse.json({ visits, briefs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    await ensureVisitPoints(db);
    const body = (await request.json()) as VisitRecord;
    const visit = await saveVisit(db, body, session.uid);
    return NextResponse.json({ visit }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
