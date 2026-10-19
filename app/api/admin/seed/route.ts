import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { advanceSeed } from "@/lib/db";
import { hydrateProcessEnv } from "@/lib/env";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    const session = await requireSession(request, db);
    if (session.role !== "admin") throw new HttpError(403, "Solo un administrador puede sembrar los datos.");
    const body = (await request.json().catch(() => ({}))) as { reset?: boolean };
    const report = await advanceSeed(db, { maxBatches: 40, reset: body.reset === true });
    return NextResponse.json(report);
  } catch (error) {
    return jsonError(error);
  }
}
