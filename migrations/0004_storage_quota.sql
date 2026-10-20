-- One counter for every byte stored in the CRM's R2 buckets
-- (contracts, mail attachments, visit photos). 10 GB hard limit.

CREATE TABLE IF NOT EXISTS storage_usage (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bytes_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT INTO storage_usage (id, bytes_used, updated_at)
SELECT 1, 0, '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM storage_usage WHERE id = 1);
