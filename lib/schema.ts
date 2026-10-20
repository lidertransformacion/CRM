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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
  sender_user_id INTEGER
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
`;

/** Bump when SCHEMA gains indexes or columns so an existing D1 applies them once. */
export const SCHEMA_VERSION = "4";

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
];

export { splitSqlStatements as splitSql } from "@/lib/sql/statements";
