-- Electronic signatures. Safe to run again.
-- signature_requests.rejected_reason and signature_steps.consent_at are added by
-- Worker boot only when PRAGMA table_info does not already list them.
-- SQLite has no ADD COLUMN IF NOT EXISTS, so this file does not ALTER.

CREATE TABLE IF NOT EXISTS signature_agreements (
  user_id INTEGER PRIMARY KEY,
  accepted_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
