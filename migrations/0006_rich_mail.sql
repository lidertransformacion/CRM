-- Rich mail: file metadata for attachments and inline images, plus the outbox list.
-- Bytes live in R2 (binding MAIL_FILES) when that binding exists.
-- data_base64 is only a fallback for a single file under 400 KB.
-- ALTER TABLE fails if attachment_ids is already present. Skip that line and run the CREATE statements.
ALTER TABLE email_outbox ADD COLUMN attachment_ids TEXT;

CREATE TABLE IF NOT EXISTS mail_files (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT,
  data_base64 TEXT,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS mail_files_user ON mail_files(user_id);
