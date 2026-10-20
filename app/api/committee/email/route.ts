import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { sendCommitteeSummary } from "@/lib/committee/send";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Sends the committee summary through the shared outbox. HTML is rebuilt on the server. */
export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const body = (await request.json()) as { committeeNumber?: number; to?: string[]; cc?: string[]; asOf?: string; html?: string; attachmentIds?: string[] };
    const result = await sendCommitteeSummary(db, session.uid, {
      committeeNumber: Number(body.committeeNumber),
      to: body.to ?? [],
      cc: body.cc ?? [],
      asOf: body.asOf,
      html: body.html,
      attachmentIds: body.attachmentIds ?? [],
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
