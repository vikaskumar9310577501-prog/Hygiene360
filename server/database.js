const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'hygiene360.db');

// Ensure parent dir exists
if (!fs.existsSync(__dirname)) {
  fs.mkdirSync(__dirname, { recursive: true });
}

// Ensure uploads dir exists
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'evidence');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode if supported
try {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  console.warn('PRAGMA setup notice:', e.message);
}

function initSchema() {
  db.exec(`
    -- Plants Master
    CREATE TABLE IF NOT EXISTS plants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Buildings Master
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plant_id, code)
    );

    -- Floors Master
    CREATE TABLE IF NOT EXISTS floors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      floor_number INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(building_id, code)
    );

    -- Areas Master
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      assigned_user_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(floor_id, code)
    );

    -- Toilets Master
    CREATE TABLE IF NOT EXISTS toilets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
      plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'UNISEX', -- MALE, FEMALE, UNISEX, EXECUTIVE
      status TEXT DEFAULT 'ACTIVE', -- ACTIVE, UNDER_MAINTENANCE, INACTIVE
      assigned_user_id INTEGER REFERENCES users(id),
      qr_token TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plant_id, code)
    );

    -- QR Codes Master
    CREATE TABLE IF NOT EXISTS qr_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      regenerated_at DATETIME,
      disabled_at DATETIME
    );

    -- Shifts Master
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_time TEXT NOT NULL, -- '07:00'
      end_time TEXT NOT NULL,   -- '15:30'
      checkpoint_time TEXT NOT NULL, -- '11:00' (time when missed alert is evaluated)
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users Master
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id INTEGER REFERENCES plants(id) ON DELETE SET NULL,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL, -- 'SUPER_ADMIN', 'PLANT_ADMIN', 'HOUSEKEEPING_AGENT', 'SUPERVISOR', 'MANAGEMENT'
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Agent/Supervisor Toilet Assignments
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      assigned_date DATE DEFAULT (DATE('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, toilet_id, assigned_date)
    );

    -- Checklist Templates & Items
    CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, -- 'CLEANLINESS', 'CONSUMABLES', 'EQUIPMENT'
      label TEXT NOT NULL,
      description TEXT,
      is_mandatory INTEGER DEFAULT 1,
      order_num INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1
    );

    -- Cleaning Sessions
    CREATE TABLE IF NOT EXISTS cleaning_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_code TEXT UNIQUE NOT NULL, -- 'H360-YYYYMMDD-XXXXX'
      toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
      date DATE NOT NULL,
      start_time DATETIME NOT NULL,
      submit_time DATETIME,
      server_received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'IN_PROGRESS', -- 'IN_PROGRESS', 'COMPLETED', 'REJECTED'
      checklist_score REAL DEFAULT 0, -- percentage of passed items
      total_items INTEGER DEFAULT 0,
      passed_items INTEGER DEFAULT 0,
      failed_items INTEGER DEFAULT 0,
      remarks TEXT,
      rejection_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Checklist Responses
    CREATE TABLE IF NOT EXISTS checklist_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES cleaning_sessions(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
      item_label TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL, -- 'PASS', 'FAIL'
      fail_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Evidence Photos
    CREATE TABLE IF NOT EXISTS evidence_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES cleaning_sessions(id) ON DELETE CASCADE,
      inspection_id INTEGER REFERENCES supervisor_inspections(id) ON DELETE CASCADE,
      issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
      photo_type TEXT NOT NULL, -- 'CLEANING_EVIDENCE', 'TOILET_CONDITION', 'CHECK_SHEET', 'ISSUE_EVIDENCE', 'RESOLUTION_EVIDENCE', 'DRINKING_WATER'
      storage_path TEXT NOT NULL,
      original_filename TEXT,
      image_hash TEXT NOT NULL, -- SHA-256 hash for duplicate detection
      captured_at DATETIME NOT NULL,
      server_received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_rejected INTEGER DEFAULT 0,
      rejection_reason TEXT,
      ocr_detected_date TEXT,
      is_live_camera INTEGER DEFAULT 1,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );

    -- Supervisor Inspections
    CREATE TABLE IF NOT EXISTS supervisor_inspections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
      supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES cleaning_sessions(id) ON DELETE SET NULL,
      inspection_type TEXT DEFAULT 'TOILET_HOUSEKEEPING', -- 'TOILET_HOUSEKEEPING', 'DRINKING_WATER'
      overall_status TEXT DEFAULT 'SATISFACTORY', -- 'SATISFACTORY', 'NEEDS_ATTENTION', 'UNSATISFACTORY'
      score REAL DEFAULT 100,
      remarks TEXT,
      evidence_photo_path TEXT,
      inspected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Housekeeping Issues
    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no TEXT UNIQUE NOT NULL, -- 'H360-ISS-000245'
      plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      toilet_id INTEGER REFERENCES toilets(id) ON DELETE CASCADE,
      area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      supervisor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_agent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      evidence_photo_path TEXT,
      resolution_photo_path TEXT,
      priority TEXT DEFAULT 'HIGH', -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
      status TEXT DEFAULT 'OPEN', -- 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED'
      resolution_remarks TEXT,
      verification_remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      verified_at DATETIME
    );

    -- Issue Updates / History
    CREATE TABLE IF NOT EXISTS issue_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      remarks TEXT,
      evidence_photo_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Issue Categories Master
    CREATE TABLE IF NOT EXISTS issue_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      default_priority TEXT DEFAULT 'HIGH',
      is_active INTEGER DEFAULT 1
    );

    -- Drinking Water Checks
    CREATE TABLE IF NOT EXISTS drinking_water_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      status TEXT DEFAULT 'PASS', -- 'PASS', 'FAIL'
      remarks TEXT,
      evidence_photo_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'INFO', -- 'INFO', 'ALERT', 'ISSUE_ASSIGNED', 'ISSUE_RESOLVED', 'MISSED_CLEANING'
      is_read INTEGER DEFAULT 0,
      metadata_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Immutable Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name TEXT,
      role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      details_json TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- System Settings
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Master Clean Reference Photos (Managed strictly by IT Admin)
    CREATE TABLE IF NOT EXISTS master_reference_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      toilet_id INTEGER REFERENCES toilets(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
      item_code TEXT,
      item_label TEXT NOT NULL,
      image_url TEXT NOT NULL,
      uploaded_by_name TEXT,
      uploaded_by_emp_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(plant_id, toilet_id, item_id)
    );

    -- Plant-wise cleaning time slots (managed by Admin / IT Admin)
    CREATE TABLE IF NOT EXISTS cleaning_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      start_time TEXT NOT NULL, -- 'HH:MM' (IST)
      end_time TEXT NOT NULL,   -- 'HH:MM' (IST)
      is_active INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- De-duplication log for slot reminder / missed notifications
    CREATE TABLE IF NOT EXISTS slot_notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_id INTEGER NOT NULL,
      slot_date TEXT NOT NULL,
      toilet_id INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL, -- 'START', 'DUE_SOON', 'MISSED'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(slot_id, slot_date, toilet_id, kind)
    );

    -- Indexes for high performance queries
    CREATE INDEX IF NOT EXISTS idx_slots_plant ON cleaning_slots(plant_id);
    CREATE INDEX IF NOT EXISTS idx_toilets_plant ON toilets(plant_id);
    CREATE INDEX IF NOT EXISTS idx_toilets_qr ON toilets(qr_token);
    CREATE INDEX IF NOT EXISTS idx_cleaning_date ON cleaning_sessions(date);
    CREATE INDEX IF NOT EXISTS idx_cleaning_toilet ON cleaning_sessions(toilet_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_hash ON evidence_photos(image_hash);
    CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    CREATE INDEX IF NOT EXISTS idx_issues_plant ON issues(plant_id);
    CREATE INDEX IF NOT EXISTS idx_issues_agent ON issues(assigned_agent_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Safe Column Migrations for Employee Complaints & Fake Audit Tracking
  const migrations = [
    "ALTER TABLE issues ADD COLUMN complaint_type TEXT DEFAULT 'HOUSEKEEPING'",
    "ALTER TABLE issues ADD COLUMN reported_by_name TEXT",
    "ALTER TABLE issues ADD COLUMN reported_by_emp_id TEXT",
    "ALTER TABLE issues ADD COLUMN reported_by_email TEXT",
    "ALTER TABLE issues ADD COLUMN reported_by_phone TEXT",
    "ALTER TABLE issues ADD COLUMN reported_by_department TEXT",
    "ALTER TABLE issues ADD COLUMN reported_by_designation TEXT",
    "ALTER TABLE issues ADD COLUMN checklist_item_label TEXT",
    "ALTER TABLE issues ADD COLUMN is_fake_audit_flagged INTEGER DEFAULT 0",
    "ALTER TABLE issues ADD COLUMN flagged_agent_name TEXT",
    "ALTER TABLE issues ADD COLUMN flagged_agent_emp_id TEXT",
    "ALTER TABLE issues ADD COLUMN flagged_session_code TEXT",
    "ALTER TABLE issues ADD COLUMN flagged_reason TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN is_fake_audit_flagged INTEGER DEFAULT 0",
    "ALTER TABLE cleaning_sessions ADD COLUMN fake_flag_reason TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN slot_id INTEGER",
    "ALTER TABLE cleaning_sessions ADD COLUMN slot_date TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN slot_label TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN slot_start TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN slot_end TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN submitted_late INTEGER DEFAULT 0",
    "ALTER TABLE cleaning_sessions ADD COLUMN approval_status TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN reviewed_by INTEGER",
    "ALTER TABLE cleaning_sessions ADD COLUMN reviewed_at DATETIME",
    "ALTER TABLE cleaning_sessions ADD COLUMN approved_by INTEGER",
    "ALTER TABLE cleaning_sessions ADD COLUMN approved_by_name TEXT",
    "ALTER TABLE cleaning_sessions ADD COLUMN approved_at DATETIME",
    "ALTER TABLE cleaning_sessions ADD COLUMN approval_remarks TEXT",
    "ALTER TABLE cleaning_slots ADD COLUMN area_id INTEGER REFERENCES areas(id) ON DELETE CASCADE",
    "ALTER TABLE cleaning_sessions ADD COLUMN redo_of INTEGER",
    "ALTER TABLE floors ADD COLUMN block_id INTEGER REFERENCES blocks(id) ON DELETE SET NULL",
    "ALTER TABLE toilets ADD COLUMN toilet_uid TEXT",
    "ALTER TABLE toilets ADD COLUMN urinal_count INTEGER DEFAULT 0",
    "ALTER TABLE toilets ADD COLUMN wc_count INTEGER DEFAULT 0",
    "ALTER TABLE toilets ADD COLUMN basin_count INTEGER DEFAULT 0",
    "ALTER TABLE toilets ADD COLUMN drinking_water_nearby INTEGER DEFAULT 0",
    "ALTER TABLE toilets ADD COLUMN supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
    "ALTER TABLE toilets ADD COLUMN cleaning_frequency TEXT",
    "ALTER TABLE issues ADD COLUMN target_at DATETIME",
    "ALTER TABLE issues ADD COLUMN source_session_id INTEGER",
    "ALTER TABLE issues ADD COLUMN evaluation_id INTEGER",
    "ALTER TABLE issues ADD COLUMN reopened_count INTEGER DEFAULT 0",
    "ALTER TABLE cleaning_sessions ADD COLUMN issue_found INTEGER DEFAULT 0",
    "ALTER TABLE cleaning_sessions ADD COLUMN issue_id INTEGER"
  ];
  db.exec(`
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(building_id, code)
    );

    -- Toilet evaluation by company employees (OK / NOT OK per point)
    CREATE TABLE IF NOT EXISTS employee_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  migrations.forEach(sql => {
    try { db.exec(sql); } catch (e) {}
  });
  // Toilets are no longer assigned to individual housekeepers: any housekeeper of the plant can scan and clean
  try { db.exec('UPDATE toilets SET assigned_user_id = NULL WHERE assigned_user_id IS NOT NULL'); } catch (e) {}
  // Cleaning no longer needs admin approval: anything still waiting counts as done
  try {
    db.exec("UPDATE cleaning_sessions SET approval_status = 'APPROVED', approved_by_name = COALESCE(approved_by_name, 'AUTO'), approved_at = COALESCE(approved_at, submit_time) WHERE status = 'COMPLETED' AND approval_status = 'PENDING'");
  } catch (e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        phone TEXT,
        kind TEXT,
        message TEXT,
        status TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('whatsapp_alert_missed', '1', 'WhatsApp alert when a cleaning slot is missed')");
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('whatsapp_alert_late', '1', 'WhatsApp alert when a cleaning is submitted late')");
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('whatsapp_alert_summary', '1', 'WhatsApp end-of-day cleaning summary')");
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('whatsapp_summary_time', '20:00', 'Time (IST) of the end-of-day WhatsApp summary')");
  } catch (e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS toilet_reference_photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        toilet_id INTEGER NOT NULL REFERENCES toilets(id) ON DELETE CASCADE,
        plant_id INTEGER,
        kind TEXT NOT NULL DEFAULT 'TOILET',
        image_url TEXT NOT NULL,
        uploaded_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_toilet_refs ON toilet_reference_photos(toilet_id, kind)');
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('clean_check_min_score', '60', 'Minimum clean score (0-100) for a live toilet photo to be accepted')");
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('clean_check_min_scene', '35', 'Minimum match (0-100) with the toilet reference view')");
    db.exec("UPDATE system_settings SET value = '35' WHERE key = 'clean_check_min_scene' AND value = '45'");
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('sheet_check_min_match', '22', 'Minimum match (0-100) with the check sheet reference photos')");
    db.exec("UPDATE system_settings SET value = '22' WHERE key = 'sheet_check_min_match' AND value = '40'");
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('check_sheet_tick_verify', '1', 'Read ticks on the check sheet photo and refuse wrong date / time slot (1 = on, 0 = off)')");
    db.exec(`INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('check_sheet_layout', '${JSON.stringify({
      items: ['Floor', 'Wall', 'Mirror', 'Wash Basin', 'Handwash', 'Urinal', 'WC', 'Dustbin'],
      timings: ['08:00', '11:00', '13:00', '15:00', '17:00'],
      requireAllItems: true
    })}', 'Printed check sheet columns: item names, timing columns (HH:MM) and whether every item must be ticked')`);
  } catch (e) {}
  for (const sql of [
    'ALTER TABLE evidence_photos ADD COLUMN clean_score INTEGER',
    'ALTER TABLE evidence_photos ADD COLUMN scene_score INTEGER'
  ]) {
    try { db.exec(sql); } catch (e) {}
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS idx_cleaning_slot ON cleaning_sessions(slot_id, slot_date, toilet_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_cleaning_approval ON cleaning_sessions(approval_status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_slots_area ON cleaning_slots(area_id)');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_toilets_uid ON toilets(toilet_uid)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_evaluations_toilet ON employee_evaluations(toilet_id, created_at)');
    db.exec("INSERT OR IGNORE INTO system_settings (key, value, description) VALUES ('issue_target_hours', '4', 'Hours allowed to take action on a new issue')");
  } catch (e) {}

  backfillToiletUids();
  applyWashroomSheetChecklist();
}

function sanitizeUidPart(value) {
  return String(value || '').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Toilet ID printed in the QR, e.g. TOILET-SUPA-BLOCK-A-01
function buildToiletUid(plantCode, locationCode, toiletCode) {
  const parts = ['TOILET', sanitizeUidPart(plantCode), sanitizeUidPart(locationCode), sanitizeUidPart(toiletCode)].filter(Boolean);
  return parts.join('-');
}

function uniqueToiletUid(base, excludeToiletId = null) {
  let candidate = base;
  let n = 2;
  while (db.prepare('SELECT id FROM toilets WHERE toilet_uid = ? AND id IS NOT ?').get(candidate, excludeToiletId)) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

function backfillToiletUids() {
  try {
    const missing = db.prepare(`
      SELECT t.id, t.code, p.code as plant_code, bl.code as block_code, b.code as building_code
      FROM toilets t
      JOIN plants p ON t.plant_id = p.id
      LEFT JOIN areas a ON t.area_id = a.id
      LEFT JOIN floors f ON a.floor_id = f.id
      LEFT JOIN blocks bl ON f.block_id = bl.id
      LEFT JOIN buildings b ON f.building_id = b.id
      WHERE t.toilet_uid IS NULL OR t.toilet_uid = ''
    `).all();
    for (const t of missing) {
      const uid = uniqueToiletUid(buildToiletUid(t.plant_code, t.block_code || t.building_code, t.code), t.id);
      db.prepare('UPDATE toilets SET toilet_uid = ? WHERE id = ?').run(uid, t.id);
    }
  } catch (e) {
    console.error('Toilet ID backfill failed:', e.message);
  }
}

// Washroom checklist columns from the BVG paper check sheet, in sheet order
const WASHROOM_SHEET_ITEMS = [
  { label: 'Door', category: 'CLEANLINESS', description: 'Door, handle and latch cleaned', reuse: 'Door/partition clean' },
  { label: 'Wall', category: 'CLEANLINESS', description: 'Wall tiles scrubbed, no splash stains or cobwebs', reuse: 'Wall clean' },
  { label: 'Ceiling', category: 'CLEANLINESS', description: 'Ceiling dusted, no cobwebs or dampness' },
  { label: 'Light Fixture', category: 'CLEANLINESS', description: 'Light fittings dusted and working', reuse: 'Light working' },
  { label: 'Vents', category: 'CLEANLINESS', description: 'Exhaust vents and grills dusted' },
  { label: 'Mirror', category: 'CLEANLINESS', description: 'Mirror clear and streak-free', reuse: 'Mirror clean' },
  { label: 'Floor Mat', category: 'CLEANLINESS', description: 'Floor mat cleaned or replaced' },
  { label: 'Wash Basin', category: 'CLEANLINESS', description: 'Basin wiped, free of hair, stains and soap residue', reuse: 'Wash basin clean' },
  { label: 'Taps', category: 'CLEANLINESS', description: 'Taps cleaned, no leakage', reuse: 'Tap working' },
  { label: 'Soap', category: 'CONSUMABLES', description: 'Soap / handwash dispenser checked and refilled', reuse: 'Handwash available' },
  { label: 'Tissue Paper', category: 'CONSUMABLES', description: 'Tissue paper checked and refilled', reuse: 'Tissue available' },
  { label: 'Toilet Roll', category: 'CONSUMABLES', description: 'Toilet roll checked and replaced', reuse: 'Toilet paper available' },
  { label: 'Fragrance Balls', category: 'CONSUMABLES', description: 'Fragrance / naphthalene balls checked and replaced', reuse: 'Air freshener available' },
  { label: 'Drain', category: 'CLEANLINESS', description: 'Floor drain cleaned, no blockage or smell' },
  { label: 'Mopping', category: 'CLEANLINESS', description: 'Floor mopped with disinfectant and dry', reuse: 'Floor clean' },
  { label: 'Indian Commode', category: 'CLEANLINESS', description: 'Commode descaled, disinfected and flushed', reuse: 'WC clean' },
  { label: 'Urinals', category: 'CLEANLINESS', description: 'Urinals cleaned, odour-free, drain clear', reuse: 'Urinal clean' }
];

// One-time switch to the sheet checklist; existing items are renamed in place so master photos stay linked
function applyWashroomSheetChecklist() {
  try {
    const existing = db.prepare('SELECT id, label FROM checklist_items').all();
    if (existing.length === 0 || existing.some(i => i.label === 'Ceiling')) return;

    const byLabel = new Map(existing.map(i => [i.label, i.id]));
    const keptIds = new Set();
    db.exec('BEGIN');
    WASHROOM_SHEET_ITEMS.forEach((item, idx) => {
      const reuseId = item.reuse ? byLabel.get(item.reuse) : undefined;
      if (reuseId) {
        db.prepare('UPDATE checklist_items SET label = ?, category = ?, description = ?, order_num = ?, is_mandatory = 1, is_active = 1 WHERE id = ?')
          .run(item.label, item.category, item.description, idx + 1, reuseId);
        db.prepare('UPDATE master_reference_photos SET item_label = ? WHERE item_id = ?').run(item.label, reuseId);
        keptIds.add(reuseId);
      } else {
        const r = db.prepare('INSERT INTO checklist_items (category, label, description, is_mandatory, order_num, is_active) VALUES (?, ?, ?, 1, ?, 1)')
          .run(item.category, item.label, item.description, idx + 1);
        keptIds.add(Number(r.lastInsertRowid));
      }
    });
    for (const i of existing) {
      if (!keptIds.has(i.id)) db.prepare('UPDATE checklist_items SET is_active = 0 WHERE id = ?').run(i.id);
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('Washroom sheet checklist migration failed:', e.message);
  }
}

// Helper query wrappers for clean code
const dbHelper = {
  all(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.all(...params);
  },
  get(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.get(...params);
  },
  run(sql, params = []) {
    const stmt = db.prepare(sql);
    return stmt.run(...params);
  },
  exec(sql) {
    return db.exec(sql);
  },
  applyWashroomSheetChecklist,
  buildToiletUid,
  uniqueToiletUid,
  raw: db
};

// Initialize schema on load
initSchema();

module.exports = dbHelper;
