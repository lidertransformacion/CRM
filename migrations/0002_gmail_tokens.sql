-- Per-user Gmail refresh tokens. The ciphertext is AES-GCM output, not the raw token.
-- sender_user_id on email_outbox is added by the application schema (version 4), not here,
-- so this file stays safe to apply after the Worker has already altered that table.
CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id INTEGER NOT NULL UNIQUE,
  google_email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  status TEXT NOT NULL
);
