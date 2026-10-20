import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { fromIdentity, mailMode, mailTestMode } from "@/lib/mail/message";
import { enqueueEmail, listOutbox } from "@/lib/mail/outbox";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    await requireSession(request, db);
    const [messages, from, mode, testMode] = await Promise.all([listOutbox(db), fromIdentity(), mailMode(), mailTestMode()]);
    return NextResponse.json({
      mode,
      testMode,
      from,
      messages: messages.map((row) => ({
        id: row.id,
        to: row.to_email,
        subject: row.subject,
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        provider: row.provider_message_id,
        createdAt: row.created_at,
        sentAt: row.sent_at,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    const session = await requireSession(request, db);
    const body = (await request.json()) as { to?: string; subject?: string; body?: string; html?: string; attachmentIds?: string[]; dedupeKey?: string | null; resend?: boolean };
    const queued = await enqueueEmail(db, {
      to: body.to ?? "",
      subject: body.subject ?? "",
      body: body.body ?? "",
      html: body.html,
      attachmentIds: body.attachmentIds ?? [],
      dedupeKey: body.dedupeKey,
      resend: body.resend === true,
      senderUserId: session.uid,
    });
    const from = await fromIdentity();
    return NextResponse.json({ ...queued, from, mode: await mailMode() });
  } catch (error) {
    return jsonError(error);
  }
}
