# Committee summary mail

The Comités screen sends the summary from **Enviar** in the “Correo resumen del comité” dialog. Copy stays available as a secondary action. The HTML body is the same table the clipboard already used, including rows with `background:#fde8e8` for items carried two or more committees.

The interface is Spanish. This note is the operator guide.

## Apply the SQL

Database: D1 `crm-pay-line` (`ded1c012-2e0a-4b1b-9339-24047b32a99e`), binding `DB`.

```bash
npx wrangler d1 migrations apply crm-pay-line --remote
```

That runs `migrations/0005_committee_mail.sql`. The Worker also creates the same objects on boot (`lib/schema.ts`, schema version 5). `CREATE TABLE IF NOT EXISTS` is safe to run twice. The two `ALTER TABLE` statements fail if `body_html` and `cc_email` are already present. If the migration stops on that error, run only the `CREATE TABLE` statements below in the D1 console.

```sql
ALTER TABLE email_outbox ADD COLUMN body_html TEXT;
ALTER TABLE email_outbox ADD COLUMN cc_email TEXT;

CREATE TABLE IF NOT EXISTS mail_favorites (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  to_emails TEXT NOT NULL,
  cc_emails TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS mail_favorites_user ON mail_favorites(user_id);

CREATE TABLE IF NOT EXISTS committee_email_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  committee_number INTEGER,
  to_emails TEXT NOT NULL,
  cc_emails TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  provider_message_id TEXT,
  outbox_id INTEGER,
  test_mode INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS committee_email_log_user ON committee_email_log(user_id, at);
```

## What is stored

- `mail_favorites` is per CRM user. `to_emails` and `cc_emails` are JSON arrays. A user can add and remove only their own rows.
- `email_outbox.body_html` is the summary HTML. `cc_email` is the optional CC list, comma-separated.
- `committee_email_log` records each send attempt: who, which committee, recipients, status, provider id, and whether test mode was on.

## Delivery

`POST /api/committee/email` rebuilds the summary on the server and calls `enqueueEmail` plus `processOutbox` for that row. `sender_user_id` is the signed-in user.

`deliverMail` sends with that user's connected Gmail (`gmail_tokens`) when the row is `connected`. Otherwise it uses `MAIL_MODE`. Production `gmail_api` falls back to the shared mailbox (`GMAIL_TOKEN_JSON`). `MAIL_MODE=log` leaves the row queued and does not call Gmail.

`MAIL_TEST_MODE` is unchanged and stays on unless the secret is exactly `false`, `0`, `off`, or `live`. In test mode the Gmail message goes to the sending account. The original To and CC are written in the body and are not used as recipients. There is no new secret and no new binding.
