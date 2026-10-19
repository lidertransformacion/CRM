import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { pullFromSheet, pushToSheet } from "@/lib/sheets/sync";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** Two-way equipment sync. Writes nothing unless SHEETS_SYNC_ENABLED=true. */
export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    await requireSession(request, db);
    const body = (await request.json()) as { direction?: string };
    if (body.direction === "pull") return NextResponse.json(await pullFromSheet(db));
    if (body.direction === "push") return NextResponse.json(await pushToSheet(db));
    return NextResponse.json({ error: "Indica direction pull o push." }, { status: 400 });
  } catch (error) {
    return jsonError(error);
  }
}
