const db = require('./database');

const toilets = db.all('SELECT * FROM toilets WHERE plant_id = 1');
const shift = db.get('SELECT id FROM shifts LIMIT 1');
const agent = db.get("SELECT id FROM users WHERE role = 'HOUSEKEEPING_AGENT' LIMIT 1");

// Dates 21 to 26 Sep 2026 for Bhiwadi
const pastDays = [
  { date: '2026-09-21', count: 14 },
  { date: '2026-09-22', count: 16 },
  { date: '2026-09-23', count: 15 },
  { date: '2026-09-24', count: 16 },
  { date: '2026-09-25', count: 14 },
  { date: '2026-09-26', count: 15 },
];

for (const pd of pastDays) {
  const existing = db.get('SELECT COUNT(*) as c FROM cleaning_sessions WHERE date = ? AND toilet_id IN (SELECT id FROM toilets WHERE plant_id = 1)', [pd.date]);
  if (existing.c > 0) continue;

  for (let i = 0; i < pd.count; i++) {
    const t = toilets[i];
    const sessionCode = 'H360-' + pd.date.replace(/-/g, '') + '-' + String(i + 1).padStart(5, '0');
    const startTime = pd.date + ' 09:00:00';
    const submitTime = pd.date + ' 09:15:00';
    db.run(
      "INSERT INTO cleaning_sessions (session_code, toilet_id, user_id, shift_id, date, start_time, submit_time, server_received_at, status, checklist_score, total_items, passed_items, failed_items, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 100, 18, 18, 0, 'Cleaned on schedule')",
      [sessionCode, t.id, agent.id, shift.id, pd.date, startTime, submitTime, submitTime]
    );
  }
}

// Also seed for Supa (plant_id = 2) and Noida (plant_id = 3)
const supaToilets = db.all('SELECT * FROM toilets WHERE plant_id = 2');
for (const pd of pastDays) {
  for (let i = 0; i < 3; i++) {
    const t = supaToilets[i];
    if (!t) continue;
    const sessionCode = 'H360-SUPA-' + pd.date.replace(/-/g, '') + '-' + String(i + 1);
    db.run(
      "INSERT OR IGNORE INTO cleaning_sessions (session_code, toilet_id, user_id, shift_id, date, start_time, submit_time, server_received_at, status, checklist_score, total_items, passed_items, failed_items, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', 100, 18, 18, 0, 'Cleaned')",
      [sessionCode, t.id, agent.id, shift.id, pd.date, pd.date + ' 10:00:00', pd.date + ' 10:15:00', pd.date + ' 10:15:00']
    );
  }
}

console.log('Seeded past trend data successfully!');
