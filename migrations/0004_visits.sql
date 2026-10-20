-- Hospitality visits. Photo bytes go to R2 binding MAIL_FILES (bucket crm-libertario-mail)
-- under the visits/ prefix. data_url holds a compressed JPEG data URL only when that
-- binding is missing. With R2, r2_key is set and data_url stays null.
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
