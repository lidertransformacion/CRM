import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { deleteVisit, getVisit, saveVisit } from "@/lib/visits/store";
import type { VisitRecord } from "@/lib/visits/model";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    const { id } = await context.params;
    const visit = await getVisit(db, id);
    if (!visit) throw new HttpError(404, "Esa visita no está en el historial.");
    return NextResponse.json({ visit });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const { id } = await context.params;
    const body = (await request.json()) as VisitRecord;
    const visit = await saveVisit(db, { ...body, id }, session.uid);
    return NextResponse.json({ visit });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    const { id } = await context.params;
    await deleteVisit(db, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
