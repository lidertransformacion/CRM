import { NextResponse } from "next/server";
import { jsonError, requireSession } from "@/lib/auth/guard";
import { requestIsSecure } from "@/lib/auth/session";
import { hydrateProcessEnv } from "@/lib/env";
import { buildGoogleAuthorizeUrl, googleClient, googleRedirectUri } from "@/lib/google/oauth";
import { googleStateCookie, signGoogleState } from "@/lib/google/state";
import { getSql } from "@/lib/sql";

export const dynamic = "force-dynamic";

function configError(request: Request): NextResponse {
  const url = new URL("/cuenta", request.url);
  url.searchParams.set("gmail", "error");
  url.searchParams.set("motivo", "config");
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Starts Google OAuth for the signed-in user. The state cookie is checked on the callback. */
export async function GET(request: Request) {
  try {
    await hydrateProcessEnv();
    const db = await getSql();
    const session = await requireSession(request, db);
    let clientId = "";
    try {
      clientId = (await googleClient()).clientId;
    } catch {
      return configError(request);
    }
    const redirectUri = await googleRedirectUri(request);
    const state = await signGoogleState({ uid: session.uid, email: session.email });
    const target = buildGoogleAuthorizeUrl({ clientId, redirectUri, state, loginHint: session.email });
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Set-Cookie", googleStateCookie(state, requestIsSecure(request)));
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
