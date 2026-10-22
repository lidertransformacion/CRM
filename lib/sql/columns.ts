/** Explicit column lists. Screens ask for these instead of SELECT *. */

export const LEAD_COLUMNS =
  "import_key, name, stage, team, salesperson, customer, expected_revenue, probability, created_at, expected_close, closed_at, won_status, active, loss_reason, tags, next_activity_type, next_activity_summary, next_activity_deadline, edited_locally";

export const ACTIVITY_COLUMNS =
  "id, odoo_lead_id, document_name, summary, activity_type, deadline, state, created_at, note, assignee, lead_import_key";

export const EQUIPMENT_COLUMNS =
  "serial, sheet_serial, asset_number, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model, warranty_until, warranty_state, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label, client_name, address, city, city_source, location_raw, status, delivered_on, salesperson, lead_import_key, notes, dirty_json, sheet_cells_json, created_at, updated_at";

export const EQUIPMENT_SYNC_COLUMNS =
  "serial, sheet_serial, name, category, site_id, site_seq, store_code, supplier, supplier_reference, model, warranty_until, warranty_raw, maintenance_every_days, hours_min, hours_max, hours_label, location_raw, client_name, address, city, status, dirty_json, sheet_cells_json";

export const HISTORY_COLUMNS = "id, serial, at, field, from_value, to_value";

export const MAINTENANCE_COLUMNS =
  "id, serial, performed_on, kind, hours, parts_cost, technician, notes, condition_after, visit_cost, created_at";

export const USER_COLUMNS =
  "id, email, password_hash, role, must_change_password, email_opt_out, session_version, active, deleted_at, created_at, updated_at";

export const CONTRACT_COLUMNS =
  "id, code, title, type, counterparty_name, counterparty_nit, country, status, current_file_id, start_date, end_date, renewal_notice_days, value_cop, owner_id, created_at, updated_at";

export const LINK_COLUMNS = "id, contract_id, target_type, target_key, created_by, created_at";

export const SIGNER_COLUMNS = "id, contract_id, step_order, role, signer_user_id, signer_email, signer_name, created_at";

export const REQUEST_COLUMNS =
  "id, public_id, contract_id, source_file_id, source_sha256, status, current_step, final_file_id, final_sha256, rejected_reason, created_by, created_at, completed_at";

export const STEP_COLUMNS =
  "id, request_id, step_order, role, signer_user_id, signer_email, signer_name, status, otp_hash, otp_expires_at, otp_attempts, input_sha256, output_sha256, signature_image_key, signed_at, consent_at, ip, user_agent, comment, token_hash";

export const FOLDER_COLUMNS = "id, parent_id, name, created_by, created_at, updated_at, deleted_at";

export const OUTBOX_COLUMNS =
  "id, dedupe_key, to_email, subject, body_text, status, attempts, last_error, provider_message_id, created_at, updated_at, sent_at, next_attempt_at, sender_user_id, body_html, cc_email, attachment_ids";

export const MAIL_FILE_COLUMNS = "id, user_id, filename, content_type, size_bytes, r2_key, data_base64, content_id, created_at";

export const OUTBOUND_COLUMNS = "id, kind, local_key, payload_json, status, error, odoo_id, created_at, updated_at, acked_at";

export const AUDIT_COLUMNS =
  "id, entity_type, entity_id, action, actor_user_id, actor_email, ip, user_agent, data_json, prev_hash, hash, created_at";

export const VISIT_POINT_COLUMNS =
  "id, legal_name, trade_name, point_name, address, city, locality, zone, visit_frequency, commercial, visit_barista, training_frequency, training_barista, lead_import_key, active, created_at, updated_at";

export const VISIT_COLUMNS = "id, status, point_id, fecha, cliente, sede, resultado_final, created_by, payload, created_at, updated_at";

export const PHOTO_COLUMNS = "id, visit_id, kind, tag, sort_order, r2_key, data_url, created_at";
