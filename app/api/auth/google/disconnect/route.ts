import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { disconnectGoogleAccount } from "@/lib/google/oauth";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** Revokes the refresh token at Google and deletes the local row. */
export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    const session = await requireSession(request, db);
    const result = await disconnectGoogleAccount(db, session.uid);
    return NextResponse.json({ ok: true, revoked: result.revoked });
  } catch (error) {
    return jsonError(error);
  }
}
