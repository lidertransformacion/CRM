import { safeEqual } from "@/lib/auth/password";
import { sessionSecret } from "@/lib/auth/session";

export const GOOGLE_STATE_COOKIE = "crm_google_state";
const STATE_SECONDS = 10 * 60;
const PURPOSE = "google-oauth.v1";

export type GoogleState = {
  nonce: string;
  uid: number;
  email: string;
  exp: number;
};

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

/** Random nonce, bound to the CRM user, HMAC-signed with the session secret. */
export async function signGoogleState(input: { uid: number; email: string }): Promise<string> {
  const payload: GoogleState = {
    nonce: bytesToB64url(crypto.getRandomValues(new Uint8Array(32))),
    uid: input.uid,
    email: input.email,
    exp: Math.floor(Date.now() / 1000) + STATE_SECONDS,
  };
  const body = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(await sessionSecret(), `${PURPOSE}.${body}`);
  return `${body}.${signature}`;
}

export async function verifyGoogleState(token: string | null | undefined): Promise<GoogleState | null> {
  if (!token || !token.includes(".")) return null;
  let secret = "";
  try {
    secret = await sessionSecret();
  } catch {
    return null;
  }
  const dot = token.lastIndexOf(".");
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!body || !signature) return null;
  const expected = await hmac(secret, `${PURPOSE}.${body}`);
  if (!safeEqual(expected, signature)) return null;
  try {
    const payload = JSON.parse(b64urlToString(body)) as GoogleState;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.nonce || !payload.uid || !payload.email) return null;
    return payload;
  } catch {
    return null;
  }
}

export function googleStateCookie(token: string, secure: boolean): string {
  const parts = [`${GOOGLE_STATE_COOKIE}=${encodeURIComponent(token)}`, "HttpOnly", "Path=/", "SameSite=Lax", `Max-Age=${STATE_SECONDS}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearGoogleStateCookie(secure: boolean): string {
  const parts = [`${GOOGLE_STATE_COOKIE}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
