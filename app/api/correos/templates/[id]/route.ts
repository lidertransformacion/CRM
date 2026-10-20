import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { updateEmailTemplate } from "@/lib/emails/queries";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb();
    await requireSession(request, db);
    const { id } = await context.params;
    const body = (await request.json()) as { subject?: string; body?: string };
    const template = await updateEmailTemplate(db, id, { subject: body.subject ?? "", body: body.body ?? "" });
    return NextResponse.json({ template });
  } catch (error) {
    return jsonError(error);
  }
}
