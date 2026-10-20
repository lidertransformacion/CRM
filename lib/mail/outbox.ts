import { recipientOptedOut } from "@/lib/auth/users";
import { joinAddresses, splitAddresses } from "@/lib/mail/addresses";
import { deliverMail } from "@/lib/mail/deliver";
import { assertFilesOwned, parseAttachmentIds, resolveMailParts } from "@/lib/mail/files";
import { sanitizeEmailHtml, htmlToText } from "@/lib/mail/html";
import { mailMode } from "@/lib/mail/message";
import type { SqlDb } from "@/lib/sql/types";

export type OutboxRow = {
  id: number;
  dedupe_key: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  status: string;
  attempts: number;
  last_error: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  next_attempt_at: string | null;
  sender_user_id: number | null;
  body_html?: string | null;
  cc_email?: string | null;
  attachment_ids?: string | null;
};

const MAX_ATTEMPTS = 5;

function iso(date: Date): string {
  return date.toISOString();
}

async function optedOutAddress(db: SqlDb, addresses: string[]): Promise<string | null> {
  for (const email of addresses) {
    if (await recipientOptedOut(db, email)) return email;
  }
  return null;
}

export function backoffMs(attempts: number): number {
  const steps = [60_000, 300_000, 900_000, 3_600_000];
  return steps[Math.min(Math.max(attempts, 1) - 1, steps.length - 1)] ?? 3_600_000;
}

export async function enqueueEmail(
  db: SqlDb,
  input: {
    to: string | string[];
    subject: string;
    body: string;
    html?: string | null;
    cc?: string | string[] | null;
    attachmentIds?: string[] | null;
    dedupeKey?: string | null;
    resend?: boolean;
    senderUserId?: number | null;
  },
): Promise<{ id: number; deduped: boolean; status: string }> {
  const toList = splitAddresses(input.to);
  if (!toList.length) throw new Error("El destinatario no es un correo.");
  const to = toList.join(", ");
  const ccList = input.cc == null || input.cc === "" ? [] : splitAddresses(input.cc);
  const cc = ccList.length ? joinAddresses(ccList) : null;
  const html = input.html?.trim() ? sanitizeEmailHtml(input.html) : null;
  const body = input.body.trim() || (html ? htmlToText(html) : "");
  const attachmentIds = input.senderUserId && (input.attachmentIds?.length || html)
    ? await (async () => {
        const ids = await assertFilesOwned(db, input.senderUserId as number, html ?? "", input.attachmentIds ?? []);
        return ids.length ? JSON.stringify(ids) : null;
      })()
    : null;
  if (!input.subject.trim()) throw new Error("El asunto es obligatorio.");
  if (!body.trim()) throw new Error("El cuerpo es obligatorio.");
  const now = iso(new Date());
  let dedupeKey = input.dedupeKey?.trim() || null;
  if (dedupeKey && input.resend) dedupeKey = `${dedupeKey}:${now}`;
  if (dedupeKey && !input.resend) {
    const existing = await db.get<OutboxRow>("SELECT * FROM email_outbox WHERE dedupe_key = ?", [dedupeKey]);
    if (existing && existing.status !== "failed") {
      return { id: existing.id, deduped: true, status: existing.status };
    }
    if (existing && existing.status === "failed") {
      await db.run(
        `UPDATE email_outbox SET status = 'queued', attempts = 0, last_error = NULL, next_attempt_at = NULL, subject = ?, body_text = ?, body_html = ?, to_email = ?, cc_email = ?, attachment_ids = ?, sender_user_id = ?, updated_at = ? WHERE id = ?`,
        [input.subject, body, html, to, cc, attachmentIds, input.senderUserId ?? null, now, existing.id],
      );
      return { id: existing.id, deduped: false, status: "queued" };
    }
  }
  const inserted = await db.run(
    `INSERT INTO email_outbox (dedupe_key, to_email, cc_email, subject, body_text, body_html, attachment_ids, status, attempts, created_at, updated_at, sender_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?)`,
    [dedupeKey, to, cc, input.subject.trim(), body, html, attachmentIds, now, now, input.senderUserId ?? null],
  );
  return { id: inserted.lastInsertRowid, deduped: false, status: "queued" };
}

export async function listOutbox(db: SqlDb, limit = 100): Promise<OutboxRow[]> {
  return db.all<OutboxRow>(
    `SELECT id, dedupe_key, to_email, subject, body_text, status, attempts, last_error, provider_message_id, created_at, updated_at, sent_at, next_attempt_at
     FROM email_outbox ORDER BY id DESC LIMIT ?`,
    [limit],
  );
}

export async function retryEmail(db: SqlDb, id: number): Promise<void> {
  const now = iso(new Date());
  const result = await db.run(
    `UPDATE email_outbox SET status = 'queued', attempts = 0, last_error = NULL, next_attempt_at = NULL, updated_at = ? WHERE id = ? AND status = 'failed'`,
    [now, id],
  );
  if (!result.changes) throw new Error("Ese correo no está en fallo.");
}

export async function processOutbox(
  db: SqlDb,
  options: {
    now?: Date;
    limit?: number;
    ids?: number[];
    deliver?: typeof deliverMail;
    backoffMs?: (attempts: number) => number;
  } = {},
): Promise<{ sent: number; failed: number; skipped: number; queued: number }> {
  const now = options.now ?? new Date();
  const nowIso = iso(now);
  const delay = options.backoffMs ?? backoffMs;
  const deliver = options.deliver ?? deliverMail;
  const rows = options.ids?.length
    ? await db.all<OutboxRow>(
        `SELECT * FROM email_outbox WHERE status = 'queued' AND id IN (${options.ids.map(() => "?").join(", ")}) ORDER BY id`,
        options.ids,
      )
    : await db.all<OutboxRow>(
        `SELECT * FROM email_outbox
         WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY id LIMIT ?`,
        [nowIso, options.limit ?? 25],
      );
  const summary = { sent: 0, failed: 0, skipped: 0, queued: 0 };
  if (!options.deliver && (await mailMode()) === "log") {
    summary.queued = rows.length;
    await db.run(
      `INSERT INTO app_settings (key, value) VALUES ('mail_last_run', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [JSON.stringify({ at: nowIso, ...summary, mode: "log" })],
    );
    return summary;
  }
  for (const row of rows) {
    const targets = [...splitAddresses(row.to_email), ...(row.cc_email ? splitAddresses(row.cc_email) : [])];
    const blocked = await optedOutAddress(db, targets);
    if (blocked) {
      await db.run(`UPDATE email_outbox SET status = 'skipped', updated_at = ?, last_error = ? WHERE id = ?`, [
        nowIso,
        "El destinatario optó por no recibir correos.",
        row.id,
      ]);
      summary.skipped += 1;
      continue;
    }
    const attempt = row.attempts + 1;
    await db.run(`UPDATE email_outbox SET status = 'sending', attempts = ?, updated_at = ? WHERE id = ?`, [attempt, nowIso, row.id]);
    try {
      const resolved = await resolveMailParts(db, row.sender_user_id, row.body_html, parseAttachmentIds(row.attachment_ids));
      const providerId = await deliver({
        to: row.to_email,
        cc: row.cc_email?.trim() || undefined,
        subject: row.subject,
        text: row.body_text,
        html: resolved.html,
        parts: resolved.parts,
        senderUserId: row.sender_user_id,
        db,
      });
      await db.run(
        `UPDATE email_outbox SET status = 'sent', sent_at = ?, updated_at = ?, provider_message_id = ?, last_error = NULL WHERE id = ?`,
        [nowIso, nowIso, providerId, row.id],
      );
      summary.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de envío";
      if (attempt >= MAX_ATTEMPTS) {
        await db.run(`UPDATE email_outbox SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`, [message, nowIso, row.id]);
        summary.failed += 1;
      } else {
        const next = new Date(now.getTime() + delay(attempt)).toISOString();
        await db.run(`UPDATE email_outbox SET status = 'queued', last_error = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?`, [
          message,
          next,
          nowIso,
          row.id,
        ]);
        summary.queued += 1;
      }
    }
  }
  await db.run(
    `INSERT INTO app_settings (key, value) VALUES ('mail_last_run', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify({ at: nowIso, ...summary })],
  );
  return summary;
}
