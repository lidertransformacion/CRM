import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { requestIsSecure, sessionCookie, signSession } from "@/lib/auth/session";
import { changePassword, userById } from "@/lib/auth/users";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const db = await getDb();
    const session = await requireSession(request, db);
    const body = (await request.json()) as { currentPassword?: string; nextPassword?: string };
    await changePassword(db, session.uid, body.currentPassword ?? "", body.nextPassword ?? "");
    const user = await userById(db, session.uid);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const token = await signSession({
      uid: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: false,
      sv: user.session_version,
    });
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", sessionCookie(token, requestIsSecure(request)));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
