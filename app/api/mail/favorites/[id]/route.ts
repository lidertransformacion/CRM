import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { deleteFavorite } from "@/lib/mail/favorites";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const { id } = await context.params;
    const favoriteId = Number(id);
    if (!Number.isInteger(favoriteId)) throw new HttpError(400, "Favorito inválido.");
    await deleteFavorite(db, session.uid, favoriteId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
