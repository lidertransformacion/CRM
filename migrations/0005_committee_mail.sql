-- Committee summary mail.
-- body_html keeps the red-row table. cc_email is the optional copy list.
-- ALTER TABLE is not idempotent. If the Worker already added the columns, skip
-- the two ALTER statements and run the CREATE TABLE statements.
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
