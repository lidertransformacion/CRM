import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { mailMode } from "@/lib/mail/message";
import { processOutbox } from "@/lib/mail/outbox";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/** Drains the queue when MAIL_MODE=gmail_api. Log mode leaves rows queued. */
export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    await requireSession(request, db);
    const summary = await processOutbox(db);
    return NextResponse.json({ ...summary, mode: await mailMode() });
  } catch (error) {
    return jsonError(error);
  }
}
