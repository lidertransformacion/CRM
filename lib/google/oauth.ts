import { COMPANY_DOMAIN, isLibertarioEmail, normalizeEmail } from "@/lib/auth/email";
import { readEnv } from "@/lib/env";
import { deleteGmailConnection, saveGmailConnection } from "@/lib/google/tokens";
import type { SqlDb } from "@/lib/sql/types";

/** Send scope configured on the OAuth client. openid and email only identify the account. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GOOGLE_OAUTH_SCOPE = `${GMAIL_SEND_SCOPE} openid email`;

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

export type GoogleConnectMotivo = "state" | "correo" | "dominio" | "token" | "config" | "denegado" | "google";

export class GoogleConnectError extends Error {
  constructor(public motivo: GoogleConnectMotivo) {
    super(motivo);
  }
}

export function buildGoogleAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; loginHint: string }): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    hd: COMPANY_DOMAIN,
    login_hint: input.loginHint,
    state: input.state,
  });
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

export async function googleRedirectUri(request: Request): Promise<string> {
  const override = (await readEnv("GOOGLE_REDIRECT_URI")).trim();
  if (override) return override;
  const url = new URL(request.url);
  return `${url.origin}/api/auth/google/callback`;
}

export async function googleClient(): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = (await readEnv("GOOGLE_CLIENT_ID")).trim();
  const clientSecret = (await readEnv("GOOGLE_CLIENT_SECRET")).trim();
  if (!clientId || !clientSecret) throw new GoogleConnectError("config");
  return { clientId, clientSecret };
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
};

type TokenInfo = {
  email?: string;
  email_verified?: boolean | string;
  verified_email?: boolean | string;
  hd?: string;
  aud?: string;
  azp?: string;
  error?: string;
};

function verified(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Confirms the Google account email. Fails closed when the email is missing or unverified. */
export async function googleAccountEmail(
  accessToken: string,
  idToken: string | undefined,
  clientId: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const response = idToken
    ? await fetchImpl(`${GOOGLE_TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`)
    : await fetchImpl("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new GoogleConnectError("correo");
  const info = await readJson<TokenInfo>(response);
  if (info.error) throw new GoogleConnectError("correo");
  const audience = info.aud || info.azp;
  if (idToken && audience && audience !== clientId) throw new GoogleConnectError("google");
  const email = normalizeEmail(info.email ?? "");
  if (!email || !isLibertarioEmail(email)) throw new GoogleConnectError("correo");
  const flag = info.email_verified ?? info.verified_email;
  if (flag !== undefined && !verified(flag)) throw new GoogleConnectError("correo");
  if (info.hd && info.hd.toLowerCase() !== COMPANY_DOMAIN) throw new GoogleConnectError("dominio");
  return email;
}

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string; refreshToken: string; idToken?: string; clientId: string }> {
  const { clientId, clientSecret } = await googleClient();
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await readJson<TokenResponse>(response);
  if (!response.ok || json.error || !json.access_token || !json.refresh_token) throw new GoogleConnectError("token");
  if (json.scope && !json.scope.split(" ").includes(GMAIL_SEND_SCOPE)) throw new GoogleConnectError("token");
  return { accessToken: json.access_token, refreshToken: json.refresh_token, idToken: json.id_token, clientId };
}

/** Best-effort revoke. A failed revoke still lets the caller delete the local row. */
export async function revokeGoogleToken(token: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Exchanges the code, requires the Google email to equal the CRM user, and stores the encrypted refresh token.
 * A mismatched account is revoked and not stored.
 */
export async function connectGoogleAccount(
  db: SqlDb,
  session: { uid: number; email: string },
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ googleEmail: string }> {
  const exchanged = await exchangeGoogleCode(code, redirectUri, fetchImpl);
  let googleEmail = "";
  try {
    googleEmail = await googleAccountEmail(exchanged.accessToken, exchanged.idToken, exchanged.clientId, fetchImpl);
  } catch (error) {
    await revokeGoogleToken(exchanged.refreshToken, fetchImpl);
    throw error;
  }
  if (googleEmail !== normalizeEmail(session.email)) {
    await revokeGoogleToken(exchanged.refreshToken, fetchImpl);
    throw new GoogleConnectError("correo");
  }
  try {
    await saveGmailConnection(db, { userId: session.uid, googleEmail, refreshToken: exchanged.refreshToken });
  } catch (error) {
    await revokeGoogleToken(exchanged.refreshToken, fetchImpl);
    if (error instanceof GoogleConnectError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/TOKEN_ENC_KEY/.test(message)) throw new GoogleConnectError("config");
    throw new GoogleConnectError("google");
  }
  return { googleEmail };
}

export async function disconnectGoogleAccount(db: SqlDb, userId: number, fetchImpl: typeof fetch = fetch): Promise<{ revoked: boolean }> {
  const row = await db.get<{ refresh_token: string }>("SELECT refresh_token FROM gmail_tokens WHERE user_id = ?", [userId]);
  let revoked = false;
  if (row?.refresh_token) {
    try {
      const { decryptToken } = await import("@/lib/google/crypto");
      revoked = await revokeGoogleToken(await decryptToken(row.refresh_token), fetchImpl);
    } catch {
      revoked = false;
    }
  }
  await deleteGmailConnection(db, userId);
  return { revoked };
}
