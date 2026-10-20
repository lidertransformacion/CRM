-- Soft-delete audit for CRM users.
-- users.active and users.deleted_at are added by Worker boot (lib/schema.ts ALTERS)
-- only when PRAGMA table_info does not already list the column.
-- SQLite has no ADD COLUMN IF NOT EXISTS, so this file does not ALTER and can run twice.

CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  detail TEXT
);
