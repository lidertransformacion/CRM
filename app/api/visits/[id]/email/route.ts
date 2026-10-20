import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { HttpError } from "@/lib/auth/users";
import { getDb } from "@/lib/db";
import { mailTestMode } from "@/lib/mail/message";
import { enqueueEmail } from "@/lib/mail/outbox";
import { getVisit } from "@/lib/visits/store";

export const dynamic = "force-dynamic";

/** Queues the commercial's visit email through the shared outbox. Delivery still honors MAIL_TEST_MODE. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const { id } = await context.params;
    const visit = await getVisit(db, id);
    if (!visit) throw new HttpError(404, "Esa visita no está en el historial.");
    const body = (await request.json()) as { to?: string; subject?: string; body?: string };
    const queued = await enqueueEmail(db, {
      to: body.to ?? "",
      subject: body.subject ?? "",
      body: body.body ?? "",
      dedupeKey: `visit:${visit.id}:${(body.to ?? "").trim().toLowerCase()}`,
      senderUserId: session.uid,
    });
    return NextResponse.json({ ...queued, testMode: await mailTestMode() });
  } catch (error) {
    return jsonError(error);
  }
}
