import { HttpError, recipientOptedOut } from "@/lib/auth/users";
import { committeeByNumber } from "@/lib/db";
import { buildCommitteeEmail } from "@/lib/committee/email";
import { splitAddresses } from "@/lib/mail/addresses";
import { mailMode, mailTestMode } from "@/lib/mail/message";
import { enqueueEmail, processOutbox } from "@/lib/mail/outbox";
import type { SqlDb } from "@/lib/sql/types";
import { todayIso } from "@/lib/utils";

export type CommitteeSendResult = {
  status: string;
  testMode: boolean;
  mode: string;
  error: string | null;
  outboxId: number;
  logId: number;
  provider: string | null;
};

/**
 * Builds the committee summary on the server and sends it through the outbox.
 * Delivery uses the signed-in user's Gmail when connected, otherwise the shared mailbox.
 * MAIL_TEST_MODE still redirects the message away from the listed recipients.
 */
export async function sendCommitteeSummary(
  db: SqlDb,
  actorId: number,
  input: { committeeNumber: number; to: string[] | string; cc?: string[] | string | null; asOf?: string },
): Promise<CommitteeSendResult> {
  const number = input.committeeNumber;
  if (!Number.isInteger(number) || number <= 0) throw new HttpError(400, "Comité inválido.");
  const doc = await committeeByNumber(number, db);
  if (!doc) throw new HttpError(404, "No hay acta guardada para ese comité.");
  const asOf = input.asOf && /^\d{4}-\d{2}-\d{2}$/.test(input.asOf) ? input.asOf : todayIso();
  const to = splitAddresses(input.to);
  const cc = input.cc == null || input.cc === "" ? [] : splitAddresses(input.cc);
  if (!to.length) throw new HttpError(400, "Agrega al menos un destinatario.");
  if (to.length + cc.length > 40) throw new HttpError(400, "Hay demasiados destinatarios.");
  for (const email of [...to, ...cc]) {
    if (await recipientOptedOut(db, email)) throw new HttpError(400, `${email} optó por no recibir correos.`);
  }
  const email = buildCommitteeEmail(doc, asOf);
  const queued = await enqueueEmail(db, {
    to,
    cc,
    subject: email.subject,
    body: email.text,
    html: email.html,
    senderUserId: actorId,
  });
  await processOutbox(db, { ids: [queued.id] });
  const row = await db.get<{ status: string; last_error: string | null; provider_message_id: string | null }>(
    "SELECT status, last_error, provider_message_id FROM email_outbox WHERE id = ?",
    [queued.id],
  );
  const status = row?.status ?? queued.status;
  const error = row?.last_error ?? null;
  const testMode = await mailTestMode();
  const now = new Date().toISOString();
  const logged = await db.run(
    `INSERT INTO committee_email_log (at, user_id, committee_number, to_emails, cc_emails, subject, status, error, provider_message_id, outbox_id, test_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [now, actorId, number, JSON.stringify(to), JSON.stringify(cc), email.subject, status, error, row?.provider_message_id ?? null, queued.id, testMode ? 1 : 0],
  );
  return {
    status,
    testMode,
    mode: await mailMode(),
    error,
    outboxId: queued.id,
    logId: logged.lastInsertRowid,
    provider: row?.provider_message_id ?? null,
  };
}
