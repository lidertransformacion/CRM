import { sendGmail } from "@/lib/mail/gmail";
import { fromIdentity, mailMode, type OutboundMail } from "@/lib/mail/message";
import { readEnv } from "@/lib/env";

export async function deliverMail(input: { to: string; subject: string; text: string }, fetchImpl: typeof fetch = fetch): Promise<string> {
  const from = await fromIdentity();
  const message: OutboundMail = { ...input, fromAddress: from.address, fromName: from.name };
  const mode = await mailMode();
  if (mode === "log") {
    console.info(`[mail:log] From: ${message.fromName} <${message.fromAddress}> To: ${message.to} Subject: ${message.subject}\n${message.text}`);
    return "log";
  }
  if (mode === "gmail_api") return sendGmail(message, fetchImpl);
  if (mode === "smtp") return sendSmtp(message);
  throw new Error(`MAIL_MODE desconocido: ${mode}`);
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
