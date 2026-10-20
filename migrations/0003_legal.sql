-- Legal file manager and contracts (phases 1 and 2).
-- PDF bytes live in R2 (binding LEGAL_FILES, bucket crm-legal-files). This file stores metadata only.
-- Signer order is configurable per contract and may include the external client (role externo).
-- signature_requests and signature_steps are reserved for the signing workflow and are not used yet.
-- No foreign keys: D1 does not enforce them unless PRAGMA foreign_keys is on.

CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS folders_parent_name
  ON folders(IFNULL(parent_id, 0), name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  folder_id INTEGER,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'upload',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS files_folder ON files(folder_id, deleted_at);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY,
  code TEXT UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  counterparty_name TEXT,
  counterparty_nit TEXT,
  country TEXT NOT NULL DEFAULT 'CO',
  status TEXT NOT NULL DEFAULT 'draft',
  current_file_id INTEGER,
  start_date TEXT,
  end_date TEXT,
  renewal_notice_days INTEGER,
  value_cop INTEGER,
  owner_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contracts_owner ON contracts(owner_id);
CREATE INDEX IF NOT EXISTS contracts_end ON contracts(end_date);

CREATE TABLE IF NOT EXISTS contract_links (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('lead', 'equipment')),
  target_key TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (contract_id, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS contract_links_target ON contract_links(target_type, target_key);

CREATE TABLE IF NOT EXISTS contract_novedades (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  file_id INTEGER,
  due_date TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS contract_novedades_contract ON contract_novedades(contract_id, created_at);

CREATE TABLE IF NOT EXISTS contract_signers (
  id INTEGER PRIMARY KEY,
  contract_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('comercial', 'legal', 'gerencia', 'externo')),
  signer_user_id INTEGER,
  signer_email TEXT NOT NULL,
  signer_name TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (contract_id, step_order)
);

CREATE INDEX IF NOT EXISTS contract_signers_contract ON contract_signers(contract_id, step_order);

CREATE TABLE IF NOT EXISTS signature_requests (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  contract_id INTEGER NOT NULL,
  source_file_id INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  final_file_id INTEGER,
  final_sha256 TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS signature_steps (
  id INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL,
  step_order INTEGER NOT NULL,
  role TEXT NOT NULL,
  signer_user_id INTEGER,
  signer_email TEXT NOT NULL,
  signer_name TEXT,
  status TEXT NOT NULL DEFAULT 'waiting',
  otp_hash TEXT,
  otp_expires_at TEXT,
  otp_attempts INTEGER NOT NULL DEFAULT 0,
  input_sha256 TEXT,
  output_sha256 TEXT,
  signature_image_key TEXT,
  signed_at TEXT,
  ip TEXT,
  user_agent TEXT,
  comment TEXT,
  token_hash TEXT,
  UNIQUE (request_id, step_order)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_email TEXT,
  ip TEXT,
  user_agent TEXT,
  data_json TEXT,
  prev_hash TEXT,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_entity ON audit_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT,
  read_at TEXT,
  outbox_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read_at);

UPDATE users SET role = 'comercial' WHERE role = 'user';
