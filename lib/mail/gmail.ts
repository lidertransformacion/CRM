import { readEnv } from "@/lib/env";
import { base64Url, rfc822, textToHtml, type OutboundMail } from "@/lib/mail/message";

export type GmailToken = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

export class GmailAuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export function parseGmailToken(raw: string): GmailToken {
  let parsed: Partial<GmailToken>;
  try {
    parsed = JSON.parse(raw) as Partial<GmailToken>;
  } catch {
    throw new Error("GMAIL_TOKEN_JSON no es JSON.");
  }
  if (!parsed.client_id || !parsed.client_secret || !parsed.refresh_token) {
    throw new Error("GMAIL_TOKEN_JSON necesita client_id, client_secret y refresh_token.");
  }
  return { client_id: parsed.client_id, client_secret: parsed.client_secret, refresh_token: parsed.refresh_token };
}

export async function gmailAccessToken(token: GmailToken, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({
    client_id: token.client_id,
    client_secret: token.client_secret,
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok) {
    if (json.error === "invalid_grant") throw new GmailAuthError("Google invalidó el permiso de Gmail.", "invalid_grant");
    throw new GmailAuthError("Google rechazó el refresh token de Gmail.", json.error || "refresh_failed");
  }
  if (!json.access_token) throw new Error("Google no devolvió access_token.");
  return json.access_token;
}

function withHtml(message: OutboundMail): OutboundMail {
  return message.html ? message : { ...message, html: textToHtml(message.text) };
}

/** users.messages.send. The only Gmail call; the token's send scope cannot read the mailbox. */
export async function sendGmailMessage(message: OutboundMail, token: GmailToken, fetchImpl: typeof fetch = fetch): Promise<string> {
  const access = await gmailAccessToken(token, fetchImpl);
  const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(rfc822(withHtml(message))) }),
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as { error?: { status?: string; message?: string } };
    if (response.status === 401) throw new GmailAuthError("Google invalidó el permiso de Gmail.", "invalid_grant");
    throw new Error(json.error?.message || "Gmail rechazó el mensaje.");
  }
  const json = (await response.json()) as { id?: string };
  return json.id ?? "gmail";
}

/** Shared mailbox fallback. Uses GMAIL_TOKEN_JSON, not a per-user row. */
export async function sendGmail(message: OutboundMail, fetchImpl: typeof fetch = fetch): Promise<string> {
  const raw = await readEnv("GMAIL_TOKEN_JSON");
  if (!raw.trim()) throw new Error("Falta GMAIL_TOKEN_JSON.");
  return sendGmailMessage(message, parseGmailToken(raw), fetchImpl);
}
