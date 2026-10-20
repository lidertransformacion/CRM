import { readEnv } from "@/lib/env";

export const DEFAULT_FROM_ADDRESS = "lidertransformacion@libertariocoffee.com";
export const DEFAULT_FROM_NAME = "Comercial Libertario";

export type MailMode = "log" | "smtp" | "gmail_api";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromAddress: string;
  fromName: string;
};

export async function mailMode(): Promise<MailMode> {
  const raw = ((await readEnv("MAIL_MODE")) || "log").trim().toLowerCase();
  if (raw === "smtp" || raw === "gmail_api" || raw === "log") return raw;
  throw new Error(`MAIL_MODE desconocido: ${raw}`);
}

export async function fromIdentity(): Promise<{ address: string; name: string }> {
  const address = ((await readEnv("MAIL_FROM_ADDRESS")) || DEFAULT_FROM_ADDRESS).trim();
  const name = ((await readEnv("MAIL_FROM_NAME")) || DEFAULT_FROM_NAME).trim();
  return { address, name };
}

/**
 * Test mode is the default. Customers are not mailed until MAIL_TEST_MODE is exactly
 * "false" (the switch Santiago sets on the Worker). "0", "off", and "live" also count as off.
 */
export async function mailTestMode(): Promise<boolean> {
  const raw = ((await readEnv("MAIL_TEST_MODE")) || "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "live";
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text wrapped as a UTF-8 HTML body for the Gmail API. */
export function textToHtml(text: string): string {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.45;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

/** In test mode the message goes to the sender, with the original customer address only in the body. */
export function applyTestRedirect(message: OutboundMail, safeTo: string): OutboundMail {
  const original = message.to.trim();
  const subject = message.subject.startsWith("[PRUEBA]") ? message.subject : `[PRUEBA] ${message.subject}`;
  if (original.toLowerCase() === safeTo.trim().toLowerCase()) {
    return { ...message, to: safeTo.trim(), subject };
  }
  const note = `Modo de prueba. Este correo no se envió al cliente.\nDestinatario original: ${original}\n\n`;
  const text = `${note}${message.text}`;
  const banner = `<p><strong>Modo de prueba.</strong> Este correo no se envió al cliente.<br>Destinatario original: ${escapeHtml(original)}</p>`;
  const html = message.html ? `${banner}${message.html}` : textToHtml(text);
  return { ...message, to: safeTo.trim(), subject, text, html };
}

export function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function formatAddress(name: string, address: string): string {
  if (/["\\<>]/.test(name) || /[^\x20-\x7e]/.test(name)) return `${encodeSubject(name)} <${address}>`;
  return `${name} <${address}>`;
}

export function rfc822(message: OutboundMail): string {
  const headers = [
    `From: ${formatAddress(message.fromName, message.fromAddress)}`,
    `To: ${message.to}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
  ];
  const text = message.text.replace(/\r?\n/g, "\r\n");
  if (!message.html) {
    return [...headers, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", text].join("\r\n");
  }
  const boundary = `crm_${crypto.randomUUID().replace(/-/g, "")}`;
  const html = message.html.replace(/\r?\n/g, "\r\n");
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
