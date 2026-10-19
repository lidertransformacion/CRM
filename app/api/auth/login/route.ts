import { NextResponse } from "next/server";
import { authenticate, HttpError } from "@/lib/auth/users";
import { jsonError } from "@/lib/auth/guard";
import { requestIsSecure, sessionCookie, signSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    const db = await getDb();
    const user = await authenticate(db, (body.email ?? "").trim(), (body.password ?? "").trim());
    const token = await signSession({
      uid: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.must_change_password === 1,
      sv: user.session_version,
    });
    const response = NextResponse.json({ ok: true, mustChangePassword: user.must_change_password === 1 });
    response.headers.set("Set-Cookie", sessionCookie(token, requestIsSecure(request)));
    return response;
  } catch (error) {
    if (error instanceof HttpError) return jsonError(error);
    return jsonError(error);
  }
}
