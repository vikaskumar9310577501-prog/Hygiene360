-- Hygiene360 PostgreSQL schema (mirrors the SQLite schema; timestamps stay TEXT in UTC 'YYYY-MM-DD HH:MM:SS')

CREATE OR REPLACE FUNCTION h360_now() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS') $$;

CREATE TABLE IF NOT EXISTS plants (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL,
  employee_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS buildings (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT h360_now(),
  UNIQUE(plant_id, code)
);

CREATE TABLE IF NOT EXISTS blocks (
  id SERIAL PRIMARY KEY,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT h360_now(),
  UNIQUE(building_id, code)
);

CREATE TABLE IF NOT EXISTS floors (
  id SERIAL PRIMARY KEY,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  floor_number INTEGER DEFAULT 0,
  created_at TEXT DEFAULT h360_now(),
  UNIQUE(building_id, code)
);

CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  assigned_user_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT h360_now(),
  UNIQUE(floor_id, code)
);

CREATE TABLE IF NOT EXISTS toilets (
  id SERIAL PRIMARY KEY,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT DEFAULT 'UNISEX',
  status TEXT DEFAULT 'ACTIVE',
  assigned_user_id INTEGER REFERENCES users(id),
  qr_token TEXT UNIQUE NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT h360_now(),
  updated_at TEXT DEFAULT h360_now(),
  toilet_uid TEXT,
  urinal_count INTEGER DEFAULT 0,
  wc_count INTEGER DEFAULT 0,
  basin_count INTEGER DEFAULT 0,
  drinking_water_nearby INTEGER DEFAULT 0,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cleaning_frequency TEXT,
  UNIQUE(plant_id, code)
);

CREATE TABLE IF NOT EXISTS qr_codes (
  id SERIAL PRIMARY KEY,
  toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  is_active INTEGER DEFAULT 1,
  generated_at TEXT DEFAULT h360_now(),
  regenerated_at TEXT,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  checkpoint_time TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  assigned_date TEXT DEFAULT to_char((now() at time zone 'utc'), 'YYYY-MM-DD'),
  created_at TEXT DEFAULT h360_now(),
  UNIQUE(user_id, toilet_id, assigned_date)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  is_mandatory INTEGER DEFAULT 1,
  order_num INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cleaning_sessions (
  id SERIAL PRIMARY KEY,
  session_code TEXT UNIQUE NOT NULL,
  toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  submit_time TEXT,
  server_received_at TEXT DEFAULT h360_now(),
  status TEXT DEFAULT 'IN_PROGRESS',
  checklist_score NUMERIC DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  passed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  remarks TEXT,
  rejection_reason TEXT,
  created_at TEXT DEFAULT h360_now(),
  is_fake_audit_flagged INTEGER DEFAULT 0,
  fake_flag_reason TEXT,
  slot_id INTEGER,
  slot_date TEXT,
  slot_label TEXT,
  slot_start TEXT,
  slot_end TEXT,
  submitted_late INTEGER DEFAULT 0,
  approval_status TEXT,
  reviewed_by INTEGER,
  reviewed_at TEXT,
  approved_by INTEGER,
  approved_by_name TEXT,
  approved_at TEXT,
  approval_remarks TEXT,
  redo_of INTEGER,
  issue_found INTEGER DEFAULT 0,
  issue_id INTEGER
);

CREATE TABLE IF NOT EXISTS checklist_responses (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES cleaning_sessions(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  item_label TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  fail_reason TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS supervisor_inspections (
  id SERIAL PRIMARY KEY,
  toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES cleaning_sessions(id) ON DELETE SET NULL,
  inspection_type TEXT DEFAULT 'TOILET_HOUSEKEEPING',
  overall_status TEXT DEFAULT 'SATISFACTORY',
  score NUMERIC DEFAULT 100,
  remarks TEXT,
  evidence_photo_path TEXT,
  inspected_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  ticket_no TEXT UNIQUE NOT NULL,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  toilet_id INTEGER REFERENCES toilets(id) ON DELETE CASCADE,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  evidence_photo_path TEXT,
  resolution_photo_path TEXT,
  priority TEXT DEFAULT 'HIGH',
  status TEXT DEFAULT 'OPEN',
  resolution_remarks TEXT,
  verification_remarks TEXT,
  created_at TEXT DEFAULT h360_now(),
  resolved_at TEXT,
  verified_at TEXT,
  complaint_type TEXT DEFAULT 'HOUSEKEEPING',
  reported_by_name TEXT,
  reported_by_emp_id TEXT,
  reported_by_email TEXT,
  reported_by_phone TEXT,
  reported_by_department TEXT,
  reported_by_designation TEXT,
  checklist_item_label TEXT,
  is_fake_audit_flagged INTEGER DEFAULT 0,
  flagged_agent_name TEXT,
  flagged_agent_emp_id TEXT,
  flagged_session_code TEXT,
  flagged_reason TEXT,
  target_at TEXT,
  source_session_id INTEGER,
  evaluation_id INTEGER,
  reopened_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidence_photos (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES cleaning_sessions(id) ON DELETE CASCADE,
  inspection_id INTEGER REFERENCES supervisor_inspections(id) ON DELETE CASCADE,
  issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
  photo_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  image_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  server_received_at TEXT DEFAULT h360_now(),
  is_rejected INTEGER DEFAULT 0,
  rejection_reason TEXT,
  ocr_detected_date TEXT,
  is_live_camera INTEGER DEFAULT 1,
  uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clean_score INTEGER,
  scene_score INTEGER
);

CREATE TABLE IF NOT EXISTS issue_updates (
  id SERIAL PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  remarks TEXT,
  evidence_photo_path TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS issue_categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  default_priority TEXT DEFAULT 'HIGH',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS drinking_water_checks (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
  point_name TEXT NOT NULL,
  supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  water_available INTEGER DEFAULT 1,
  dispenser_clean INTEGER DEFAULT 1,
  drinking_area_clean INTEGER DEFAULT 1,
  glasses_available INTEGER DEFAULT 1,
  ro_functioning INTEGER DEFAULT 1,
  water_leakage INTEGER DEFAULT 0,
  area_cleanliness INTEGER DEFAULT 1,
  status TEXT DEFAULT 'PASS',
  remarks TEXT,
  evidence_photo_path TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'INFO',
  is_read INTEGER DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details_json TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS master_reference_photos (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  toilet_id INTEGER REFERENCES toilets(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  item_code TEXT,
  item_label TEXT NOT NULL,
  image_url TEXT NOT NULL,
  uploaded_by_name TEXT,
  uploaded_by_emp_id TEXT,
  created_at TEXT DEFAULT h360_now(),
  updated_at TEXT DEFAULT h360_now(),
  UNIQUE(plant_id, toilet_id, item_id)
);

CREATE TABLE IF NOT EXISTS cleaning_slots (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  area_id INTEGER REFERENCES areas(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT h360_now(),
  updated_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS slot_notification_log (
  id SERIAL PRIMARY KEY,
  slot_id INTEGER NOT NULL,
  slot_date TEXT NOT NULL,
  toilet_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  created_at TEXT DEFAULT h360_now(),
  UNIQUE(slot_id, slot_date, toilet_id, kind)
);

CREATE TABLE IF NOT EXISTS employee_evaluations (
  id SERIAL PRIMARY KEY,
  toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  evaluator_name TEXT,
  evaluator_emp_id TEXT,
  responses_json TEXT NOT NULL,
  total_points INTEGER DEFAULT 0,
  not_ok_count INTEGER DEFAULT 0,
  remarks TEXT,
  photo_path TEXT,
  issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  phone TEXT,
  kind TEXT,
  message TEXT,
  status TEXT,
  error TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE TABLE IF NOT EXISTS toilet_reference_photos (
  id SERIAL PRIMARY KEY,
  toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
  plant_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'TOILET',
  image_url TEXT NOT NULL,
  uploaded_by_name TEXT,
  created_at TEXT DEFAULT h360_now()
);

CREATE INDEX IF NOT EXISTS idx_slots_plant ON cleaning_slots(plant_id);
CREATE INDEX IF NOT EXISTS idx_slots_area ON cleaning_slots(area_id);
CREATE INDEX IF NOT EXISTS idx_toilets_plant ON toilets(plant_id);
CREATE INDEX IF NOT EXISTS idx_toilets_qr ON toilets(qr_token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_toilets_uid ON toilets(toilet_uid);
CREATE INDEX IF NOT EXISTS idx_cleaning_date ON cleaning_sessions(date);
CREATE INDEX IF NOT EXISTS idx_cleaning_toilet ON cleaning_sessions(toilet_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_slot ON cleaning_sessions(slot_id, slot_date, toilet_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_approval ON cleaning_sessions(approval_status);
CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_photos(image_hash);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_plant ON issues(plant_id);
CREATE INDEX IF NOT EXISTS idx_issues_agent ON issues(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_toilet_refs ON toilet_reference_photos(toilet_id, kind);
CREATE INDEX IF NOT EXISTS idx_evaluations_toilet ON employee_evaluations(toilet_id, created_at);

INSERT INTO system_settings (key, value, description) VALUES
  ('whatsapp_alert_missed', '1', 'WhatsApp alert when a cleaning slot is missed'),
  ('whatsapp_alert_late', '1', 'WhatsApp alert when a cleaning is submitted late'),
  ('whatsapp_alert_summary', '1', 'WhatsApp end-of-day cleaning summary'),
  ('whatsapp_summary_time', '20:00', 'Time (IST) of the end-of-day WhatsApp summary'),
  ('clean_check_min_score', '60', 'Minimum clean score (0-100) for a live toilet photo to be accepted'),
  ('clean_check_min_scene', '35', 'Minimum match (0-100) with the toilet reference view'),
  ('sheet_check_min_match', '22', 'Minimum match (0-100) with the check sheet reference photos'),
  ('check_sheet_tick_verify', '1', 'Read ticks on the check sheet photo and refuse wrong date / time slot (1 = on, 0 = off)'),
  ('check_sheet_layout', '{"items":["Floor","Wall","Mirror","Wash Basin","Handwash","Urinal","WC","Dustbin"],"timings":["08:00","11:00","13:00","15:00","17:00"],"requireAllItems":true}', 'Printed check sheet columns: item names, timing columns (HH:MM) and whether every item must be ticked'),
  ('issue_target_hours', '4', 'Hours allowed to take action on a new issue')
ON CONFLICT (key) DO NOTHING;
