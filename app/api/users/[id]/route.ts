import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { deactivateUser, HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, "Usuario inválido.");
    const user = await deactivateUser(db, { id: session.uid, role: session.role }, userId);
    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
