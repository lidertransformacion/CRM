-- Soft-delete columns for CRM users, plus an audit row when an admin removes someone.
-- Wrangler applies this file once. If the Worker already added the columns, skip the
-- two ALTER statements and run the CREATE TABLE only.
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  detail TEXT
);
