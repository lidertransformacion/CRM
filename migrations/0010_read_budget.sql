-- Read snapshots, closed-period KPI facts, and indexes for filter and sort columns.
-- Every statement uses IF NOT EXISTS and is safe to run again.

CREATE TABLE IF NOT EXISTS read_epoch (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  domains TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS read_snapshots (
  cache_key TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kpi_period_facts (
  period TEXT NOT NULL,
  as_of TEXT NOT NULL,
  token TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (period, as_of)
);

CREATE INDEX IF NOT EXISTS leads_team ON leads(team);
CREATE INDEX IF NOT EXISTS leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS leads_expected_close ON leads(expected_close);
CREATE INDEX IF NOT EXISTS leads_closed_at ON leads(closed_at);
CREATE INDEX IF NOT EXISTS activities_assignee ON activities(assignee);
CREATE INDEX IF NOT EXISTS activities_state ON activities(state);
CREATE INDEX IF NOT EXISTS activities_lead_deadline ON activities(lead_import_key, deadline, id);
CREATE INDEX IF NOT EXISTS equipment_status ON equipment(status);
CREATE INDEX IF NOT EXISTS equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS equipment_warranty ON equipment(warranty_state, warranty_until);
CREATE INDEX IF NOT EXISTS equipment_salesperson ON equipment(salesperson);
CREATE INDEX IF NOT EXISTS equipment_updated ON equipment(updated_at);
CREATE INDEX IF NOT EXISTS equipment_lead ON equipment(lead_import_key);
CREATE INDEX IF NOT EXISTS equipment_history_serial_id ON equipment_history(serial, id);
CREATE INDEX IF NOT EXISTS catalogs_kind_sort ON catalogs(kind, sort_order, value);
CREATE INDEX IF NOT EXISTS kpi_targets_period ON kpi_targets(period, salesperson);
CREATE INDEX IF NOT EXISTS users_role_active ON users(role, active, deleted_at);
CREATE INDEX IF NOT EXISTS contracts_status ON contracts(status, updated_at);
CREATE INDEX IF NOT EXISTS contracts_updated ON contracts(updated_at);
CREATE INDEX IF NOT EXISTS contract_links_contract ON contract_links(contract_id, id);
CREATE INDEX IF NOT EXISTS signature_requests_contract ON signature_requests(contract_id, id);
CREATE INDEX IF NOT EXISTS signature_requests_status ON signature_requests(status, completed_at);
CREATE INDEX IF NOT EXISTS signature_steps_token ON signature_steps(token_hash);
CREATE INDEX IF NOT EXISTS signature_steps_signer ON signature_steps(signer_user_id, status);
CREATE INDEX IF NOT EXISTS signature_steps_email ON signature_steps(signer_email);
CREATE INDEX IF NOT EXISTS signature_steps_request ON signature_steps(request_id, step_order);
CREATE INDEX IF NOT EXISTS files_name ON files(deleted_at, name);
CREATE INDEX IF NOT EXISTS folders_parent ON folders(parent_id, deleted_at);
CREATE INDEX IF NOT EXISTS visit_points_active ON visit_points(active, trade_name, point_name);
CREATE INDEX IF NOT EXISTS visits_fecha_updated ON visits(fecha, updated_at);
CREATE INDEX IF NOT EXISTS visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS email_templates_sort ON email_templates(sort_order);
CREATE INDEX IF NOT EXISTS email_outbox_sender ON email_outbox(sender_user_id, id);
CREATE INDEX IF NOT EXISTS odoo_outbound_pending ON odoo_outbound(status, id);
CREATE INDEX IF NOT EXISTS odoo_outbound_local ON odoo_outbound(local_key, kind, status);
CREATE INDEX IF NOT EXISTS audit_events_id ON audit_events(entity_type, entity_id, id);
CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS mail_favorites_user_name ON mail_favorites(user_id, name);
CREATE INDEX IF NOT EXISTS stages_position ON stages(position);
CREATE INDEX IF NOT EXISTS team_members_member ON team_members(member_name);
CREATE INDEX IF NOT EXISTS user_events_at ON user_events(at);
CREATE INDEX IF NOT EXISTS suppliers_review ON suppliers(needs_review);
