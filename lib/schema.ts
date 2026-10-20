/** Application schema. D1 migrations and the local SQLite opener both apply this. */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS committee_docs (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL,
  held_on TEXT NOT NULL,
  is_current INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stages (
  name TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  is_won INTEGER NOT NULL,
  is_lost INTEGER NOT NULL,
  team_restriction TEXT,
  short_label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  name TEXT PRIMARY KEY,
  leader TEXT,
  active INTEGER NOT NULL,
  company TEXT
);
CREATE TABLE IF NOT EXISTS team_members (
  team_name TEXT NOT NULL,
  member_name TEXT NOT NULL,
  PRIMARY KEY (team_name, member_name)
);
CREATE TABLE IF NOT EXISTS leads (
  import_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  stage TEXT NOT NULL,
  team TEXT,
  salesperson TEXT,
  customer TEXT,
  expected_revenue REAL,
  probability REAL,
  created_at TEXT,
  expected_close TEXT,
  closed_at TEXT,
  won_status TEXT,
  active INTEGER NOT NULL,
  loss_reason TEXT,
  tags TEXT,
  next_activity_type TEXT,
  next_activity_summary TEXT,
  next_activity_deadline TEXT,
  odoo_id TEXT,
  edited_locally INTEGER NOT NULL DEFAULT 0,
  sync_state TEXT NOT NULL DEFAULT 'synced',
  odoo_stage TEXT,
  odoo_expected_revenue REAL,
  odoo_probability REAL,
  missing_from_odoo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  odoo_lead_id TEXT,
  odoo_activity_id TEXT,
  document_name TEXT,
  summary TEXT,
  activity_type TEXT,
  deadline TEXT,
  state TEXT,
  created_at TEXT,
  note TEXT,
  assignee TEXT,
  lead_import_key TEXT
);
CREATE TABLE IF NOT EXISTS lead_edits (
  import_key TEXT PRIMARY KEY,
  patch_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS equipment (
  serial TEXT PRIMARY KEY,
  sheet_serial TEXT,
  internal_id TEXT,
  match_fingerprint TEXT,
  asset_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_seq INTEGER NOT NULL,
  store_code TEXT NOT NULL,
  supplier TEXT,
  supplier_reference TEXT,
  model TEXT,
  warranty_until TEXT,
  warranty_state TEXT NOT NULL,
  warranty_raw TEXT,
  maintenance_every_days INTEGER,
  hours_min REAL,
  hours_max REAL,
  hours_label TEXT,
  client_name TEXT,
  address TEXT,
  city TEXT,
  city_source TEXT,
  location_raw TEXT,
  status TEXT NOT NULL,
  delivered_on TEXT,
  salesperson TEXT,
  lead_import_key TEXT,
  notes TEXT,
  dirty_json TEXT NOT NULL DEFAULT '[]',
  sheet_cells_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS equipment_internal_id ON equipment(internal_id);
CREATE TABLE IF NOT EXISTS equipment_history (
  id INTEGER PRIMARY KEY,
  serial TEXT NOT NULL,
  at TEXT NOT NULL,
  field TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT
);
CREATE TABLE IF NOT EXISTS maintenance_logs (
  id INTEGER PRIMARY KEY,
  serial TEXT NOT NULL,
  performed_on TEXT NOT NULL,
  kind TEXT NOT NULL,
  hours REAL NOT NULL,
  parts_cost REAL NOT NULL DEFAULT 0,
  technician TEXT,
  notes TEXT,
  condition_after TEXT,
  visit_cost REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppliers (
  name TEXT PRIMARY KEY,
  odoo_name TEXT,
  nit TEXT,
  email TEXT,
  needs_review INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS catalogs (
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (kind, value)
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kpi_targets (
  id INTEGER PRIMARY KEY,
  salesperson TEXT NOT NULL DEFAULT '',
  metric TEXT NOT NULL,
  period TEXT NOT NULL,
  target_value REAL NOT NULL,
  UNIQUE (salesperson, metric, period)
);
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  email_opt_out INTEGER NOT NULL DEFAULT 0,
  session_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  target_user_id INTEGER,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  next_attempt_at TEXT,
  sender_user_id INTEGER,
  body_html TEXT,
  cc_email TEXT,
  attachment_ids TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_dedupe ON email_outbox(dedupe_key);
CREATE TABLE IF NOT EXISTS gmail_tokens (
  user_id INTEGER NOT NULL UNIQUE,
  google_email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS odoo_outbound (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  local_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  odoo_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  acked_at TEXT
);
CREATE TABLE IF NOT EXISTS odoo_snapshot_seen (
  snapshot_id TEXT NOT NULL,
  odoo_id TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, odoo_id)
);
CREATE TABLE IF NOT EXISTS odoo_sync_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  mode TEXT NOT NULL,
  inserted_count INTEGER NOT NULL,
  updated_count INTEGER NOT NULL,
  archived_count INTEGER NOT NULL,
  error_text TEXT,
  summary_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS leads_customer ON leads(customer);
CREATE INDEX IF NOT EXISTS leads_salesperson ON leads(salesperson);
CREATE INDEX IF NOT EXISTS leads_odoo_id ON leads(odoo_id);
CREATE INDEX IF NOT EXISTS leads_active_won ON leads(active, won_status);
CREATE INDEX IF NOT EXISTS leads_deadline ON leads(next_activity_deadline);
CREATE INDEX IF NOT EXISTS activities_lead ON activities(lead_import_key);
CREATE INDEX IF NOT EXISTS activities_odoo_lead ON activities(odoo_lead_id);
CREATE INDEX IF NOT EXISTS activities_deadline ON activities(deadline);
CREATE INDEX IF NOT EXISTS equipment_site ON equipment(site_id, site_seq);
CREATE INDEX IF NOT EXISTS equipment_client ON equipment(client_name);
CREATE INDEX IF NOT EXISTS equipment_sheet_serial ON equipment(sheet_serial);
CREATE INDEX IF NOT EXISTS equipment_history_serial ON equipment_history(serial);
CREATE INDEX IF NOT EXISTS maintenance_serial_on ON maintenance_logs(serial, performed_on);
CREATE INDEX IF NOT EXISTS email_outbox_status_next ON email_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS odoo_outbound_status ON odoo_outbound(status);
CREATE INDEX IF NOT EXISTS committee_docs_current ON committee_docs(is_current);
CREATE INDEX IF NOT EXISTS committee_docs_number ON committee_docs(number);
CREATE TABLE IF NOT EXISTS visit_points (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trade_name TEXT NOT NULL,
  point_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  locality TEXT,
  zone TEXT,
  visit_frequency TEXT,
  commercial TEXT,
  visit_barista TEXT,
  training_frequency TEXT,
  training_barista TEXT,
  lead_import_key TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  point_id TEXT,
  fecha TEXT,
  cliente TEXT,
  sede TEXT,
  resultado_final TEXT,
  created_by INTEGER,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visit_photos (
  id INTEGER PRIMARY KEY,
  visit_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  tag TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  data_url TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS visit_points_trade ON visit_points(trade_name);
CREATE INDEX IF NOT EXISTS visits_fecha ON visits(fecha);
CREATE INDEX IF NOT EXISTS visits_point ON visits(point_id);
CREATE INDEX IF NOT EXISTS visit_photos_visit ON visit_photos(visit_id);
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
CREATE TABLE IF NOT EXISTS folders (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS folders_parent_name ON folders(IFNULL(parent_id, 0), name) WHERE deleted_at IS NULL;
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
CREATE TABLE IF NOT EXISTS storage_usage (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bytes_used INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
`;

/** Bump when SCHEMA gains indexes or columns so an existing D1 applies them once. */
export const SCHEMA_VERSION = "6";

/** One-time role rename. Safe to run more than once. */
export const COMMERCIAL_ROLE_SQL = "UPDATE users SET role = 'comercial' WHERE role = 'user'";

/** Applied when an older local file is missing columns added after the first release. */
export const ALTERS = [
  "ALTER TABLE leads ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'synced'",
  "ALTER TABLE leads ADD COLUMN odoo_stage TEXT",
  "ALTER TABLE leads ADD COLUMN odoo_expected_revenue REAL",
  "ALTER TABLE leads ADD COLUMN odoo_probability REAL",
  "ALTER TABLE leads ADD COLUMN missing_from_odoo INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE activities ADD COLUMN odoo_activity_id TEXT",
  "ALTER TABLE equipment ADD COLUMN internal_id TEXT",
  "ALTER TABLE equipment ADD COLUMN match_fingerprint TEXT",
  "ALTER TABLE users ADD COLUMN email_opt_out INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE email_outbox ADD COLUMN sender_user_id INTEGER",
  "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
  "ALTER TABLE users ADD COLUMN deleted_at TEXT",
  "ALTER TABLE email_outbox ADD COLUMN body_html TEXT",
  "ALTER TABLE email_outbox ADD COLUMN cc_email TEXT",
  "ALTER TABLE email_outbox ADD COLUMN attachment_ids TEXT",
];

export { splitSqlStatements as splitSql } from "@/lib/sql/statements";
