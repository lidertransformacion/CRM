import { readEnv } from "@/lib/env";
import { connectedRefreshToken, markGmailDisconnected } from "@/lib/google/tokens";
import { GmailAuthError, sendGmail, sendGmailMessage } from "@/lib/mail/gmail";
import { applyTestRedirect, fromIdentity, mailMode, mailTestMode, textToHtml, type MailPart, type OutboundMail } from "@/lib/mail/message";
import type { SqlDb } from "@/lib/sql/types";

export type DeliverInput = {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  html?: string;
  parts?: MailPart[];
  senderUserId?: number | null;
  db?: SqlDb;
};

async function userToken(db: SqlDb | undefined, userId: number | null | undefined) {
  if (!db || !userId) return null;
  const connected = await connectedRefreshToken(db, userId);
  if (!connected) return null;
  const clientId = (await readEnv("GOOGLE_CLIENT_ID")).trim();
  const clientSecret = (await readEnv("GOOGLE_CLIENT_SECRET")).trim();
  if (!clientId || !clientSecret) throw new Error("Falta la configuración de Google para enviar.");
  return { ...connected, clientId, clientSecret };
}

/**
 * Sends with the sender's connected Gmail when one exists. Otherwise uses MAIL_MODE.
 * Test mode (the default) rewrites the recipient to the sender so customers are not mailed.
 */
export async function deliverMail(input: DeliverInput, fetchImpl: typeof fetch = fetch): Promise<string> {
  const shared = await fromIdentity();
  const message: OutboundMail = {
    to: input.to,
    cc: input.cc?.trim() || undefined,
    subject: input.subject,
    text: input.text,
    html: input.html,
    parts: input.parts,
    fromAddress: shared.address,
    fromName: shared.name,
  };
  const mode = await mailMode();
  if (mode === "log") {
    console.info(`[mail:log] From: ${message.fromName} <${message.fromAddress}> To: ${message.to} Subject: ${message.subject}\n${message.text}`);
    return "log";
  }

  const connected = await userToken(input.db, input.senderUserId);
  if (connected) {
    const outgoing = await prepare({ ...message, fromAddress: connected.googleEmail }, connected.googleEmail);
    try {
      return await sendGmailMessage(
        outgoing,
        { client_id: connected.clientId, client_secret: connected.clientSecret, refresh_token: connected.refreshToken },
        fetchImpl,
      );
    } catch (error) {
      if (!(error instanceof GmailAuthError) || error.code !== "invalid_grant" || !input.db || !input.senderUserId) throw error;
      await markGmailDisconnected(input.db, input.senderUserId);
    }
  }
  const outgoing = await prepare(message, shared.address);
  if (mode === "gmail_api") return sendGmail(outgoing, fetchImpl);
  if (mode === "smtp") return sendSmtp(outgoing);
  throw new Error(`MAIL_MODE desconocido: ${mode}`);
}

async function prepare(message: OutboundMail, safeTo: string): Promise<OutboundMail> {
  const redirected = (await mailTestMode()) ? applyTestRedirect(message, safeTo) : message;
  return redirected.html ? redirected : { ...redirected, html: textToHtml(redirected.text) };
}

/**
 * SMTP exists for parity with the maintenance app. Workers have no general TCP SMTP client;
 * production uses MAIL_MODE=gmail_api. Node can speak SMTP when SMTP_HOST is set.
 */
export async function sendSmtp(message: OutboundMail): Promise<string> {
  const host = (await readEnv("SMTP_HOST")).trim();
  if (!host) throw new Error("Falta SMTP_HOST.");
  try {
    const { smtpSend } = await import("@/lib/mail/smtp-node");
    return smtpSend({
      host,
      port: Number((await readEnv("SMTP_PORT")) || 587),
      user: await readEnv("SMTP_USER"),
      pass: await readEnv("SMTP_PASS"),
      message,
    });
  } catch (error) {
    if (error instanceof Error && /Cannot find module|node:net|not available/i.test(error.message)) {
      throw new Error("SMTP no está disponible en Cloudflare Workers. Use MAIL_MODE=gmail_api.");
    }
    throw error;
  }
}
