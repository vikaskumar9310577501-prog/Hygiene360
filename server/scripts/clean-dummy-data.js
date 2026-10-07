const db = require('../db/sqlite').sync;
const fs = require('fs');
const path = require('path');

console.log('--- Cleaning Transactional Dummy Data ---');

db.exec(`
  DELETE FROM checklist_responses;
  DELETE FROM evidence_photos;
  DELETE FROM cleaning_sessions;
  DELETE FROM issue_updates;
  DELETE FROM issues;
  DELETE FROM supervisor_inspections;
  DELETE FROM drinking_water_checks;
  DELETE FROM notifications;
  DELETE FROM audit_logs;
`);

// Insert initial system clean log
db.run(
  'INSERT INTO audit_logs (user_name, role, action, entity_type, entity_id, details_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ['System Admin', 'SUPER_ADMIN', 'DATA_PURGE', 'DATABASE', 'CLEAN_SLATE', 'Purged all dummy demo sessions, issues, inspections, and evidence for live operational testing.', '127.0.0.1']
);

// Clean uploaded dummy evidence files
const evidenceDir = path.join(__dirname, '..', 'uploads', 'evidence');
if (fs.existsSync(evidenceDir)) {
  const files = fs.readdirSync(evidenceDir);
  for (const f of files) {
    fs.unlinkSync(path.join(evidenceDir, f));
  }
  console.log('Purged ' + files.length + ' dummy evidence files from disk.');
}

// Verification counts
console.log('--- Record Counts Verification ---');
const counts = {
  cleaning_sessions: db.get('SELECT COUNT(*) as c FROM cleaning_sessions').c,
  evidence_photos: db.get('SELECT COUNT(*) as c FROM evidence_photos').c,
  issues: db.get('SELECT COUNT(*) as c FROM issues').c,
  supervisor_inspections: db.get('SELECT COUNT(*) as c FROM supervisor_inspections').c,
  drinking_water_checks: db.get('SELECT COUNT(*) as c FROM drinking_water_checks').c,
  notifications: db.get('SELECT COUNT(*) as c FROM notifications').c,
  audit_logs: db.get('SELECT COUNT(*) as c FROM audit_logs').c,
  plants: db.get('SELECT COUNT(*) as c FROM plants').c,
  toilets: db.get('SELECT COUNT(*) as c FROM toilets').c,
  users: db.get('SELECT COUNT(*) as c FROM users').c,
  checklist_items: db.get('SELECT COUNT(*) as c FROM checklist_items').c
};
console.log(counts);
console.log('--- Clean Slate Ready ---');
