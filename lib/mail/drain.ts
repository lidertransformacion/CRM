import { mailMode } from "@/lib/mail/message";
import { processOutbox } from "@/lib/mail/outbox";
import { getDb } from "@/lib/db";

/** Sends due outbox rows when MAIL_MODE=gmail_api. Log mode leaves them queued. */
export async function drainOutbox() {
  if ((await mailMode()) !== "gmail_api") return { sent: 0, failed: 0, skipped: 0, queued: 0 };
  return processOutbox(await getDb());
}
