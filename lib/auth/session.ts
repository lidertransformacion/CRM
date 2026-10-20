import { readEnv } from "@/lib/env";
import { safeEqual } from "@/lib/auth/password";
import { normalizeRole, type Role } from "@/lib/auth/roles";

export type { Role };
export { normalizeRole };

export type SessionPayload = {
  uid: number;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  sv: number;
  exp: number;
};

export const SESSION_COOKIE = "crm_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToB64url(new Uint8Array(signature));
}

export async function sessionSecret(): Promise<string> {
  const secret = (await readEnv("SESSION_SECRET")).trim();
  if (secret.length < 16) throw new Error("SESSION_SECRET debe tener al menos 16 caracteres.");
  return secret;
}

export async function signSession(input: Omit<SessionPayload, "exp"> & { exp?: number }): Promise<string> {
  const payload: SessionPayload = {
    ...input,
    exp: input.exp ?? Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(await sessionSecret(), body);
  return `${body}.${signature}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token || !token.includes(".")) return null;
  let secret = "";
  try {
    secret = await sessionSecret();
  } catch {
    return null;
  }
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(secret, body);
  if (!safeEqual(expected, signature)) return null;
  try {
    const payload = JSON.parse(b64urlToString(body)) as SessionPayload & { role: string };
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.uid || !payload.email || typeof payload.role !== "string") return null;
    const stored = payload.role;
    if (stored !== "admin" && stored !== "comercial" && stored !== "legal" && stored !== "gerencia" && stored !== "user") return null;
    return { ...payload, role: normalizeRole(stored) };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return null;
}

export async function readSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  return verifySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${SESSION_SECONDS}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestIsSecure(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
