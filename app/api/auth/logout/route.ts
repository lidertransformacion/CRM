import { NextResponse } from "next/server";
import { clearSessionCookie, requestIsSecure } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearSessionCookie(requestIsSecure(request)));
  return response;
}
