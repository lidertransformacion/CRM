import { base64Url, rfc822, type OutboundMail } from "@/lib/mail/message";
import { readEnv } from "@/lib/env";

export type GmailToken = {
  client_id: string;
  client_secret: string;
  refresh_token: string;
};

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
  if (!response.ok) throw new Error("Google rechazó el refresh token de Gmail.");
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google no devolvió access_token.");
  return json.access_token;
}

export async function sendGmail(message: OutboundMail, fetchImpl: typeof fetch = fetch): Promise<string> {
  const raw = await readEnv("GMAIL_TOKEN_JSON");
  if (!raw.trim()) throw new Error("Falta GMAIL_TOKEN_JSON.");
  const access = await gmailAccessToken(parseGmailToken(raw), fetchImpl);
  // The refresh token only includes gmail.send, so this is the only Gmail call.
  const response = await fetchImpl("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(rfc822(message)) }),
  });
  if (!response.ok) throw new Error("Gmail rechazó el mensaje.");
  const json = (await response.json()) as { id?: string };
  return json.id ?? "gmail";
}
