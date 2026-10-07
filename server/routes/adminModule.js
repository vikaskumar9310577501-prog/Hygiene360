const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');
const slotUtils = require('../utils/slots');
const location = require('../utils/location');

// Admin Module: Plant Admin (ADMIN role) for own plant; IT Admin / Super Admin for all plants
router.use(authenticate, requireRole('PLANT_ADMIN', 'PLANT_HEAD', 'SUPER_ADMIN', 'IT_ADMIN'));
router.use((req, res, next) => {
  if (req.user.role === 'PLANT_HEAD' && req.method !== 'GET') {
    return res.status(403).json({ success: false, error: 'Plant Head has view-only access.' });
  }
  next();
});

const OPEN_ISSUE_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'];

function isGlobalAdmin(user) {
  return user.role === 'SUPER_ADMIN' || user.role === 'IT_ADMIN' || !user.plant_id;
}

async function scopedPlantIds(req, source = req.query) {
  if (!isGlobalAdmin(req.user)) return [req.user.plant_id];
  const { plantId, location } = source;
  if (plantId && plantId !== 'all') {
    const id = Number(plantId);
    return Number.isInteger(id) ? [id] : [];
  }
  const rows = location && location !== 'all'
    ? await db.all('SELECT id FROM plants WHERE location = ?', [location])
    : await db.all('SELECT id FROM plants');
  return rows.map(r => r.id);
}

async function slotsByPlant(plantIds) {
  const map = new Map(plantIds.map(id => [id, []]));
  if (!plantIds.length) return map;
  const rows = await db.all(
    `SELECT * FROM cleaning_slots WHERE plant_id IN (${inList(plantIds)}) AND area_id IS NULL AND is_active = 1 ORDER BY start_time ASC`,
    plantIds
  );
  for (const s of rows) {
    if (!map.has(s.plant_id)) map.set(s.plant_id, []);
    map.get(s.plant_id).push(s);
  }
  return map;
}

function canAccessPlant(req, plantId) {
  return isGlobalAdmin(req.user) || Number(plantId) === Number(req.user.plant_id);
}

function idParam(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

function inList(ids) {
  return ids.length ? ids.map(() => '?').join(',') : 'NULL';
}

function nowSql() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

async function sessionWithPlant(id) {
  return db.get(`
    SELECT cs.*, t.code as toilet_code, t.name as toilet_name, t.gender as toilet_gender, t.plant_id,
           p.name as plant_name, p.location as plant_location,
           b.name as building_name, f.name as floor_name, a.name as area_name,
           u.name as agent_name, u.employee_id as agent_emp_id, u.phone as agent_phone,
           rv.name as reviewed_by_name
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN areas a ON t.area_id = a.id
    LEFT JOIN floors f ON a.floor_id = f.id
    LEFT JOIN buildings b ON f.building_id = b.id
    LEFT JOIN users u ON cs.user_id = u.id
    LEFT JOIN users rv ON cs.reviewed_by = rv.id
    WHERE cs.id = ?
  `, [id]);
}

function sessionPriority(s) {
  if (s.status === 'COMPLETED' && ['PENDING', 'APPROVED'].includes(s.approval_status || 'APPROVED')) return 0;
  if (s.status === 'COMPLETED' || s.status === 'REJECTED') return 1;
  return 2;
}

// ----------------- FILTERS -----------------
router.get('/filters', async (req, res) => {
  const plantIds = await scopedPlantIds(req, {});
  const plants = await db.all(`SELECT id, name, code, location FROM plants WHERE id IN (${inList(plantIds)}) ORDER BY location, name`, plantIds);
  const locations = [...new Set(plants.map(p => p.location).filter(Boolean))];
  const housekeepers = await db.all(`
    SELECT id, name, employee_id, plant_id FROM users
    WHERE is_active = 1 AND role IN ('HOUSEKEEPING_AGENT', 'HOUSEKEEPING') AND plant_id IN (${inList(plantIds)})
    ORDER BY name
  `, plantIds);
  const toilets = await db.all(`
    SELECT id, code, name, plant_id FROM toilets WHERE is_active = 1 AND plant_id IN (${inList(plantIds)}) ORDER BY code
  `, plantIds);
  res.json({ success: true, plants, locations, housekeepers, toilets, isGlobal: isGlobalAdmin(req.user) });
});

// ----------------- CLEANING TIME SLOTS (location-wise) -----------------
// A location's timings are stored as one copy per plant; the same start–end time across plants is one location slot
async function slotScopePlants(req, src) {
  const ids = await scopedPlantIds(req, {});
  const plants = await db.all(`SELECT id, name, code, location FROM plants WHERE id IN (${inList(ids)}) ORDER BY name`, ids);
  if (src.location && src.location !== 'all') {
    const list = plants.filter(p => p.location === src.location);
    return list.length ? { plants: list, label: src.location } : { error: 'No plant found in this location' };
  }
  if (src.plantId) {
    const p = plants.find(x => x.id === Number(src.plantId));
    return p ? { plants: [p], label: p.name } : { error: 'You do not have access to this plant' };
  }
  return { error: 'Please select a location' };
}

async function locationSlots(plants) {
  const byTime = new Map();
  const plantSlots = await slotsByPlant(plants.map(p => p.id));
  for (const p of plants) {
    for (const s of plantSlots.get(p.id) || []) {
      const key = `${s.start_time}-${s.end_time}`;
      if (!byTime.has(key)) {
        byTime.set(key, { key, label: s.label, start_time: s.start_time, end_time: s.end_time, range: slotUtils.slotRange(s), slot_ids: [], plant_ids: [] });
      }
      const row = byTime.get(key);
      row.slot_ids.push(s.id);
      row.plant_ids.push(p.id);
    }
  }
  return [...byTime.values()]
    .map(r => ({ ...r, missing_plants: plants.filter(p => !r.plant_ids.includes(p.id)).map(p => p.name) }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

async function validateSlotPayload(body, plants, excludeIds = []) {
  const label = String(body.label || '').trim();
  const start = String(body.start_time || '').trim();
  const end = String(body.end_time || '').trim();
  const st = slotUtils.toMinutes(start);
  const en = slotUtils.toMinutes(end);
  if (!label) return 'Please enter a slot name (e.g. "Morning 8 AM")';
  if (st === null || en === null) return 'Please enter Start and End time in the correct format';
  if (en <= st) return 'End time must be after Start time';
  const plantSlots = await slotsByPlant(plants.map(p => p.id));
  for (const p of plants) {
    const overlapping = (plantSlots.get(p.id) || []).find(s =>
      !excludeIds.includes(s.id) && st < slotUtils.toMinutes(s.end_time) && en > slotUtils.toMinutes(s.start_time)
    );
    if (overlapping) return `This time overlaps with the "${overlapping.label}" (${slotUtils.slotRange(overlapping)}) slot${plants.length > 1 ? ` in ${p.name}` : ''}`;
  }
  return null;
}

async function slotIdsInScope(body, plants) {
  const ids = Array.isArray(body.slot_ids) ? body.slot_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return [];
  const plantIds = plants.map(p => p.id);
  return (await db.all(`SELECT * FROM cleaning_slots WHERE id IN (${inList(ids)}) AND is_active = 1`, ids))
    .filter(s => plantIds.includes(s.plant_id));
}

router.get('/slots', async (req, res) => {
  const scope = await slotScopePlants(req, req.query);
  if (scope.error) return res.status(400).json({ success: false, error: scope.error });
  res.json({ success: true, plants: scope.plants, slots: await locationSlots(scope.plants) });
});

router.post('/slots', async (req, res) => {
  const scope = await slotScopePlants(req, req.body);
  if (scope.error) return res.status(400).json({ success: false, error: scope.error });
  const err = await validateSlotPayload(req.body, scope.plants);
  if (err) return res.status(400).json({ success: false, error: err });

  const label = req.body.label.trim();
  const start = req.body.start_time.trim();
  const end = req.body.end_time.trim();
  for (const p of scope.plants) {
    await db.run(
      'INSERT INTO cleaning_slots (plant_id, area_id, label, start_time, end_time, created_by) VALUES (?, NULL, ?, ?, ?, ?)',
      [p.id, label, start, end, req.user.id]
    );
  }
  await auditLogFromReq(req, 'CLEANING_SLOT_CREATED', 'LOCATION', scope.label, {
    plants: scope.plants.map(p => p.name), label, start, end
  });
  res.json({ success: true, plants: scope.plants.length });
});

router.put('/slots', async (req, res) => {
  const scope = await slotScopePlants(req, req.body);
  if (scope.error) return res.status(400).json({ success: false, error: scope.error });
  const existing = await slotIdsInScope(req.body, scope.plants);
  if (!existing.length) return res.status(404).json({ success: false, error: 'Slot not found' });
  const err = await validateSlotPayload(req.body, scope.plants, existing.map(s => s.id));
  if (err) return res.status(400).json({ success: false, error: err });

  const label = req.body.label.trim();
  const start = req.body.start_time.trim();
  const end = req.body.end_time.trim();
  for (const s of existing) {
    await db.run(
      'UPDATE cleaning_slots SET label = ?, start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [label, start, end, s.id]
    );
  }
  // Saving also applies the slot to plants of this location that did not have it yet
  const covered = new Set(existing.map(s => s.plant_id));
  for (const p of scope.plants.filter(x => !covered.has(x.id))) {
    await db.run(
      'INSERT INTO cleaning_slots (plant_id, area_id, label, start_time, end_time, created_by) VALUES (?, NULL, ?, ?, ?, ?)',
      [p.id, label, start, end, req.user.id]
    );
  }
  await auditLogFromReq(req, 'CLEANING_SLOT_UPDATED', 'LOCATION', scope.label, {
    from: `${existing[0].start_time}-${existing[0].end_time}`, to: `${start}-${end}`, plants: scope.plants.map(p => p.name)
  });
  res.json({ success: true });
});

router.delete('/slots', async (req, res) => {
  const scope = await slotScopePlants(req, req.body);
  if (scope.error) return res.status(400).json({ success: false, error: scope.error });
  const existing = await slotIdsInScope(req.body, scope.plants);
  if (!existing.length) return res.status(404).json({ success: false, error: 'Slot not found' });
  for (const s of existing) {
    await db.run('UPDATE cleaning_slots SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [s.id]);
  }
  await auditLogFromReq(req, 'CLEANING_SLOT_DELETED', 'LOCATION', scope.label, {
    label: existing[0].label, range: `${existing[0].start_time}-${existing[0].end_time}`, plants: scope.plants.map(p => p.name)
  });
  res.json({ success: true });
});

// ----------------- DASHBOARD (KPIs + live slot board) -----------------
router.get('/dashboard', async (req, res) => {
  const ist = slotUtils.istNow();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : ist.date;
  const plantIds = await scopedPlantIds(req);

  const plants = await db.all(`SELECT id, name, code, location FROM plants WHERE id IN (${inList(plantIds)}) ORDER BY location, name`, plantIds);
  const toilets = await db.all(`
    SELECT t.id, t.code, t.name, t.gender, t.plant_id, t.area_id, t.assigned_user_id,
           u.name as assigned_user_name, u.employee_id as assigned_user_emp_id,
           a.name as area_name
    FROM toilets t
    LEFT JOIN users u ON t.assigned_user_id = u.id
    LEFT JOIN areas a ON t.area_id = a.id
    WHERE t.is_active = 1 AND t.plant_id IN (${inList(plantIds)})
    ORDER BY t.code
  `, plantIds);

  const sessions = await db.all(`
    SELECT cs.id, cs.toilet_id, cs.slot_id, cs.status, cs.approval_status, cs.submit_time, cs.start_time,
           cs.approved_at, cs.approved_by_name, cs.reviewed_at, cs.submitted_late, cs.checklist_score,
           u.name as agent_name, u.employee_id as agent_emp_id,
           (SELECT storage_path FROM evidence_photos ep WHERE ep.session_id = cs.id AND ep.photo_type = 'CLEANING_EVIDENCE' AND ep.is_rejected = 0 ORDER BY ep.id DESC LIMIT 1) as live_photo,
           (SELECT storage_path FROM evidence_photos ep WHERE ep.session_id = cs.id AND ep.photo_type = 'CHECK_SHEET' AND ep.is_rejected = 0 ORDER BY ep.id DESC LIMIT 1) as sheet_photo
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.slot_date = ? AND cs.slot_id IS NOT NULL AND t.plant_id IN (${inList(plantIds)})
  `, [date, ...plantIds]);

  const best = {};
  for (const s of sessions) {
    const key = `${s.toilet_id}_${s.slot_id}`;
    const cur = best[key];
    if (!cur || sessionPriority(s) < sessionPriority(cur) || (sessionPriority(s) === sessionPriority(cur) && s.id > cur.id)) {
      best[key] = s;
    }
  }

  const lastCleaner = {};
  if (toilets.length) {
    const lastRows = await db.all(`
      SELECT cs.toilet_id, u.name as agent_name, u.employee_id as agent_emp_id, cs.submit_time
      FROM cleaning_sessions cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.status = 'COMPLETED' AND cs.toilet_id IN (${inList(toilets.map(t => t.id))})
        AND cs.id = (SELECT MAX(x.id) FROM cleaning_sessions x WHERE x.toilet_id = cs.toilet_id AND x.status = 'COMPLETED')
    `, toilets.map(t => t.id));
    for (const r of lastRows) lastCleaner[r.toilet_id] = r;
  }
  const plantSlots = await slotsByPlant(plants.map(p => p.id));

  // submit_time is stored in UTC; minutes late are measured against the slot end in IST
  const minutesLate = (sess, slot) => {
    if (!sess || !sess.submitted_late || !sess.submit_time) return null;
    const d = new Date(`${String(sess.submit_time).replace(' ', 'T')}Z`);
    if (isNaN(d.getTime())) return null;
    const ist = new Date(d.getTime() + 330 * 60000);
    const istDate = ist.toISOString().slice(0, 10);
    const dayOffset = Math.round((new Date(`${istDate}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000);
    const mins = dayOffset * 1440 + ist.getUTCHours() * 60 + ist.getUTCMinutes();
    return Math.max(0, mins - slotUtils.toMinutes(slot.end_time));
  };

  const counts = { total: 0, APPROVED: 0, PENDING: 0, REJECTED: 0, MISSED: 0, DUE: 0, IN_PROGRESS: 0, UPCOMING: 0, LATE: 0, ON_TIME: 0 };
  const board = plants.map(p => {
    const slotMap = new Map();
    const rows = toilets.filter(t => t.plant_id === p.id).map(t => ({
      ...t,
      cells: (plantSlots.get(t.plant_id) || []).map(s => {
        if (!slotMap.has(s.id)) slotMap.set(s.id, { ...s, range: slotUtils.slotRange(s) });
        const sess = best[`${t.id}_${s.id}`] || null;
        const status = slotUtils.computeCellStatus(s, sess, date, ist);
        counts.total++;
        counts[status] = (counts[status] || 0) + 1;
        if (['APPROVED', 'PENDING'].includes(status)) {
          if (sess && sess.submitted_late) counts.LATE++;
          else counts.ON_TIME++;
        }
        const last = lastCleaner[t.id] || null;
        return {
          slot_id: s.id,
          status,
          session_id: sess ? sess.id : null,
          agent_name: sess ? sess.agent_name : null,
          agent_emp_id: sess ? sess.agent_emp_id : null,
          start_time: sess ? sess.start_time : null,
          live_photo: sess ? sess.live_photo : null,
          sheet_photo: sess ? sess.sheet_photo : null,
          minutes_late: minutesLate(sess, s),
          last_agent_name: last ? last.agent_name : null,
          last_agent_emp_id: last ? last.agent_emp_id : null,
          submit_time: sess ? sess.submit_time : null,
          approved_at: sess ? sess.approved_at : null,
          approved_by_name: sess ? sess.approved_by_name : null,
          submitted_late: sess ? !!sess.submitted_late : false,
          score: sess ? sess.checklist_score : null
        };
      })
    }));
    const slots = [...slotMap.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const current = date === ist.date ? slotUtils.findCurrentSlot(slots, ist.minutes) : null;
    return { plant: p, slots, rows, currentSlotId: current ? current.id : null };
  });

  const pendingApprovals = (await db.get(`
    SELECT COUNT(*) as c FROM cleaning_sessions cs JOIN toilets t ON cs.toilet_id = t.id
    WHERE cs.status = 'COMPLETED' AND cs.approval_status = 'PENDING' AND t.plant_id IN (${inList(plantIds)})
  `, plantIds)).c;

  const openComplaints = (await db.get(`
    SELECT COUNT(*) as c FROM issues
    WHERE status IN (${inList(OPEN_ISSUE_STATUSES)}) AND plant_id IN (${inList(plantIds)})
  `, [...OPEN_ISSUE_STATUSES, ...plantIds])).c;

  const reviewedToday = (await db.get(`
    SELECT COUNT(*) as c FROM cleaning_sessions cs JOIN toilets t ON cs.toilet_id = t.id
    WHERE cs.approval_status IN ('APPROVED', 'REJECTED') AND cs.slot_date = ? AND t.plant_id IN (${inList(plantIds)})
  `, [date, ...plantIds])).c;

  res.json({
    success: true,
    date,
    today: ist.date,
    nowMinutes: ist.minutes,
    kpis: {
      totalToilets: toilets.length,
      totalSlotChecks: counts.total,
      approved: counts.APPROVED,
      pendingForDate: counts.PENDING,
      rejected: counts.REJECTED,
      missed: counts.MISSED,
      due: counts.DUE + counts.IN_PROGRESS,
      upcoming: counts.UPCOMING,
      late: counts.LATE,
      onTime: counts.ON_TIME,
      done: counts.APPROVED + counts.PENDING,
      pendingApprovals,
      reviewedToday,
      openComplaints,
      compliance: counts.total - counts.UPCOMING > 0
        ? Math.round(((counts.APPROVED + counts.PENDING) / (counts.total - counts.UPCOMING)) * 100)
        : null
    },
    board
  });
});

// ----------------- APPROVALS -----------------
router.get('/approvals', async (req, res) => {
  const plantIds = await scopedPlantIds(req);
  const status = String(req.query.status || 'PENDING').toUpperCase();
  const params = [...plantIds];
  let where = `t.plant_id IN (${inList(plantIds)}) AND cs.status IN ('COMPLETED', 'REJECTED')`;

  if (status === 'PENDING') {
    where += " AND cs.approval_status = 'PENDING'";
  } else if (status === 'APPROVED' || status === 'REJECTED') {
    where += ' AND cs.approval_status = ?';
    params.push(status);
  } else {
    where += ' AND cs.approval_status IS NOT NULL';
  }
  if (req.query.date && status !== 'PENDING') {
    where += ' AND COALESCE(cs.slot_date, cs.date) = ?';
    params.push(req.query.date);
  }

  const list = await db.all(`
    SELECT cs.id, cs.session_code, cs.toilet_id, cs.status, cs.approval_status, cs.submit_time, cs.start_time,
           cs.slot_label, cs.slot_start, cs.slot_end, cs.slot_date, cs.submitted_late,
           cs.checklist_score, cs.total_items, cs.passed_items, cs.failed_items,
           cs.reviewed_at, cs.approved_at, cs.approved_by_name, cs.approval_remarks,
           t.code as toilet_code, t.name as toilet_name, t.gender as toilet_gender,
           p.name as plant_name, p.location as plant_location,
           u.name as agent_name, u.employee_id as agent_emp_id,
           (SELECT COUNT(*) FROM evidence_photos ep WHERE ep.session_id = cs.id AND ep.is_rejected = 0) as photo_count
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE ${where}
    ORDER BY ${status === 'PENDING' ? 'cs.submit_time ASC' : 'COALESCE(cs.approved_at, cs.submit_time) DESC'}
    LIMIT 300
  `, params);

  res.json({ success: true, approvals: list });
});

router.get('/sessions/:id', async (req, res) => {
  const session = await sessionWithPlant(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!canAccessPlant(req, session.plant_id)) return res.status(403).json({ success: false, error: 'You do not have access to this plant' });

  const responses = await db.all(`
    SELECT cr.*, ci.order_num FROM checklist_responses cr
    LEFT JOIN checklist_items ci ON cr.item_id = ci.id
    WHERE cr.session_id = ? ORDER BY ci.order_num ASC
  `, [session.id]);
  const photos = await db.all(`
    SELECT id, photo_type, storage_path, captured_at, server_received_at, ocr_detected_date, is_live_camera
    FROM evidence_photos WHERE session_id = ? AND is_rejected = 0 ORDER BY id ASC
  `, [session.id]);

  res.json({ success: true, session, responses, photos });
});

router.post('/sessions/:id/reviewed', async (req, res) => {
  const session = await sessionWithPlant(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!canAccessPlant(req, session.plant_id)) return res.status(403).json({ success: false, error: 'You do not have access to this plant' });
  if (!session.reviewed_at) {
    await db.run('UPDATE cleaning_sessions SET reviewed_at = ?, reviewed_by = ? WHERE id = ?', [nowSql(), req.user.id, session.id]);
    await auditLogFromReq(req, 'CLEANING_PHOTOS_REVIEWED', 'CLEANING_SESSION', String(session.id), { toilet_code: session.toilet_code });
  }
  res.json({ success: true });
});

function slotText(session) {
  return session.slot_label ? ` • ${session.slot_label} (${slotUtils.slotRange({ start_time: session.slot_start, end_time: session.slot_end })})` : '';
}

// Approving a re-done cleaning closes the admin's issue on the original entry
async function closeCleaningIssue(req, session, at) {
  if (!session.issue_id) return;
  const issue = await db.get("SELECT id, status FROM issues WHERE id = ? AND complaint_type = 'CLEANING_AUDIT'", [session.issue_id]);
  if (!issue || issue.status === 'CLOSED') return;
  await db.run("UPDATE issues SET status = 'CLOSED', verified_at = ?, verification_remarks = ? WHERE id = ?",
    [at, `Re-done cleaning approved by ${req.user.name}`, issue.id]);
  await db.run('INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks) VALUES (?, ?, ?, ?, ?)',
    [issue.id, req.user.id, issue.status, 'CLOSED', `Re-done cleaning ${session.session_code} approved.`]);
}

// Admin found a problem in the entry: it counts as fake and comes back to the housekeeper's My Issues to redo
async function raiseCleaningIssue(req, session, remarks, at) {
  const livePhoto = await db.get("SELECT storage_path FROM evidence_photos WHERE session_id = ? AND photo_type = 'CLEANING_EVIDENCE' ORDER BY id DESC LIMIT 1", [session.id]);
  const targetAt = await location.targetFromNow();
  const existing = session.issue_id
    ? await db.get("SELECT id, ticket_no, status FROM issues WHERE id = ? AND complaint_type = 'CLEANING_AUDIT'", [session.issue_id])
    : null;

  let issueId;
  let ticketNo;
  if (existing) {
    issueId = existing.id;
    ticketNo = existing.ticket_no;
    await db.run(`
      UPDATE issues SET status = 'REOPENED', verification_remarks = ?, description = ?, source_session_id = ?, target_at = ?,
             resolved_at = NULL, verified_at = NULL, reopened_count = COALESCE(reopened_count, 0) + 1
      WHERE id = ?
    `, [remarks, remarks, session.id, targetAt, issueId]);
    await db.run('INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path) VALUES (?, ?, ?, ?, ?, ?)',
      [issueId, req.user.id, existing.status, 'REOPENED', `Re-done cleaning ${session.session_code} also not accepted: ${remarks}`, livePhoto ? livePhoto.storage_path : null]);
  } else {
    const ctx = await location.getToiletContext(session.toilet_id);
    ticketNo = await location.nextTicketNo('H360-ISS');
    const ins = await db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id,
                          evidence_photo_path, priority, status, complaint_type, reported_by_name, reported_by_emp_id,
                          checklist_item_label, target_at, source_session_id, is_fake_audit_flagged,
                          flagged_agent_name, flagged_agent_emp_id, flagged_session_code, flagged_reason)
      VALUES (?, ?, ?, ?, 'Cleaning Review', ?, ?, ?, ?, 'HIGH', 'ASSIGNED', 'CLEANING_AUDIT', ?, ?, 'Cleaning not accepted by admin', ?, ?, 1, ?, ?, ?, ?)
    `, [ticketNo, session.plant_id, session.toilet_id, ctx ? ctx.area_id : null, remarks, req.user.id, session.user_id,
        livePhoto ? livePhoto.storage_path : null, req.user.name, req.user.employee_id || null, targetAt, session.id,
        session.agent_name || null, session.agent_emp_id || null, session.session_code, remarks]);
    issueId = Number(ins.lastInsertRowid);
    await db.run('INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path) VALUES (?, ?, NULL, ?, ?, ?)',
      [issueId, req.user.id, 'ASSIGNED', `Issue raised on cleaning ${session.session_code}${slotText(session)}: ${remarks}`, livePhoto ? livePhoto.storage_path : null]);
  }

  await db.run(`
    UPDATE cleaning_sessions
    SET status = 'REJECTED', approval_status = 'REJECTED', approved_by = ?, approved_by_name = ?, approved_at = ?,
        approval_remarks = ?, rejection_reason = ?, is_fake_audit_flagged = 1, fake_flag_reason = ?, issue_found = 1, issue_id = ?
    WHERE id = ?
  `, [req.user.id, req.user.name, at, remarks, remarks, `Issue raised by ${req.user.name}: ${remarks}`, issueId, session.id]);

  await slotUtils.notify(
    session.user_id,
    'Cleaning Issue Raised — Please Redo',
    `${ticketNo}: ${req.user.name} raised an issue on your cleaning of ${session.toilet_code} (${session.toilet_name})${slotText(session)}. Remark: ${remarks}. Open My Issues, clean again and resubmit with a live photo.`,
    'ISSUE_ASSIGNED',
    { issue_id: issueId, ticket_no: ticketNo, session_id: session.id, toilet_code: session.toilet_code, toilet_name: session.toilet_name, target_at: targetAt }
  );
  return { issueId, ticketNo };
}

async function applyDecision(req, session, decision, remarks) {
  const at = nowSql();
  let raised = null;
  if (decision === 'APPROVED') {
    await db.run(`
      UPDATE cleaning_sessions
      SET approval_status = 'APPROVED', approved_by = ?, approved_by_name = ?, approved_at = ?, approval_remarks = ?
      WHERE id = ?
    `, [req.user.id, req.user.name, at, remarks || null, session.id]);
    await closeCleaningIssue(req, session, at);
    await slotUtils.notify(
      session.user_id,
      'Cleaning Approved ✓',
      `Cleaning of ${session.toilet_code} (${session.toilet_name})${session.slot_label ? ` • ${session.slot_label}` : ''} was approved by ${req.user.name}.`,
      'CLEANING_APPROVED',
      { session_id: session.id, toilet_code: session.toilet_code, toilet_name: session.toilet_name }
    );
  } else {
    raised = await raiseCleaningIssue(req, session, remarks, at);
  }
  await auditLogFromReq(req, decision === 'APPROVED' ? 'CLEANING_APPROVED' : 'CLEANING_ISSUE_RAISED', 'CLEANING_SESSION', String(session.id), {
    toilet_code: session.toilet_code,
    slot: session.slot_label,
    agent: session.agent_name,
    remarks: remarks || null,
    ticket_no: raised ? raised.ticketNo : null
  });
  return raised;
}

function decisionGuard(req, session) {
  if (!session) return [404, 'Session not found'];
  if (!canAccessPlant(req, session.plant_id)) return [403, 'You do not have access to this plant'];
  if (session.approval_status !== 'PENDING' || session.status !== 'COMPLETED') return [400, 'This request has already been processed'];
  return null;
}

router.post('/sessions/:id/approve', async (req, res) => {
  const session = await sessionWithPlant(req.params.id);
  const guard = decisionGuard(req, session);
  if (guard) return res.status(guard[0]).json({ success: false, error: guard[1] });
  if (!session.reviewed_at) {
    return res.status(400).json({ success: false, code: 'NOT_REVIEWED', error: 'Please open and view all photos before approving.' });
  }
  await applyDecision(req, session, 'APPROVED', String(req.body.remarks || '').trim());
  res.json({ success: true });
});

async function handleRaiseIssue(req, res) {
  const remarks = String(req.body.remarks || '').trim();
  if (!remarks) return res.status(400).json({ success: false, error: 'Please write a remark describing the issue' });
  const session = await sessionWithPlant(req.params.id);
  const guard = decisionGuard(req, session);
  if (guard) return res.status(guard[0]).json({ success: false, error: guard[1] });
  const raised = await applyDecision(req, session, 'REJECTED', remarks);
  res.json({ success: true, ...raised });
}

router.post('/sessions/:id/issue', handleRaiseIssue);
router.post('/sessions/:id/reject', handleRaiseIssue);

router.post('/approvals/bulk-approve', async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ success: false, error: 'No requests selected' });
  const remarks = String(req.body.remarks || '').trim();
  const approved = [];
  const skipped = [];
  for (const id of ids) {
    const session = await sessionWithPlant(id);
    const guard = decisionGuard(req, session);
    if (guard) { skipped.push({ id, reason: guard[1] }); continue; }
    if (!session.reviewed_at) { skipped.push({ id, reason: 'Photos not reviewed yet' }); continue; }
    await applyDecision(req, session, 'APPROVED', remarks);
    approved.push(id);
  }
  res.json({ success: true, approved, skipped });
});

// ----------------- TRACKING / HISTORY -----------------
router.get('/tracking', async (req, res) => {
  const ist = slotUtils.istNow();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : ist.date;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : ist.date;
  const plantIds = await scopedPlantIds(req);

  const params = [from, to, ...plantIds];
  let where = `COALESCE(cs.slot_date, cs.date) BETWEEN ? AND ? AND t.plant_id IN (${inList(plantIds)}) AND cs.status IN ('COMPLETED', 'REJECTED')`;
  if (req.query.userId) { where += ' AND cs.user_id = ?'; params.push(idParam(req.query.userId)); }
  if (req.query.toiletId) { where += ' AND cs.toilet_id = ?'; params.push(idParam(req.query.toiletId)); }

  const sessions = await db.all(`
    SELECT cs.id, cs.session_code, COALESCE(cs.slot_date, cs.date) as day, cs.slot_label, cs.slot_start, cs.slot_end,
           cs.start_time, cs.submit_time, cs.status, cs.approval_status, cs.approved_at, cs.approved_by_name,
           cs.approval_remarks, cs.reviewed_at, cs.submitted_late, cs.checklist_score,
           t.code as toilet_code, t.name as toilet_name, p.name as plant_name, p.location as plant_location,
           u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE ${where}
    ORDER BY cs.submit_time DESC, cs.id DESC
    LIMIT 1000
  `, params);

  const missParams = [from, to, ...plantIds];
  let missWhere = `l.kind = 'MISSED' AND l.toilet_id > 0 AND l.slot_date BETWEEN ? AND ? AND t.plant_id IN (${inList(plantIds)})`;
  if (req.query.userId) { missWhere += ' AND t.assigned_user_id = ?'; missParams.push(idParam(req.query.userId)); }
  if (req.query.toiletId) { missWhere += ' AND l.toilet_id = ?'; missParams.push(idParam(req.query.toiletId)); }
  const missed = await db.all(`
    SELECT l.id, l.slot_date as day, l.created_at, s.label as slot_label, s.start_time as slot_start, s.end_time as slot_end,
           t.code as toilet_code, t.name as toilet_name, p.name as plant_name, p.location as plant_location,
           u.name as agent_name, u.employee_id as agent_emp_id
    FROM slot_notification_log l
    JOIN toilets t ON l.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN cleaning_slots s ON l.slot_id = s.id
    LEFT JOIN users u ON t.assigned_user_id = u.id
    WHERE ${missWhere}
    ORDER BY l.slot_date DESC, s.start_time DESC
    LIMIT 500
  `, missParams);

  res.json({ success: true, from, to, sessions, missed });
});

// ----------------- HOUSEKEEPER PERFORMANCE -----------------
router.get('/performance', async (req, res) => {
  const ist = slotUtils.istNow();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : ist.date;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : ist.date;
  const plantIds = await scopedPlantIds(req);

  const staff = await db.all(`
    SELECT u.id, u.name, u.employee_id, p.name as plant_name,
           (SELECT COUNT(*) FROM toilets t WHERE t.assigned_user_id = u.id AND t.is_active = 1) as toilets_assigned
    FROM users u LEFT JOIN plants p ON u.plant_id = p.id
    WHERE u.is_active = 1 AND u.role IN ('HOUSEKEEPING_AGENT', 'HOUSEKEEPING') AND u.plant_id IN (${inList(plantIds)})
    ORDER BY u.name
  `, plantIds);

  const staffIds = staff.map(s => s.id);
  const aggByUser = new Map();
  const missedByUser = new Map();
  if (staffIds.length) {
    const aggRows = await db.all(`
      SELECT
        user_id,
        SUM(CASE WHEN status IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 0 END) as submitted,
        SUM(CASE WHEN approval_status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN approval_status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN approval_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN submitted_late = 1 AND status = 'COMPLETED' THEN 1 ELSE 0 END) as late,
        AVG(CASE WHEN status = 'COMPLETED' THEN checklist_score END) as avg_score
      FROM cleaning_sessions
      WHERE user_id IN (${inList(staffIds)}) AND COALESCE(slot_date, date) BETWEEN ? AND ?
      GROUP BY user_id
    `, [...staffIds, from, to]);
    for (const r of aggRows) aggByUser.set(r.user_id, r);
    const missedRows = await db.all(`
      SELECT t.assigned_user_id as user_id, COUNT(*) as c FROM slot_notification_log l JOIN toilets t ON l.toilet_id = t.id
      WHERE l.kind = 'MISSED' AND t.assigned_user_id IN (${inList(staffIds)}) AND l.slot_date BETWEEN ? AND ?
      GROUP BY t.assigned_user_id
    `, [...staffIds, from, to]);
    for (const r of missedRows) missedByUser.set(r.user_id, Number(r.c) || 0);
  }

  const rows = staff.map(s => {
    const agg = aggByUser.get(s.id) || {};
    const missed = missedByUser.get(s.id) || 0;
    const submitted = agg.submitted || 0;
    const late = agg.late || 0;
    const onTimeBase = submitted + missed;
    return {
      ...s,
      submitted,
      approved: agg.approved || 0,
      rejected: agg.rejected || 0,
      pending: agg.pending || 0,
      late,
      missed,
      avg_score: agg.avg_score !== null && agg.avg_score !== undefined ? Math.round(agg.avg_score) : null,
      on_time_pct: onTimeBase > 0 ? Math.round(((submitted - late) / onTimeBase) * 100) : null
    };
  });

  res.json({ success: true, from, to, staff: rows });
});

module.exports = router;
