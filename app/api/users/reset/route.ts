import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { resetUserPassword } from "@/lib/auth/users";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const body = (await request.json()) as { email?: string; password?: string };
    const reset = await resetUserPassword(db, session, { email: body.email ?? "", password: body.password ?? "" });
    return NextResponse.json({ ok: true, email: reset.email, mustChangePassword: true });
  } catch (error) {
    return jsonError(error);
  }
}
