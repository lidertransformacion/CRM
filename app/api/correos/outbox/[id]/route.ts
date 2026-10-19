import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { hydrateProcessEnv } from "@/lib/env";
import { retryEmail } from "@/lib/mail/outbox";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    await requireSession(request, db);
    const { id } = await context.params;
    const emailId = Number(id);
    if (!Number.isInteger(emailId) || emailId <= 0) return NextResponse.json({ error: "El id no es válido." }, { status: 400 });
    await retryEmail(db, emailId);
    return NextResponse.json({ ok: true, id: emailId, status: "queued" });
  } catch (error) {
    return jsonError(error);
  }
}
