import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { gmailConnection } from "@/lib/google/tokens";
import { createFavorite, listFavorites, listMailDirectory } from "@/lib/mail/favorites";
import { mailTestMode } from "@/lib/mail/message";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const [favorites, users, connection, testMode] = await Promise.all([
      listFavorites(db, session.uid),
      listMailDirectory(db),
      gmailConnection(db, session.uid),
      mailTestMode(),
    ]);
    return NextResponse.json({
      favorites,
      users: users.map((user) => ({ email: user.email })),
      gmailConnected: connection?.status === "connected",
      testMode,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const body = (await request.json()) as { name?: string; to?: string[]; cc?: string[] };
    const favorite = await createFavorite(db, session.uid, {
      name: body.name ?? "",
      to: body.to ?? [],
      cc: body.cc ?? [],
    });
    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
