import { userById, HttpError } from "@/lib/auth/users";
import { readEnv } from "@/lib/env";
import { safeEqual } from "@/lib/auth/password";
import { normalizeRole, readSessionFromRequest, type SessionPayload } from "@/lib/auth/session";
import type { SqlDb } from "@/lib/sql/types";

export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/api/auth/login";
}

/** Brand files must load on the login page before a session exists. */
export function isStaticAsset(pathname: string): boolean {
  return (
    pathname === "/favicon.png" ||
    pathname === "/favicon.ico" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/brand/")
  );
}

export function allowsDuringPasswordChange(pathname: string): boolean {
  return (
    pathname === "/cuenta" ||
    pathname === "/api/auth/password" ||
    pathname === "/api/auth/logout" ||
    pathname === "/login" ||
    pathname === "/api/auth/google" ||
    pathname === "/api/auth/google/callback" ||
    pathname === "/api/auth/google/disconnect"
  );
}

export async function agentAuthorized(request: Request): Promise<boolean> {
  const token = (await readEnv("ODOO_AGENT_TOKEN")).trim();
  if (token.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!provided) return false;
  return safeEqual(provided, token);
}

/** Returns a Response when the request is not allowed, otherwise null. */
export async function guardRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (isPublicPath(pathname)) return null;
  if (pathname.startsWith("/api/agent/")) {
    if (!(await agentAuthorized(request))) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return null;
  }
  const session = await readSessionFromRequest(request);
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (session.mustChangePassword && !allowsDuringPasswordChange(pathname)) {
    return Response.json({ error: "password_change_required" }, { status: 403 });
  }
  return null;
}

export async function requireSession(request: Request, db: SqlDb): Promise<SessionPayload> {
  const session = await readSessionFromRequest(request);
  if (!session) throw new HttpError(401, "unauthorized");
  const user = await userById(db, session.uid);
  if (!user || user.active === 0 || user.deleted_at || user.session_version !== session.sv) throw new HttpError(401, "unauthorized");
  const url = new URL(request.url);
  if (user.must_change_password && !allowsDuringPasswordChange(url.pathname)) {
    throw new HttpError(403, "password_change_required");
  }
  return {
    uid: user.id,
    email: user.email,
    role: normalizeRole(user.role),
    mustChangePassword: user.must_change_password === 1,
    sv: user.session_version,
    exp: session.exp,
  };
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "No se pudo completar.";
  return Response.json({ error: message }, { status: 400 });
}
