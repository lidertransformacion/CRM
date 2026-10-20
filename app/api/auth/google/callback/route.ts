import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/auth/email";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { safeEqual } from "@/lib/auth/password";
import { readCookie, requestIsSecure } from "@/lib/auth/session";
import { hydrateProcessEnv } from "@/lib/env";
import { connectGoogleAccount, googleRedirectUri, GoogleConnectError, type GoogleConnectMotivo } from "@/lib/google/oauth";
import { clearGoogleStateCookie, GOOGLE_STATE_COOKIE, verifyGoogleState } from "@/lib/google/state";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

function finish(request: Request, query: Record<string, string>, secure: boolean): NextResponse {
  const url = new URL("/cuenta", request.url);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Set-Cookie", clearGoogleStateCookie(secure));
  return response;
}

/** Exchanges the code, checks the Google account, and stores the encrypted refresh token. */
export async function GET(request: Request) {
  const secure = requestIsSecure(request);
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    const session = await requireSession(request, db);
    const url = new URL(request.url);
    const googleError = url.searchParams.get("error");
    if (googleError) {
      const motivo: GoogleConnectMotivo = googleError === "access_denied" ? "denegado" : "google";
      return finish(request, { gmail: "error", motivo }, secure);
    }
    const state = url.searchParams.get("state") ?? "";
    const cookie = readCookie(request.headers.get("cookie"), GOOGLE_STATE_COOKIE);
    if (!cookie || !state || !safeEqual(cookie, state)) return finish(request, { gmail: "error", motivo: "state" }, secure);
    const payload = await verifyGoogleState(state);
    if (!payload || payload.uid !== session.uid || normalizeEmail(payload.email) !== normalizeEmail(session.email)) {
      return finish(request, { gmail: "error", motivo: "state" }, secure);
    }
    const code = url.searchParams.get("code") ?? "";
    if (!code) return finish(request, { gmail: "error", motivo: "google" }, secure);
    try {
      await connectGoogleAccount(db, session, code, await googleRedirectUri(request));
    } catch (error) {
      const motivo: GoogleConnectMotivo = error instanceof GoogleConnectError ? error.motivo : "google";
      return finish(request, { gmail: "error", motivo }, secure);
    }
    return finish(request, { gmail: "conectado" }, secure);
  } catch (error) {
    return jsonError(error);
  }
}
