import { readEnv } from "@/lib/env";

export const DEFAULT_FROM_ADDRESS = "lidertransformacion@libertariocoffee.com";
export const DEFAULT_FROM_NAME = "Comercial Libertario";

export type MailMode = "log" | "smtp" | "gmail_api";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
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

export function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

export function rfc822(message: OutboundMail): string {
  const lines = [
    `From: ${message.fromName} <${message.fromAddress}>`,
    `To: ${message.to}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text.replace(/\r?\n/g, "\r\n"),
  ];
  return lines.join("\r\n");
}

export function base64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
