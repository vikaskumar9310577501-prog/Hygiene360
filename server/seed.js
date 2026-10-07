const db = require('./db/sqlite').sync;
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function seed() {
  console.log('--- Starting Hygiene 360 Database Seeding ---');

  // Clear existing demo tables (safe wipe for development/demo init)
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM audit_logs;
    DELETE FROM drinking_water_checks;
    DELETE FROM issue_updates;
    DELETE FROM issues;
    DELETE FROM supervisor_inspections;
    DELETE FROM evidence_photos;
    DELETE FROM checklist_responses;
    DELETE FROM cleaning_sessions;
    DELETE FROM checklist_items;
    DELETE FROM assignments;
    DELETE FROM users;
    DELETE FROM shifts;
    DELETE FROM qr_codes;
    DELETE FROM toilets;
    DELETE FROM areas;
    DELETE FROM floors;
    DELETE FROM buildings;
    DELETE FROM plants;
    DELETE FROM issue_categories;
    DELETE FROM system_settings;
    DELETE FROM sqlite_sequence;
  `);

  // 1. Plants
  const plants = [
    { code: 'BHIWADI', name: 'Bhiwadi Manufacturing Plant', location: 'RIICO Industrial Area, Bhiwadi, Rajasthan' },
    { code: 'SUPA', name: 'Supa Industrial Plant', location: 'MIDC Industrial Zone, Supa, Maharashtra' },
    { code: 'NOIDA', name: 'Noida Tech & Electronics Plant', location: 'Sector 63, Noida, Uttar Pradesh' }
  ];

  const plantIds = {};
  for (const p of plants) {
    const res = db.run(
      'INSERT INTO plants (code, name, location) VALUES (?, ?, ?)',
      [p.code, p.name, p.location]
    );
    plantIds[p.code] = res.lastInsertRowid;
  }
  console.log('Seeded Plants:', Object.keys(plantIds));

  // 2. Buildings, Floors, Areas & 16 Toilets for Bhiwadi
  const bhiwadiId = plantIds['BHIWADI'];

  // Buildings for Bhiwadi
  const bldMainRes = db.run('INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)', [bhiwadiId, 'BLD-MAIN', 'Main Plant Building']);
  const bldProdRes = db.run('INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)', [bhiwadiId, 'BLD-PROD', 'Production Block B']);
  const bldLogRes = db.run('INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)', [bhiwadiId, 'BLD-LOG', 'Logistics & Admin Block']);

  // Floors
  const flMain0 = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)', [bldMainRes.lastInsertRowid, 'FL-00', 'Ground Floor', 0]);
  const flMain1 = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)', [bldMainRes.lastInsertRowid, 'FL-01', 'First Floor', 1]);
  const flProd0 = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)', [bldProdRes.lastInsertRowid, 'FL-00', 'Ground Floor', 0]);
  const flLog0 = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)', [bldLogRes.lastInsertRowid, 'FL-00', 'Ground Floor', 0]);
  const flLog1 = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)', [bldLogRes.lastInsertRowid, 'FL-01', 'First Floor (Admin)', 1]);

  // Areas
  const areaPE = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flMain0.lastInsertRowid, 'AREA-PE', 'Production Line East']);
  const areaAH = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flMain0.lastInsertRowid, 'AREA-AH', 'Main Assembly Hall']);
  const areaRD = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flMain1.lastInsertRowid, 'AREA-RD', 'Engineering & R&D Hub']);
  const areaQC = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flMain1.lastInsertRowid, 'AREA-QC', 'Quality Assurance Lab']);
  const areaIM = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flProd0.lastInsertRowid, 'AREA-IM', 'Molding & Tooling Floor']);
  const areaPS = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flProd0.lastInsertRowid, 'AREA-PS', 'Paint Shop & Finishing']);
  const areaWH = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flLog0.lastInsertRowid, 'AREA-WH', 'Central Warehouse Bay']);
  const areaAD = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [flLog1.lastInsertRowid, 'AREA-AD', 'Corporate & HR Wing']);

  // Exactly 16 Toilets for Bhiwadi
  const bhiwadiToilets = [
    { areaId: areaPE.lastInsertRowid, code: 'TLT-01', name: 'Toilet 01 - Male (East Line)', gender: 'MALE' },
    { areaId: areaPE.lastInsertRowid, code: 'TLT-02', name: 'Toilet 02 - Female (East Line)', gender: 'FEMALE' },
    { areaId: areaAH.lastInsertRowid, code: 'TLT-03', name: 'Toilet 03 - Male (Assembly)', gender: 'MALE' },
    { areaId: areaAH.lastInsertRowid, code: 'TLT-04', name: 'Toilet 04 - Female (Assembly)', gender: 'FEMALE' },
    { areaId: areaRD.lastInsertRowid, code: 'TLT-05', name: 'Toilet 05 - Unisex (R&D Block)', gender: 'UNISEX' },
    { areaId: areaRD.lastInsertRowid, code: 'TLT-06', name: 'Toilet 06 - Executive (R&D)', gender: 'EXECUTIVE' },
    { areaId: areaQC.lastInsertRowid, code: 'TLT-07', name: 'Toilet 07 - QA Lab Male', gender: 'MALE' },
    { areaId: areaQC.lastInsertRowid, code: 'TLT-08', name: 'Toilet 08 - QA Lab Female', gender: 'FEMALE' },
    { areaId: areaIM.lastInsertRowid, code: 'TLT-09', name: 'Toilet 09 - Molding Shop A', gender: 'MALE' },
    { areaId: areaIM.lastInsertRowid, code: 'TLT-10', name: 'Toilet 10 - Molding Shop B', gender: 'FEMALE' },
    { areaId: areaPS.lastInsertRowid, code: 'TLT-11', name: 'Toilet 11 - Paint Shop Male', gender: 'MALE' },
    { areaId: areaPS.lastInsertRowid, code: 'TLT-12', name: 'Toilet 12 - Paint Shop Female', gender: 'FEMALE' },
    { areaId: areaWH.lastInsertRowid, code: 'TLT-13', name: 'Toilet 13 - Warehouse Bay 1', gender: 'MALE' },
    { areaId: areaWH.lastInsertRowid, code: 'TLT-14', name: 'Toilet 14 - Warehouse Bay 2', gender: 'UNISEX' },
    { areaId: areaAD.lastInsertRowid, code: 'TLT-15', name: 'Toilet 15 - Admin Male', gender: 'MALE' },
    { areaId: areaAD.lastInsertRowid, code: 'TLT-16', name: 'Toilet 16 - Admin Female', gender: 'FEMALE' }
  ];

  const toiletMap = {};
  for (const t of bhiwadiToilets) {
    // Generate secure opaque token
    const token = 'H360-QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    const res = db.run(
      'INSERT INTO toilets (area_id, plant_id, code, name, gender, status, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [t.areaId, bhiwadiId, t.code, t.name, t.gender, 'ACTIVE', token]
    );
    const toiletId = res.lastInsertRowid;
    toiletMap[t.code] = { id: toiletId, token, name: t.name };

    db.run(
      'INSERT INTO qr_codes (toilet_id, token, is_active) VALUES (?, ?, 1)',
      [toiletId, token]
    );
  }
  console.log(`Seeded ${bhiwadiToilets.length} toilets for Bhiwadi Plant`);

  // Sample Toilets for Supa and Noida
  for (const plantKey of ['SUPA', 'NOIDA']) {
    const pId = plantIds[plantKey];
    const bld = db.run('INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)', [pId, 'BLD-01', `${plantKey} Main Building`]);
    const fl = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)', [bld.lastInsertRowid, 'FL-00', 'Ground Floor', 0]);
    const ar = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [fl.lastInsertRowid, 'AREA-01', 'General Floor']);

    for (let i = 1; i <= 4; i++) {
      const code = `${plantKey}-TLT-0${i}`;
      const token = 'H360-QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();
      const res = db.run(
        'INSERT INTO toilets (area_id, plant_id, code, name, gender, status, qr_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ar.lastInsertRowid, pId, code, `${plantKey} Toilet 0${i}`, i % 2 === 0 ? 'FEMALE' : 'MALE', 'ACTIVE', token]
      );
      db.run('INSERT INTO qr_codes (toilet_id, token, is_active) VALUES (?, ?, 1)', [res.lastInsertRowid, token]);
    }
  }

  // 3. Shifts
  const shiftA = db.run('INSERT INTO shifts (plant_id, name, start_time, end_time, checkpoint_time) VALUES (?, ?, ?, ?, ?)', [bhiwadiId, 'General Morning Shift (A)', '07:00', '15:30', '11:00']);
  const shiftB = db.run('INSERT INTO shifts (plant_id, name, start_time, end_time, checkpoint_time) VALUES (?, ?, ?, ?, ?)', [bhiwadiId, 'Afternoon Shift (B)', '15:30', '00:00', '19:30']);
  const shiftC = db.run('INSERT INTO shifts (plant_id, name, start_time, end_time, checkpoint_time) VALUES (?, ?, ?, ?, ?)', [bhiwadiId, 'Night Shift (C)', '00:00', '07:00', '03:30']);

  // 4. Checklist Items
  const checklistItems = [
    // Cleanliness
    { category: 'CLEANLINESS', label: 'Floor clean', description: 'Dry, stain-free, swept and mopped with disinfectant', order: 1 },
    { category: 'CLEANLINESS', label: 'WC clean', description: 'Toilet pot descaled, disinfected, odorless and wiped', order: 2 },
    { category: 'CLEANLINESS', label: 'Urinal clean', description: 'Urinal bowls cleaned, screens placed, odor-free', order: 3 },
    { category: 'CLEANLINESS', label: 'Wash basin clean', description: 'Sink wiped, free of hair, water stains, and soap residue', order: 4 },
    { category: 'CLEANLINESS', label: 'Mirror clean', description: 'Crystal clear, streak-free and wipe dried', order: 5 },
    { category: 'CLEANLINESS', label: 'Wall clean', description: 'Tiles scrubbed, cobwebs removed, no splash stains', order: 6 },
    { category: 'CLEANLINESS', label: 'Door/partition clean', description: 'Cubicle partitions, handles and latches sanitized', order: 7 },

    // Consumables
    { category: 'CONSUMABLES', label: 'Handwash available', description: 'Liquid soap dispenser filled (>50%) and dispensing smoothly', order: 8 },
    { category: 'CONSUMABLES', label: 'Tissue available', description: 'Hand drying tissue roll or dispenser replenished', order: 9 },
    { category: 'CONSUMABLES', label: 'Toilet paper available', description: 'Toilet rolls placed in cubicle dispensers', order: 10 },
    { category: 'CONSUMABLES', label: 'Dustbin available', description: 'Lined with fresh trash bag, foot-pedal operational', order: 11 },
    { category: 'CONSUMABLES', label: 'Air freshener available', description: 'Automatic dispenser spraying or fragrance block active', order: 12 },

    // Equipment
    { category: 'EQUIPMENT', label: 'Water supply OK', description: 'Consistent high-pressure tap and flush water available', order: 13 },
    { category: 'EQUIPMENT', label: 'Flush working', description: 'Cistern/sensor flush triggers properly without leakage', order: 14 },
    { category: 'EQUIPMENT', label: 'Tap working', description: 'No continuous drip, leakage or loose fittings', order: 15 },
    { category: 'EQUIPMENT', label: 'Exhaust fan working', description: 'Ventilation fan running quietly and drawing air', order: 16 },
    { category: 'EQUIPMENT', label: 'Light working', description: 'All ceiling and mirror LED lights operational', order: 17 },
    { category: 'EQUIPMENT', label: 'Door lock working', description: 'Cubicle latches and main door locks latching securely', order: 18 }
  ];

  for (const c of checklistItems) {
    db.run(
      'INSERT INTO checklist_items (category, label, description, is_mandatory, order_num) VALUES (?, ?, ?, 1, ?)',
      [c.category, c.label, c.description, c.order]
    );
  }
  db.applyWashroomSheetChecklist();
  console.log(`Seeded ${checklistItems.length} checklist items`);

  // 5. Issue Categories
  const issueCats = [
    'Floor not clean',
    'WC not clean',
    'Urinal not clean',
    'Wash basin dirty',
    'Mirror dirty',
    'Wall dirty',
    'Door/partition dirty',
    'Handwash unavailable',
    'Tissue unavailable',
    'Toilet paper unavailable',
    'Dustbin unavailable',
    'Air freshener unavailable',
    'Water supply issue',
    'Flush issue',
    'Tap issue',
    'Exhaust fan issue',
    'Light issue',
    'Door lock issue',
    'Other'
  ];

  for (const cat of issueCats) {
    const priority = cat.includes('Water supply') || cat.includes('Flush') ? 'CRITICAL' : 'HIGH';
    db.run('INSERT INTO issue_categories (name, default_priority) VALUES (?, ?)', [cat, priority]);
  }

  // 6. Users
  const passwordHash = await bcrypt.hash('admin123', 10);
  const agentHash = await bcrypt.hash('agent123', 10);
  const superHash = await bcrypt.hash('super123', 10);
  const mgmtHash = await bcrypt.hash('mgmt123', 10);

  const users = [
    { employee_id: 'EMP-001', name: 'Vikram Malhotra', email: 'admin@hygiene360.com', password: passwordHash, role: 'SUPER_ADMIN', plantId: null, phone: '+91 98765 00001' },
    { employee_id: 'EMP-002', name: 'Sanjay Deshmukh', email: 'bhiwadi.admin@hygiene360.com', password: passwordHash, role: 'PLANT_ADMIN', plantId: bhiwadiId, phone: '+91 98765 00002' },
    { employee_id: 'SUP-101', name: 'Ramesh Kumar', email: 'ramesh.sup@hygiene360.com', password: superHash, role: 'SUPERVISOR', plantId: bhiwadiId, phone: '+91 98765 10101' },
    { employee_id: 'SUP-102', name: 'Anita Sharma', email: 'anita.sup@hygiene360.com', password: superHash, role: 'SUPERVISOR', plantId: bhiwadiId, phone: '+91 98765 10102' },
    { employee_id: 'HK-201', name: 'Sunil Verma', email: 'sunil.agent@hygiene360.com', password: agentHash, role: 'HOUSEKEEPING_AGENT', plantId: bhiwadiId, phone: '+91 98765 20101' },
    { employee_id: 'HK-202', name: 'Rahul Yadav', email: 'rahul.agent@hygiene360.com', password: agentHash, role: 'HOUSEKEEPING_AGENT', plantId: bhiwadiId, phone: '+91 98765 20102' },
    { employee_id: 'HK-203', name: 'Deepak Saini', email: 'deepak.agent@hygiene360.com', password: agentHash, role: 'HOUSEKEEPING_AGENT', plantId: bhiwadiId, phone: '+91 98765 20103' },
    { employee_id: 'MGT-501', name: 'Rajesh Singhania', email: 'management@hygiene360.com', password: mgmtHash, role: 'MANAGEMENT', plantId: null, phone: '+91 98765 50101' }
  ];

  const userIds = {};
  for (const u of users) {
    const res = db.run(
      'INSERT INTO users (employee_id, name, email, password_hash, role, plant_id, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [u.employee_id, u.name, u.email, u.password, u.role, u.plantId, u.phone]
    );
    userIds[u.employee_id] = res.lastInsertRowid;
  }
  console.log('Seeded Users:', Object.keys(userIds));

  // Assign toilets for today
  const agent1Id = userIds['HK-201'];
  const agent2Id = userIds['HK-202'];
  const agent3Id = userIds['HK-203'];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Assign 6 toilets to agent 1, 5 to agent 2, 5 to agent 3
  let count = 0;
  for (let i = 1; i <= 16; i++) {
    const code = `TLT-${String(i).padStart(2, '0')}`;
    const tId = toiletMap[code].id;
    const assignedAgent = count < 6 ? agent1Id : (count < 11 ? agent2Id : agent3Id);
    count++;
    db.run(
      'INSERT OR IGNORE INTO assignments (user_id, toilet_id, shift_id, assigned_date) VALUES (?, ?, ?, ?)',
      [assignedAgent, tId, shiftA.lastInsertRowid, todayStr]
    );
  }

  // 7. Seed Cleaning Sessions for Today (2026-09-27)
  // 14 Cleaned, 2 Pending (Toilet-07 and Toilet-16) -> 14 / 16 = 87.5% compliance
  const allChecklistItems = db.all('SELECT * FROM checklist_items WHERE is_active = 1');

  for (let i = 1; i <= 16; i++) {
    const code = `TLT-${String(i).padStart(2, '0')}`;
    const t = toiletMap[code];

    // Leave TLT-07 and TLT-16 PENDING today so the user can test the live flow on them!
    if (code === 'TLT-07' || code === 'TLT-16') {
      continue;
    }

    const sessionCode = `H360-${todayStr.replace(/-/g, '')}-${String(i).padStart(5, '0')}`;
    const agentId = i <= 6 ? agent1Id : (i <= 11 ? agent2Id : agent3Id);
    const startHour = 8 + Math.floor(i / 3);
    const startMin = (i * 12) % 60;
    const endMin = (startMin + 15) % 60;
    const startTime = `${todayStr} ${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}:00`;
    const submitTime = `${todayStr} ${String(startHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;

    // 1-2 items failed in Toilet 03 and Toilet 11 to reflect real-world failed checklists
    const hasFail = (i === 3 || i === 11);
    const passedCount = hasFail ? allChecklistItems.length - 1 : allChecklistItems.length;
    const failedCount = hasFail ? 1 : 0;
    const score = Number(((passedCount / allChecklistItems.length) * 100).toFixed(1));

    const sessRes = db.run(`
      INSERT INTO cleaning_sessions 
      (session_code, toilet_id, user_id, shift_id, date, start_time, submit_time, server_received_at, status, checklist_score, total_items, passed_items, failed_items, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?, ?)
    `, [sessionCode, t.id, agentId, shiftA.lastInsertRowid, todayStr, startTime, submitTime, submitTime, score, allChecklistItems.length, passedCount, failedCount, hasFail ? 'Minor issue flagged during sweep' : 'Standard scheduled deep clean complete']);

    const sessId = sessRes.lastInsertRowid;

    // Responses
    for (let ci = 0; ci < allChecklistItems.length; ci++) {
      const item = allChecklistItems[ci];
      const isFailItem = hasFail && ci === 4; // mirror or tissue
      db.run(`
        INSERT INTO checklist_responses (session_id, item_id, item_label, category, status, fail_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [sessId, item.id, item.label, item.category, isFailItem ? 'FAIL' : 'PASS', isFailItem ? 'Minor stain noticed, scheduled for buffing' : null]);
    }

    // Evidence photos
    const dummyHash1 = crypto.createHash('sha256').update(`clean_${sessId}_1`).digest('hex');
    const dummyHash2 = crypto.createHash('sha256').update(`clean_${sessId}_2`).digest('hex');
    const dummyHash3 = crypto.createHash('sha256').update(`clean_${sessId}_3`).digest('hex');

    db.run(`
      INSERT INTO evidence_photos (session_id, photo_type, storage_path, image_hash, captured_at, server_received_at, is_live_camera, uploaded_by)
      VALUES (?, 'CLEANING_EVIDENCE', '/uploads/evidence/demo_clean.jpg', ?, ?, ?, 1, ?)
    `, [sessId, dummyHash1, submitTime, submitTime, agentId]);

    db.run(`
      INSERT INTO evidence_photos (session_id, photo_type, storage_path, image_hash, captured_at, server_received_at, is_live_camera, uploaded_by)
      VALUES (?, 'TOILET_CONDITION', '/uploads/evidence/demo_toilet.jpg', ?, ?, ?, 1, ?)
    `, [sessId, dummyHash2, submitTime, submitTime, agentId]);

    db.run(`
      INSERT INTO evidence_photos (session_id, photo_type, storage_path, image_hash, captured_at, server_received_at, ocr_detected_date, is_live_camera, uploaded_by)
      VALUES (?, 'CHECK_SHEET', '/uploads/evidence/demo_sheet.jpg', ?, ?, ?, ?, 1, ?)
    `, [sessId, dummyHash3, submitTime, submitTime, todayStr, agentId]);
  }
  console.log('Seeded 14 completed cleaning sessions for today (leaving TLT-07 and TLT-16 pending)');

  // 8. Seed Supervisor Inspections (15 inspections)
  const supervisorId = userIds['SUP-101'];
  for (let i = 1; i <= 15; i++) {
    const code = `TLT-${String(i).padStart(2, '0')}`;
    const t = toiletMap[code];
    const status = (i === 7 || i === 11) ? 'NEEDS_ATTENTION' : 'SATISFACTORY';
    db.run(`
      INSERT INTO supervisor_inspections (toilet_id, supervisor_id, inspection_type, overall_status, score, remarks, inspected_at)
      VALUES (?, ?, 'TOILET_HOUSEKEEPING', ?, ?, ?, datetime('now', '-${i * 15} minutes'))
    `, [t.id, supervisorId, status, status === 'SATISFACTORY' ? 100 : 75, status === 'SATISFACTORY' ? 'Hygiene standards verified. Pass.' : 'Inspection noted minor deficiency. Issue created.']);
  }
  console.log('Seeded 15 supervisor inspections');

  // 9. Seed Issues & Recurring Issue History for Toilet-07 (Floor issue 5x, Flush issue 3x)
  const tlt07Id = toiletMap['TLT-07'].id;
  const areaQCId = areaQC.lastInsertRowid;

  // Historic recurring issues for TLT-07 to demonstrate RECURRING PROBLEM DETECTION
  // 5 Floor issues in the past 25 days
  for (let d = 1; d <= 5; d++) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - (d * 4));
    const pastDateStr = pastDate.toISOString().slice(0, 10) + ' 10:30:00';
    db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id, priority, status, created_at, resolved_at, verified_at, resolution_remarks, verification_remarks)
      VALUES (?, ?, ?, ?, 'Floor not clean', 'Recurrent water pooling and muddy footprints near doorway', ?, ?, 'HIGH', 'CLOSED', ?, datetime(?, '+2 hours'), datetime(?, '+3 hours'), 'Mop dried and anti-slip mat washed', 'Inspected and verified dry')
    `, [`H360-ISS-00010${d}`, bhiwadiId, tlt07Id, areaQCId, supervisorId, agent1Id, pastDateStr, pastDateStr, pastDateStr]);
  }

  // 3 Flush issues in the past 20 days
  for (let d = 1; d <= 3; d++) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - (d * 6));
    const pastDateStr = pastDate.toISOString().slice(0, 10) + ' 14:15:00';
    db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id, priority, status, created_at, resolved_at, verified_at, resolution_remarks, verification_remarks)
      VALUES (?, ?, ?, ?, 'Flush issue', 'Dual flush valve sticking in cubicle 2', ?, ?, 'CRITICAL', 'CLOSED', ?, datetime(?, '+4 hours'), datetime(?, '+5 hours'), 'Replaced seal gasket and adjusted lever', 'Flush pressure verified')
    `, [`H360-ISS-00012${d}`, bhiwadiId, tlt07Id, areaQCId, supervisorId, agent1Id, pastDateStr, pastDateStr, pastDateStr]);
  }

  // Additional resolved issues to reach 12 resolved issues
  for (let k = 1; k <= 4; k++) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - k);
    const pastDateStr = pastDate.toISOString().slice(0, 10) + ' 09:00:00';
    db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id, priority, status, created_at, resolved_at, verified_at, resolution_remarks)
      VALUES (?, ?, ?, ?, 'Handwash unavailable', 'Soap dispenser empty in wash bay', ?, ?, 'MEDIUM', 'RESOLVED', ?, datetime(?, '+1 hour'), datetime(?, '+1 hour'), 'Refilled with antimicrobial foaming soap')
    `, [`H360-ISS-00013${k}`, bhiwadiId, toiletMap[`TLT-0${k}`].id, areaPE.lastInsertRowid, supervisorId, agent2Id, pastDateStr, pastDateStr]);
  }

  // 3 OPEN Issues (matching the management KPI requirement: 3 Open Issues)
  const openIssues = [
    { ticket: 'H360-ISS-000245', toiletCode: 'TLT-07', cat: 'WC not clean', desc: 'Limescale ring and splash on rim in cubicle 1', prio: 'HIGH' },
    { ticket: 'H360-ISS-000246', toiletCode: 'TLT-03', cat: 'Tap issue', desc: 'Slow dripping tap on central basin #2', prio: 'MEDIUM' },
    { ticket: 'H360-ISS-000247', toiletCode: 'TLT-11', cat: 'Exhaust fan issue', desc: 'Exhaust fan making rattling vibration noise', prio: 'HIGH' }
  ];

  for (const oi of openIssues) {
    const t = toiletMap[oi.toiletCode];
    db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id, priority, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', datetime('now', '-2 hours'))
    `, [oi.ticket, bhiwadiId, t.id, areaQCId, oi.cat, oi.desc, supervisorId, agent1Id, oi.prio]);

    // Issue update log
    db.run(`
      INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks)
      VALUES ((SELECT id FROM issues WHERE ticket_no = ?), ?, NULL, 'OPEN', 'Ticket registered by supervisor during round')
    `, [oi.ticket, supervisorId]);
  }
  console.log('Seeded 3 Open Issues and 12 Resolved/Closed Issues');

  // 10. Seed Drinking Water Inspections
  db.run(`
    INSERT INTO drinking_water_checks (plant_id, area_id, point_name, supervisor_id, water_available, dispenser_clean, drinking_area_clean, glasses_available, ro_functioning, water_leakage, area_cleanliness, status, remarks)
    VALUES (?, ?, 'Assembly Bay RO Cooler Point 1', ?, 1, 1, 1, 1, 1, 0, 1, 'PASS', 'TDS at 92 ppm, UV lamp operational, drain tray sanitized.')
  `, [bhiwadiId, areaAH.lastInsertRowid, supervisorId]);

  db.run(`
    INSERT INTO drinking_water_checks (plant_id, area_id, point_name, supervisor_id, water_available, dispenser_clean, drinking_area_clean, glasses_available, ro_functioning, water_leakage, area_cleanliness, status, remarks)
    VALUES (?, ?, 'Warehouse Bay Cooler Point 2', ?, 1, 1, 1, 0, 1, 0, 1, 'PASS', 'Water cold, dispenser sanitized. Paper cups replenished.')
  `, [bhiwadiId, areaWH.lastInsertRowid, supervisorId]);

  // 11. Seed Notifications
  db.run(`
    INSERT INTO notifications (user_id, title, message, type, is_read, metadata_json)
    VALUES (?, 'New Issue Assigned: Toilet-07', 'New housekeeping issue reported for Toilet-07 (WC not clean). Please take corrective action.', 'ISSUE_ASSIGNED', 0, '{"ticket_no":"H360-ISS-000245","toilet_code":"TLT-07"}')
  `, [agent1Id]);

  db.run(`
    INSERT INTO notifications (user_id, title, message, type, is_read, metadata_json)
    VALUES (?, 'Checkpoint Warning: Pending Toilets', 'Daily Hygiene Compliance Alert: 2 toilets have not been cleaned/recorded today.', 'MISSED_CLEANING', 0, '{"plant_code":"BHIWADI","pending_count":2}')
  `, [userIds['EMP-002']]);

  // 12. Seed Immutable Audit Logs
  const auditActions = [
    { user: 'Vikram Malhotra', role: 'SUPER_ADMIN', action: 'SYSTEM_INITIALIZATION', entity: 'SYSTEM', id: 'INIT', details: 'Initialized master records and enterprise plant structure.' },
    { user: 'Sunil Verma', role: 'HOUSEKEEPING_AGENT', action: 'LOGIN', entity: 'USER', id: 'HK-201', details: 'Agent authenticated via mobile interface.' },
    { user: 'Sunil Verma', role: 'HOUSEKEEPING_AGENT', action: 'QR_SCAN', entity: 'TOILET', id: 'TLT-01', details: 'Scanned Toilet 01 secure opaque token.' },
    { user: 'Sunil Verma', role: 'HOUSEKEEPING_AGENT', action: 'CLEANING_SUBMITTED', entity: 'CLEANING_SESSION', id: 'H360-20260927-00001', details: 'Checklist 18/18 PASS. 3 live watermarked photos verified.' },
    { user: 'Ramesh Kumar', role: 'SUPERVISOR', action: 'SUPERVISOR_INSPECTION', entity: 'TOILET', id: 'TLT-07', details: 'Inspection score 75. Raised issue H360-ISS-000245.' },
    { user: 'Ramesh Kumar', role: 'SUPERVISOR', action: 'ISSUE_CREATED', entity: 'ISSUE', id: 'H360-ISS-000245', details: 'WC not clean reported for Toilet-07.' }
  ];

  for (const a of auditActions) {
    db.run(`
      INSERT INTO audit_logs (user_name, role, action, entity_type, entity_id, details_json, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, '127.0.0.1')
    `, [a.user, a.role, a.action, a.entity, a.id, a.details]);
  }

  // 13. System Settings
  const settings = [
    { key: 'CHECKPOINT_HOUR', value: '11:00', desc: 'Daily checkpoint time for missed cleaning alert' },
    { key: 'MAX_GALLERY_UPLOAD_ALLOWED', value: '0', desc: 'Disallow gallery uploads for official evidence (0=Enforced live camera)' },
    { key: 'DUPLICATE_HASH_PROTECTION', value: '1', desc: 'Reject duplicate photo hashes across all cleaning sessions' },
    { key: 'OCR_DATE_VALIDATION', value: '1', desc: 'Enforce check-sheet date matching today date' },
    { key: 'NOTIFICATION_PROVIDER', value: 'IN_APP_WEBHOOK', desc: 'Configurable notification dispatch channel' }
  ];

  for (const s of settings) {
    db.run(`INSERT INTO system_settings (key, value, description) VALUES (?, ?, ?)`, [s.key, s.value, s.desc]);
  }

  console.log('--- Hygiene 360 Database Seeding Completed Successfully ---');
}

seed().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
