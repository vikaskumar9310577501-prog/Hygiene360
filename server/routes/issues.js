const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../database');
const storage = require('../utils/storage');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');
const { applyWatermark } = require('../utils/watermark');
const location = require('../utils/location');
const slotUtils = require('../utils/slots');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, fieldSize: 15 * 1024 * 1024 }
});
const ACTIVE_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
const VERIFIER_ROLES = ['SUPERVISOR', 'SUPER_ADMIN', 'PLANT_ADMIN', 'IT_ADMIN'];
const isHousekeepingRole = role => role === 'HOUSEKEEPING_AGENT' || role === 'HOUSEKEEPING';

// Evaluation points filled by company employees after scanning the toilet QR
const EVALUATION_POINTS = [
  { key: 'FLOOR_CLEAN', category: 'CLEANLINESS', label: 'Floor clean' },
  { key: 'WC_CLEAN', category: 'CLEANLINESS', label: 'WC clean' },
  { key: 'URINAL_CLEAN', category: 'CLEANLINESS', label: 'Urinal clean', maleOnly: true },
  { key: 'WASH_BASIN_CLEAN', category: 'CLEANLINESS', label: 'Wash basin clean' },
  { key: 'MIRROR_CLEAN', category: 'CLEANLINESS', label: 'Mirror clean' },
  { key: 'WALL_CLEAN', category: 'CLEANLINESS', label: 'Wall clean' },
  { key: 'DOOR_PARTITION_CLEAN', category: 'CLEANLINESS', label: 'Door/partition clean' },
  { key: 'HANDWASH_AVAILABLE', category: 'CONSUMABLES', label: 'Handwash available' },
  { key: 'TISSUE_AVAILABLE', category: 'CONSUMABLES', label: 'Tissue available' },
  { key: 'TOILET_PAPER_AVAILABLE', category: 'CONSUMABLES', label: 'Toilet paper available' },
  { key: 'DUSTBIN_AVAILABLE', category: 'CONSUMABLES', label: 'Dustbin available' },
  { key: 'AIR_FRESHENER_AVAILABLE', category: 'CONSUMABLES', label: 'Air freshener available' },
  { key: 'WATER_SUPPLY_OK', category: 'EQUIPMENT', label: 'Water supply OK' },
  { key: 'FLUSH_WORKING', category: 'EQUIPMENT', label: 'Flush working' },
  { key: 'TAP_WORKING', category: 'EQUIPMENT', label: 'Tap working' },
  { key: 'EXHAUST_FAN_WORKING', category: 'EQUIPMENT', label: 'Exhaust fan working' },
  { key: 'LIGHT_WORKING', category: 'EQUIPMENT', label: 'Light working' },
  { key: 'DOOR_LOCK_WORKING', category: 'EQUIPMENT', label: 'Door lock working' }
];

function evaluationPointsFor(toilet) {
  const female = String(toilet && toilet.gender || '').toUpperCase() === 'FEMALE';
  return EVALUATION_POINTS.filter(p => !(female && p.maleOnly));
}

async function saveIssuePhoto(base64OrBuffer, ctx, { photoType, reference, user, filePrefix }) {
  const buffer = Buffer.isBuffer(base64OrBuffer)
    ? base64OrBuffer
    : Buffer.from(String(base64OrBuffer).replace(/^data:image\/\w+;base64,/, ''), 'base64');
  const watermarked = await applyWatermark(buffer, location.watermarkMeta(ctx, { photoType, reference, user }));
  const safeCode = String((ctx && (ctx.toilet_uid || ctx.code)) || 'FACILITY').replace(/[^A-Za-z0-9-]/g, '');
  const fileName = `H360_${filePrefix}_${safeCode}_${Date.now()}.jpg`;
  return storage.save(`/uploads/evidence/${fileName}`, watermarked.buffer, 'image/jpeg');
}

// New employee complaints go to the plant admins (and the toilet supervisor) to verify and assign
async function notifyComplaintVerifiers(plantId, supervisorId, title, message, meta) {
  const ids = new Set((await slotUtils.getPlantAdminRecipients(plantId)).map(u => u.id));
  if (supervisorId) ids.add(supervisorId);
  for (const id of ids) {
    await slotUtils.notify(id, title, message, 'COMPLAINT_NEW', meta);
  }
}

const toId = v => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// A defect reported on a toilet a housekeeper marked clean today flags that cleaning for review
async function flagCleaningDiscrepancy(toilet, reporterName, reporterEmpId, defectText) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySession = await db.get(`
    SELECT cs.*, u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    JOIN users u ON cs.user_id = u.id
    WHERE cs.toilet_id = ? AND cs.date = ?
    ORDER BY cs.id DESC LIMIT 1
  `, [toilet.id, todayStr]);
  if (!todaySession) return null;

  const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
  const reason = `Discrepancy Detected: Employee ${reporterName} (Emp ID: ${reporterEmpId}) reported '${defectText}' at ${timeStr}, but Housekeeper ${todaySession.agent_name} (${todaySession.agent_emp_id}) had marked this facility clean today in Session ${todaySession.session_code}.`;
  await db.run('UPDATE cleaning_sessions SET is_fake_audit_flagged = 1, fake_flag_reason = ? WHERE id = ?', [reason, todaySession.id]);

  const adminUsers = await db.all(`
    SELECT id FROM users WHERE role IN ('SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN') AND (plant_id = ? OR plant_id IS NULL)
  `, [toilet.plant_id]);
  for (const adm of adminUsers) {
    await slotUtils.notify(adm.id, 'Cleaning Discrepancy Detected',
      `Employee ${reporterName} (${reporterEmpId}) reported "${defectText}" for ${toilet.code} (${toilet.name}). Housekeeper ${todaySession.agent_name} (${todaySession.agent_emp_id}) marked it clean today.`,
      'ALERT', { toilet_id: toilet.id, toilet_code: toilet.code, session_code: todaySession.session_code });
  }

  return { session: todaySession, reason };
}

// Get Issue Categories
router.get('/categories', async (req, res) => {
  const categories = await db.all('SELECT * FROM issue_categories WHERE is_active = 1 ORDER BY name ASC');
  res.json({ success: true, categories });
});

// List Issues with filters
router.get('/', authenticate, async (req, res) => {
  const { status, priority, category } = req.query;
  const toiletId = toId(req.query.toiletId);
  const plantId = toId(req.query.plantId);

  let query = `
    SELECT i.*, t.code as toilet_code, t.name as toilet_name, t.toilet_uid,
           p.name as plant_name, p.code as plant_code,
           a.name as area_name,
           u_sup.name as supervisor_name,
           u_agent.name as agent_name, u_agent.employee_id as agent_emp_id,
           cs.session_code as source_session_code, cs.slot_label as source_slot_label, cs.slot_start as source_slot_start,
           cs.slot_end as source_slot_end, cs.slot_date as source_slot_date, cs.submit_time as source_submit_time
    FROM issues i
    JOIN plants p ON i.plant_id = p.id
    LEFT JOIN toilets t ON i.toilet_id = t.id
    LEFT JOIN areas a ON i.area_id = a.id
    LEFT JOIN users u_sup ON i.supervisor_id = u_sup.id
    LEFT JOIN users u_agent ON i.assigned_agent_id = u_agent.id
    LEFT JOIN cleaning_sessions cs ON i.source_session_id = cs.id
    WHERE 1=1
  `;
  const params = [];

  // Plant filtering
  if (plantId) {
    query += ' AND i.plant_id = ?';
    params.push(plantId);
  } else if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
    query += ' AND i.plant_id = ?';
    params.push(req.user.plant_id);
  }

  // Housekeepers see only issues the admin has assigned to them
  if (isHousekeepingRole(req.user.role)) {
    query += ' AND i.assigned_agent_id = ?';
    params.push(req.user.id);
  }

  if (status) {
    query += ' AND i.status = ?';
    params.push(status);
  }
  if (priority) {
    query += ' AND i.priority = ?';
    params.push(priority);
  }
  if (toiletId) {
    query += ' AND i.toilet_id = ?';
    params.push(toiletId);
  }
  if (category) {
    query += ' AND i.category = ?';
    params.push(category);
  }

  query += " ORDER BY CASE i.status WHEN 'REOPENED' THEN 0 WHEN 'OPEN' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'IN_PROGRESS' THEN 3 WHEN 'RESOLVED' THEN 4 WHEN 'VERIFIED' THEN 5 ELSE 6 END, i.created_at DESC";

  const issues = await db.all(query, params);
  res.json({ success: true, issues });
});

// Employee Complaints & Reports List & KPI Dashboard
router.get('/complaints-report', authenticate, async (req, res) => {
  try {
    const { type, status, fakeOnly, search } = req.query;
    const plantId = toId(req.query.plantId);

    let query = `
      SELECT i.*, 
             t.code as toilet_code, t.name as toilet_name,
             p.name as plant_name, p.code as plant_code,
             a.name as area_name
      FROM issues i
      JOIN plants p ON i.plant_id = p.id
      LEFT JOIN toilets t ON i.toilet_id = t.id
      LEFT JOIN areas a ON i.area_id = a.id
      WHERE 1=1
    `;
    const params = [];

    if (plantId) {
      query += ' AND i.plant_id = ?';
      params.push(plantId);
    } else if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
      query += ' AND i.plant_id = ?';
      params.push(req.user.plant_id);
    }

    if (type && type !== 'ALL') {
      query += ' AND i.complaint_type = ?';
      params.push(type);
    }

    if (status && status !== 'ALL') {
      query += ' AND i.status = ?';
      params.push(status);
    }

    if (fakeOnly === 'true' || fakeOnly === '1') {
      query += ' AND i.is_fake_audit_flagged = 1';
    }

    if (search) {
      query += ' AND (i.ticket_no LIKE ? OR i.reported_by_name LIKE ? OR i.reported_by_emp_id LIKE ? OR i.description LIKE ? OR i.checklist_item_label LIKE ? OR t.code LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }

    query += ' ORDER BY i.is_fake_audit_flagged DESC, i.created_at DESC';

    const complaints = await db.all(query, params);

    // Compute KPI statistics
    let plantFilterSql = '';
    let plantParams = [];
    if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
      plantFilterSql = ' AND plant_id = ?';
      plantParams = [req.user.plant_id];
    }

    const countIssues = async (where) => (await db.get(`SELECT COUNT(*) as c FROM issues WHERE ${where} ${plantFilterSql}`, plantParams))?.c || 0;
    const employeeComplaint = "complaint_type IN ('HOUSEKEEPING', 'DRINKING_WATER') AND reported_by_emp_id IS NOT NULL";
    const stats = {
      total: await countIssues(employeeComplaint),
      housekeeping: await countIssues("complaint_type = 'HOUSEKEEPING'"),
      drinkingWater: await countIssues("complaint_type = 'DRINKING_WATER'"),
      cleaningReview: await countIssues("complaint_type = 'CLEANING_AUDIT'"),
      fakeAuditFlagged: await countIssues('is_fake_audit_flagged = 1'),
      awaitingVerification: await countIssues(`${employeeComplaint} AND status = 'OPEN' AND assigned_agent_id IS NULL`),
      pending: await countIssues(`${employeeComplaint} AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED')`),
      resolved: await countIssues(`${employeeComplaint} AND status IN ('RESOLVED', 'CLOSED', 'VERIFIED')`),
      open: await countIssues("status = 'OPEN'")
    };

    res.json({
      success: true,
      stats,
      complaints
    });
  } catch (err) {
    console.error('Error fetching complaints report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Employee Raise Complaint (Housekeeping or Drinking Water with Anti-Fraud Fake Audit Detection)
router.post('/employee-complaint', upload.single('photo'), async (req, res) => {
  try {
    const {
      toiletId,
      qrToken,
      complaintType = 'HOUSEKEEPING',
      employeeEmail,
      employeePhone,
      employeeDepartment,
      employeeDesignation,
      category,
      checklistItemLabel,
      description
    } = req.body;
    const upper = (v) => String(v || '').trim().toUpperCase();
    const employeeName = upper(req.body.employeeName);
    const employeeId = upper(req.body.employeeId);

    if (!employeeName || !employeeId) {
      return res.status(400).json({ success: false, error: 'Employee Name and Employee ID are required.' });
    }
    if (!req.file && !req.body.imageBase64) {
      return res.status(400).json({ success: false, error: 'A live photo of the problem is required.' });
    }

    // Lookup toilet / facility
    let toilet = null;
    if (toId(toiletId)) {
      toilet = await db.get(`
        SELECT t.*, p.name as plant_name 
        FROM toilets t 
        JOIN plants p ON t.plant_id = p.id 
        WHERE t.id = ?
      `, [toId(toiletId)]);
    } else if (qrToken) {
      toilet = await db.get(`
        SELECT t.*, p.name as plant_name 
        FROM toilets t 
        JOIN plants p ON t.plant_id = p.id 
        WHERE t.qr_token = ?
      `, [qrToken]);
    }

    if (!toilet) {
      return res.status(400).json({ success: false, error: 'Facility or toilet could not be determined.' });
    }

    const supervisorId = await location.resolveSupervisorId(await location.getToiletContext(toilet.id));

    // Check today's housekeeping cleaning session for ANTI-FRAUD detection
    let isFakeAuditFlagged = 0;
    let flaggedAgentName = null;
    let flaggedAgentEmpId = null;
    let flaggedSessionCode = null;
    let flaggedReason = null;
    let assignedAgentId = null;

    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySession = await db.get(`
      SELECT cs.*, u.name as agent_name, u.employee_id as agent_emp_id
      FROM cleaning_sessions cs
      JOIN users u ON cs.user_id = u.id
      WHERE cs.toilet_id = ? AND cs.date = ?
      ORDER BY cs.id DESC LIMIT 1
    `, [toilet.id, todayStr]);

    // Only a cleaning complaint contradicts today's cleaning entry; consumables / equipment faults are not the housekeeper's cleaning
    if (complaintType === 'HOUSEKEEPING' && todaySession && !['Consumables', 'Equipment'].includes(category)) {
      // If a housekeeping session was submitted or completed today, any defect reported by employee triggers the FAKE AUDIT DISCREPANCY flag!
      isFakeAuditFlagged = 1;
      flaggedAgentName = todaySession.agent_name;
      flaggedAgentEmpId = todaySession.agent_emp_id;
      flaggedSessionCode = todaySession.session_code;

      const timeStr = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' });
      flaggedReason = `Discrepancy Detected: Employee ${employeeName} (Emp ID: ${employeeId}) reported dirty '${checklistItemLabel || category}' at ${timeStr}, but Housekeeper ${todaySession.agent_name} (${todaySession.agent_emp_id}) had marked this facility clean today in Session ${todaySession.session_code}.`;

      // Flag the cleaning session in the database
      await db.run(`
        UPDATE cleaning_sessions 
        SET is_fake_audit_flagged = 1, fake_flag_reason = ? 
        WHERE id = ?
      `, [flaggedReason, todaySession.id]);

      // TRIGGER IN-APP NOTIFICATIONS FOR ALL ADMINS
      const adminUsers = await db.all(`
        SELECT id FROM users 
        WHERE role IN ('SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN') 
          AND (plant_id = ? OR plant_id IS NULL)
      `, [toilet.plant_id]);

      const notifTitle = '🚨 FAKE CLEANING AUDIT DETECTED';
      const notifMsg = `Audit Discrepancy: Employee ${employeeName} (${employeeId}) reported dirty "${checklistItemLabel || category}" for ${toilet.code} (${toilet.name})! Housekeeper ${todaySession.agent_name} (${todaySession.agent_emp_id}) marked it clean today.`;

      for (const adm of adminUsers) {
        await db.run(`
          INSERT INTO notifications (user_id, title, message, type, metadata_json)
          VALUES (?, ?, ?, 'ALERT', ?)
        `, [
          adm.id,
          notifTitle,
          notifMsg,
          JSON.stringify({
            toilet_id: toilet.id,
            toilet_code: toilet.code,
            checklistItemLabel,
            housekeeper_name: todaySession.agent_name,
            housekeeper_emp_id: todaySession.agent_emp_id,
            session_code: todaySession.session_code,
            reported_by_name: employeeName,
            reported_by_emp_id: employeeId
          })
        ]);
      }
    }

    // Process photo if provided
    let photoPath = null;
    if (req.file || req.body.imageBase64) {
      photoPath = await saveIssuePhoto(req.file ? req.file.buffer : req.body.imageBase64, await location.getToiletContext(toilet.id), {
        photoType: complaintType === 'DRINKING_WATER' ? 'DRINKING WATER DEFECT' : 'HOUSEKEEPING DEFECT',
        reference: 'REPORT',
        user: { name: employeeName, employee_id: employeeId },
        filePrefix: complaintType
      });
    }

    const ticketNo = await location.nextTicketNo('H360-TKT');

    const insertRes = await db.run(`
      INSERT INTO issues (
        ticket_no, plant_id, toilet_id, area_id, category, description,
        supervisor_id, assigned_agent_id, evidence_photo_path, priority, status,
        complaint_type, reported_by_name, reported_by_emp_id, reported_by_email, reported_by_phone,
        reported_by_department, reported_by_designation,
        checklist_item_label, is_fake_audit_flagged, flagged_agent_name, flagged_agent_emp_id,
        flagged_session_code, flagged_reason, target_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticketNo,
      toilet.plant_id,
      toilet.id,
      toilet.area_id,
      category || (complaintType === 'DRINKING_WATER' ? 'Drinking Water Issue' : 'Housekeeping Issue'),
      description || `Employee reported defect on ${checklistItemLabel || category}`,
      supervisorId,
      assignedAgentId,
      photoPath,
      isFakeAuditFlagged ? 'CRITICAL' : 'HIGH',
      complaintType,
      employeeName,
      employeeId,
      employeeEmail || null,
      employeePhone || null,
      upper(employeeDepartment) || null,
      upper(employeeDesignation) || null,
      checklistItemLabel || category,
      isFakeAuditFlagged,
      flaggedAgentName,
      flaggedAgentEmpId,
      flaggedSessionCode,
      flaggedReason,
      await location.targetFromNow()
    ]);

    const issueId = insertRes.lastInsertRowid;

    // Track in issue updates
    await db.run(`
      INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path)
      VALUES (?, ?, NULL, 'OPEN', ?, ?)
    `, [issueId, supervisorId, `Complaint submitted by Employee ${employeeName} (${employeeId})${isFakeAuditFlagged ? ' - 🚨 FAKE AUDIT FLAGGED' : ''}`, photoPath]);

    try {
      await notifyComplaintVerifiers(toilet.plant_id, supervisorId, `New Complaint: ${checklistItemLabel || category}`,
        `${ticketNo} at ${toilet.code} (${toilet.name}) reported by ${employeeName} (${employeeId}). Verify it and assign a housekeeper.`, {
          issue_id: Number(issueId),
          ticket_no: ticketNo,
          toilet_id: toilet.id,
          toilet_code: toilet.code,
          toilet_name: toilet.name,
          plant_id: toilet.plant_id,
          category: checklistItemLabel || category,
          reported_by_name: employeeName,
          reported_by_emp_id: employeeId,
          complaint_type: complaintType,
          created_at: new Date().toISOString()
        });
    } catch (notifErr) {
      console.warn('Could not notify complaint verifiers:', notifErr);
    }

    res.json({
      success: true,
      ticketNo,
      issueId,
      isFakeAuditFlagged: Boolean(isFakeAuditFlagged),
      flaggedReason,
      message: `Complaint registered with Ticket #${ticketNo} and sent to the admin for verification.${isFakeAuditFlagged ? ' Discrepancy detected: today\'s cleaning entry is flagged for review.' : ''}`
    });
  } catch (err) {
    console.error('Employee complaint error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Evaluation points for a toilet (Cleanliness, Consumables, Equipment)
router.get('/evaluation-points', authenticate, async (req, res) => {
  const toilet = toId(req.query.toiletId) ? await db.get('SELECT id, gender FROM toilets WHERE id = ?', [toId(req.query.toiletId)]) : null;
  res.json({ success: true, points: evaluationPointsFor(toilet) });
});

// Employee evaluation after scanning the toilet QR: any NOT OK needs a live photo and raises an issue
router.post('/employee-evaluation', authenticate, async (req, res) => {
  try {
    const { toiletId, responses = [], remarks = '', imageBase64 } = req.body;
    const ctx = toId(toiletId) ? await location.getToiletContext(toId(toiletId)) : null;
    if (!ctx) return res.status(400).json({ success: false, error: 'Toilet not found. Please scan the toilet QR again.' });

    const points = evaluationPointsFor(ctx);
    const byKey = new Map((Array.isArray(responses) ? responses : []).map(r => [r.key, r]));
    const missing = points.filter(p => !['OK', 'NOT_OK'].includes(byKey.get(p.key)?.status));
    if (missing.length) {
      return res.status(400).json({ success: false, error: `Please mark OK or NOT OK for all points (${missing.length} remaining).` });
    }

    const notOk = points.filter(p => byKey.get(p.key).status === 'NOT_OK');
    if (notOk.length && !imageBase64) {
      return res.status(400).json({ success: false, error: 'A live photo of the abnormal condition is required when any point is NOT OK.' });
    }

    const reporterName = req.user.name;
    const reporterEmpId = req.user.employee_id || '';
    let photoPath = null;
    if (imageBase64) {
      photoPath = await saveIssuePhoto(imageBase64, ctx, {
        photoType: 'EMPLOYEE EVALUATION',
        reference: 'EVALUATION',
        user: req.user,
        filePrefix: 'EVAL'
      });
    }

    const storedResponses = points.map(p => ({
      key: p.key, category: p.category, label: p.label, status: byKey.get(p.key).status,
      note: byKey.get(p.key).note ? String(byKey.get(p.key).note).slice(0, 300) : null
    }));
    const evalRes = await db.run(`
      INSERT INTO employee_evaluations (toilet_id, plant_id, user_id, evaluator_name, evaluator_emp_id, responses_json,
                                        total_points, not_ok_count, remarks, photo_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [ctx.id, ctx.plant_id, req.user.id, reporterName, reporterEmpId, JSON.stringify(storedResponses),
        points.length, notOk.length, String(remarks || '').slice(0, 1000), photoPath]);
    const evaluationId = Number(evalRes.lastInsertRowid);

    await auditLogFromReq(req, 'EMPLOYEE_EVALUATION_SUBMITTED', 'TOILET', ctx.toilet_uid || ctx.code, {
      evaluation_id: evaluationId, not_ok: notOk.map(p => p.label)
    });

    if (!notOk.length) {
      return res.json({ success: true, evaluationId, greenStatus: true, message: 'Thank you. All points are OK.' });
    }

    const labels = notOk.map(p => p.label);
    const description = storedResponses
      .filter(r => r.status === 'NOT_OK')
      .map(r => `${r.label}${r.note ? `: ${r.note}` : ''}`)
      .join('; ') + (remarks ? ` | Remarks: ${remarks}` : '');

    const discrepancy = await flagCleaningDiscrepancy(ctx, reporterName, reporterEmpId, labels.join(', '));
    const supervisorId = await location.resolveSupervisorId(ctx);
    // Complaints wait for the admin to verify and assign a housekeeper
    const responsibleId = null;
    const targetAt = await location.targetFromNow();
    const ticketNo = await location.nextTicketNo('H360-TKT');

    const issueRes = await db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id,
                          evidence_photo_path, priority, status, complaint_type, reported_by_name, reported_by_emp_id,
                          reported_by_email, reported_by_phone, checklist_item_label, is_fake_audit_flagged, flagged_agent_name,
                          flagged_agent_emp_id, flagged_session_code, flagged_reason, target_at, evaluation_id)
      VALUES (?, ?, ?, ?, 'Employee Evaluation', ?, ?, ?, ?, ?, ?, 'HOUSEKEEPING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticketNo, ctx.plant_id, ctx.id, ctx.area_id, description, supervisorId, responsibleId, photoPath,
      discrepancy ? 'CRITICAL' : 'HIGH', responsibleId ? 'ASSIGNED' : 'OPEN',
      reporterName, reporterEmpId, req.user.email || null, req.user.phone || null, labels.join(', '),
      discrepancy ? 1 : 0,
      discrepancy ? discrepancy.session.agent_name : null,
      discrepancy ? discrepancy.session.agent_emp_id : null,
      discrepancy ? discrepancy.session.session_code : null,
      discrepancy ? discrepancy.reason : null,
      targetAt, evaluationId
    ]);
    const issueId = Number(issueRes.lastInsertRowid);
    await db.run('UPDATE employee_evaluations SET issue_id = ? WHERE id = ?', [issueId, evaluationId]);
    await db.run(`
      INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path)
      VALUES (?, ?, NULL, ?, ?, ?)
    `, [issueId, req.user.id, responsibleId ? 'ASSIGNED' : 'OPEN', `Employee evaluation by ${reporterName} (${reporterEmpId}): NOT OK - ${labels.join(', ')}`, photoPath]);

    const meta = {
      issue_id: issueId, ticket_no: ticketNo, toilet_id: ctx.id, toilet_code: ctx.code, toilet_name: ctx.name,
      plant_id: ctx.plant_id, category: labels.join(', '), defect: labels.join(', '), reported_by_name: reporterName,
      reported_by_emp_id: reporterEmpId, complaint_type: 'HOUSEKEEPING', target_at: targetAt, created_at: new Date().toISOString()
    };
    await notifyComplaintVerifiers(ctx.plant_id, supervisorId, `New Complaint: ${labels.join(', ')}`,
      `${ticketNo} at ${ctx.toilet_uid || ctx.code} reported by ${reporterName}. Verify it and assign a housekeeper.`, meta);

    res.json({
      success: true,
      evaluationId,
      greenStatus: false,
      issueId,
      ticketNo,
      targetAt,
      responsibleName: null,
      isFakeAuditFlagged: !!discrepancy,
      message: `Complaint ${ticketNo} registered and sent to the admin for verification.`
    });
  } catch (err) {
    console.error('Employee evaluation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Recent employee evaluations (admins, management, supervisors)
router.get('/evaluations', authenticate, requireRole('SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT', 'SUPERVISOR'), async (req, res) => {
  const params = [];
  let where = '1=1';
  if (toId(req.query.toiletId)) {
    where += ' AND ev.toilet_id = ?';
    params.push(toId(req.query.toiletId));
  }
  if (req.user.plant_id && !['SUPER_ADMIN', 'IT_ADMIN', 'MANAGEMENT'].includes(req.user.role)) {
    where += ' AND ev.plant_id = ?';
    params.push(req.user.plant_id);
  }
  const list = await db.all(`
    SELECT ev.*, t.code as toilet_code, t.name as toilet_name, t.toilet_uid, p.name as plant_name, i.ticket_no, i.status as issue_status
    FROM employee_evaluations ev
    JOIN toilets t ON ev.toilet_id = t.id
    JOIN plants p ON ev.plant_id = p.id
    LEFT JOIN issues i ON ev.issue_id = i.id
    WHERE ${where}
    ORDER BY ev.created_at DESC
    LIMIT 200
  `, params);
  res.json({ success: true, evaluations: list });
});

// Change responsible person and target time of an issue
// Housekeeping staff an issue can be assigned to
router.get('/responsible-people', authenticate, requireRole(...VERIFIER_ROLES), async (req, res) => {
  const plantId = toId(req.query.plantId) || req.user.plant_id;
  const people = await db.all(`
    SELECT id, name, employee_id, role FROM users
    WHERE is_active = 1 AND role IN ('HOUSEKEEPING_AGENT', 'HOUSEKEEPING') ${plantId ? 'AND plant_id = ?' : ''}
    ORDER BY name
  `, plantId ? [plantId] : []);
  res.json({ success: true, people });
});

router.patch('/:id/assign', authenticate, requireRole(...VERIFIER_ROLES), async (req, res) => {
  const issue = toId(req.params.id) ? await db.get('SELECT * FROM issues WHERE id = ?', [toId(req.params.id)]) : null;
  if (!issue) return res.status(404).json({ success: false, error: 'Issue not found' });
  if (!ACTIVE_STATUSES.includes(issue.status)) {
    return res.status(400).json({ success: false, error: 'Only open issues can be reassigned.' });
  }

  const { assignedAgentId, targetAt } = req.body;
  let agent = null;
  if (assignedAgentId) {
    agent = toId(assignedAgentId) ? await db.get('SELECT id, name, employee_id, role FROM users WHERE id = ? AND is_active = 1', [toId(assignedAgentId)]) : null;
    if (!agent) return res.status(400).json({ success: false, error: 'Responsible person not found or inactive' });
  }
  let target = issue.target_at;
  if (targetAt) {
    const d = new Date(targetAt);
    if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid target time' });
    target = d.toISOString().replace('T', ' ').slice(0, 19);
  } else if (agent && issue.status === 'OPEN') {
    // Target time starts when the admin pushes the complaint to the housekeeper
    target = await location.targetFromNow();
  }

  const newStatus = agent && issue.status === 'OPEN' ? 'ASSIGNED' : issue.status;
  await db.run('UPDATE issues SET assigned_agent_id = ?, target_at = ?, status = ? WHERE id = ?',
    [agent ? agent.id : issue.assigned_agent_id, target, newStatus, issue.id]);
  const remark = `${agent ? `Responsible: ${agent.name} (${agent.employee_id})` : 'Responsible unchanged'}; Target: ${target || 'not set'}`;
  await db.run('INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks) VALUES (?, ?, ?, ?, ?)',
    [issue.id, req.user.id, issue.status, newStatus, remark]);

  if (agent) {
    await slotUtils.notify(agent.id, 'Issue Assigned to You', `${issue.ticket_no}: ${issue.checklist_item_label || issue.category}. Open My Issues, fix it and upload a live photo before the target time.`,
      'ISSUE_ASSIGNED', { issue_id: issue.id, ticket_no: issue.ticket_no, target_at: target });
  }
  await auditLogFromReq(req, 'ISSUE_ASSIGNED', 'ISSUE', issue.ticket_no, { assigned_agent_id: agent ? agent.id : null, target_at: target });
  res.json({ success: true, message: `${issue.ticket_no} updated.`, status: newStatus, targetAt: target });
});

// Create Issue (Supervisor / Admin)
router.post('/', authenticate, requireRole('SUPERVISOR', 'SUPER_ADMIN', 'PLANT_ADMIN'), upload.single('photo'), async (req, res) => {
  try {
    const { category, description, priority = 'HIGH' } = req.body;
    const toiletId = toId(req.body.toiletId);
    const areaId = toId(req.body.areaId);
    const assignedAgentId = toId(req.body.assignedAgentId);

    if (!category || !description) {
      return res.status(400).json({ success: false, error: 'Category and description are required' });
    }

    let toilet = null;
    let plantId = req.user.plant_id;

    if (toiletId) {
      toilet = await db.get(`
        SELECT t.*, p.name as plant_name 
        FROM toilets t 
        JOIN plants p ON t.plant_id = p.id 
        WHERE t.id = ?
      `, [toiletId]);
      if (toilet) {
        plantId = toilet.plant_id;
      }
    }

    if (!plantId) {
      return res.status(400).json({ success: false, error: 'Valid plant is required' });
    }

    // Auto-assign to responsible agent if not provided
    let agentId = assignedAgentId || (toilet && toilet.assigned_user_id) || null;
    if (!agentId && toiletId) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const assignment = await db.get(`
        SELECT user_id FROM assignments 
        WHERE toilet_id = ? AND assigned_date = ? 
        LIMIT 1
      `, [toiletId, todayStr]);
      if (assignment) {
        agentId = assignment.user_id;
      } else {
        // Fallback to any active agent in this plant
        const fallbackAgent = await db.get(`
          SELECT id FROM users 
          WHERE role = 'HOUSEKEEPING_AGENT' AND plant_id = ? AND is_active = 1 
          LIMIT 1
        `, [plantId]);
        if (fallbackAgent) agentId = fallbackAgent.id;
      }
    }

    // Process photo if provided
    let photoPath = null;
    if (req.file || req.body.imageBase64) {
      photoPath = await saveIssuePhoto(req.file ? req.file.buffer : req.body.imageBase64, toilet ? await location.getToiletContext(toilet.id) : null, {
        photoType: 'ISSUE EVIDENCE',
        reference: 'ISSUE',
        user: req.user,
        filePrefix: 'ISSUE'
      });
    }

    const ticketNo = await location.nextTicketNo('H360-ISS');
    const targetAt = req.body.targetAt && !isNaN(new Date(req.body.targetAt).getTime())
      ? new Date(req.body.targetAt).toISOString().replace('T', ' ').slice(0, 19)
      : await location.targetFromNow();

    const insertRes = await db.run(`
      INSERT INTO issues (ticket_no, plant_id, toilet_id, area_id, category, description, supervisor_id, assigned_agent_id, evidence_photo_path, priority, status, target_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [ticketNo, plantId, toiletId || null, areaId || (toilet ? toilet.area_id : null), category, description, req.user.id, agentId || null, photoPath, priority, agentId ? 'ASSIGNED' : 'OPEN', targetAt]);

    const issueId = insertRes.lastInsertRowid;

    // Track in issue updates
    await db.run(`
      INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path)
      VALUES (?, ?, NULL, 'OPEN', 'Issue reported and ticket created', ?)
    `, [issueId, req.user.id, photoPath]);

    // AUTOMATIC NOTIFICATION: Dispatch notification to assigned agent
    if (agentId) {
      const toiletRef = toilet ? toilet.code : 'facility';
      const notificationMsg = `New housekeeping issue reported for ${toiletRef} (${category}). Please take corrective action.`;

      await db.run(`
        INSERT INTO notifications (user_id, title, message, type, metadata_json)
        VALUES (?, 'New Housekeeping Issue Assigned', ?, 'ISSUE_ASSIGNED', ?)
      `, [
        agentId,
        notificationMsg,
        JSON.stringify({ issue_id: issueId, ticket_no: ticketNo, toilet_code: toilet ? toilet.code : null, category, priority })
      ]);
    }

    await auditLogFromReq(req, 'ISSUE_CREATED', 'ISSUE', ticketNo, {
      issue_id: issueId,
      category,
      priority,
      toilet: toilet ? toilet.code : null,
      assigned_agent: agentId
    });

    res.json({
      success: true,
      message: `Issue ticket ${ticketNo} created successfully. Responsible agent notified.`,
      ticketNo,
      issueId
    });
  } catch (err) {
    console.error('Issue creation error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Issue Status (Status Lifecycle: OPEN -> ASSIGNED -> IN PROGRESS -> RESOLVED -> VERIFIED -> CLOSED)
router.patch('/:id/status', authenticate, upload.single('photo'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const { status, remarks = '' } = req.body;

    const issue = toId(issueId) ? await db.get(`
      SELECT i.*, t.code as toilet_code, t.supervisor_id as toilet_supervisor_id, p.name as plant_name
      FROM issues i 
      LEFT JOIN toilets t ON i.toilet_id = t.id 
      JOIN plants p ON i.plant_id = p.id
      WHERE i.id = ?
    `, [toId(issueId)]) : null;

    if (!issue) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }

    const fromStatus = issue.status;
    let toStatus = String(status || '').toUpperCase();

    // Verify role permissions for transition: Employees can NEVER update or resolve complaints
    if (req.user.role === 'EMPLOYEE') {
      return res.status(403).json({ success: false, error: 'Employees cannot update or resolve complaints.' });
    }

    const isVerifier = VERIFIER_ROLES.includes(req.user.role) || issue.toilet_supervisor_id === req.user.id;
    // Sending an issue that is waiting for verification back to work is a reopen
    if (toStatus === 'IN_PROGRESS' && fromStatus === 'RESOLVED') toStatus = 'REOPENED';

    const hasPhoto = req.file || req.body.imageBase64 || req.body.resolutionPhoto;
    if (toStatus === 'IN_PROGRESS') {
      if (!ACTIVE_STATUSES.includes(fromStatus)) {
        return res.status(400).json({ success: false, error: `Issue is ${fromStatus}; work cannot be started.` });
      }
    } else if (toStatus === 'RESOLVED') {
      if (!ACTIVE_STATUSES.includes(fromStatus)) {
        return res.status(400).json({ success: false, error: `Issue is ${fromStatus}; action cannot be recorded now.` });
      }
      if (!hasPhoto) {
        return res.status(400).json({ success: false, error: 'An after photo is mandatory to record the action taken.' });
      }
    } else if (['VERIFIED', 'CLOSED'].includes(toStatus)) {
      if (!isVerifier) {
        return res.status(403).json({ success: false, error: 'Only the supervisor or an administrator can verify and close issues.' });
      }
      if (fromStatus !== 'RESOLVED') {
        return res.status(400).json({ success: false, error: 'The responsible person must record the action taken with a photo before the issue can be verified and closed.' });
      }
      toStatus = 'CLOSED';
    } else if (toStatus === 'REOPENED') {
      if (!isVerifier) {
        return res.status(403).json({ success: false, error: 'Only the supervisor or an administrator can reopen issues.' });
      }
      if (!['RESOLVED', 'CLOSED', 'VERIFIED'].includes(fromStatus)) {
        return res.status(400).json({ success: false, error: 'Only issues with action taken or closed issues can be reopened.' });
      }
      if (!String(remarks).trim()) {
        return res.status(400).json({ success: false, error: 'Please write why the action is not acceptable.' });
      }
    } else if (['OPEN', 'ASSIGNED'].includes(toStatus)) {
      if (!isVerifier) {
        return res.status(403).json({ success: false, error: 'Only the supervisor or an administrator can change this status.' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    let photoPath = null;
    if (req.file || req.body.imageBase64 || (req.body.resolutionPhoto && req.body.resolutionPhoto.startsWith('data:image'))) {
      const rawBase64 = req.body.imageBase64 || (req.body.resolutionPhoto && req.body.resolutionPhoto.startsWith('data:image') ? req.body.resolutionPhoto : null);
      photoPath = await saveIssuePhoto(req.file ? req.file.buffer : rawBase64, await location.getToiletContext(issue.toilet_id), {
        photoType: toStatus === 'RESOLVED' ? 'ACTION TAKEN - AFTER' : `${toStatus} EVIDENCE`,
        reference: issue.ticket_no,
        user: req.user,
        filePrefix: `${issue.ticket_no}_${toStatus}`
      });
    } else if (req.body.resolutionPhoto && req.body.resolutionPhoto.startsWith('/uploads/')) {
      photoPath = req.body.resolutionPhoto;
    }

    let updateSql = 'UPDATE issues SET status = ?';
    const updateParams = [toStatus];

    if (toStatus === 'RESOLVED') {
      updateSql += ', resolved_at = CURRENT_TIMESTAMP, resolution_remarks = ?';
      updateParams.push(remarks);
      if (photoPath) {
        updateSql += ', resolution_photo_path = ?';
        updateParams.push(photoPath);
      }
    } else if (toStatus === 'CLOSED') {
      updateSql += ', verified_at = CURRENT_TIMESTAMP, verification_remarks = ?';
      updateParams.push(remarks);
    } else if (toStatus === 'REOPENED') {
      // Rejected action: the after photo stays in the history, a fresh one is needed before the new target time
      updateSql += ', verification_remarks = ?, resolution_photo_path = NULL, resolved_at = NULL, verified_at = NULL, reopened_count = COALESCE(reopened_count, 0) + 1, target_at = ?';
      updateParams.push(remarks, await location.targetFromNow());
    }

    updateSql += ' WHERE id = ?';
    updateParams.push(issue.id);

    await db.run(updateSql, updateParams);

    // Record in history log
    await db.run(`
      INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [issue.id, req.user.id, fromStatus, toStatus, remarks, photoPath]);

    // Notifications on state change
    if (toStatus === 'RESOLVED') {
      const verifiers = new Set([issue.toilet_supervisor_id, issue.supervisor_id].filter(Boolean));
      for (const uid of verifiers) {
        await slotUtils.notify(uid, 'Action Taken - Verification Pending',
          `${issue.ticket_no} at ${issue.toilet_code || 'facility'}: action taken by ${req.user.name} with an after photo. Please verify and close.`,
          'ISSUE_RESOLVED', { issue_id: Number(issueId), ticket_no: issue.ticket_no });
      }
    } else if (toStatus === 'REOPENED' && issue.assigned_agent_id) {
      await slotUtils.notify(issue.assigned_agent_id, issue.complaint_type === 'CLEANING_AUDIT' ? 'Issue Rolled Back — Resubmit' : 'Issue Reopened',
        `${issue.ticket_no} at ${issue.toilet_code || 'facility'} was ${issue.complaint_type === 'CLEANING_AUDIT' ? 'rolled back' : 'reopened'} by ${req.user.name}: ${remarks}. Clean again and resubmit with a new live photo.`,
        'ISSUE_ASSIGNED', { issue_id: Number(issueId), ticket_no: issue.ticket_no });
    } else if (toStatus === 'CLOSED' && issue.assigned_agent_id) {
      // Notify agent of successful closure
      await db.run(`
        INSERT INTO notifications (user_id, title, message, type, metadata_json)
        VALUES (?, 'Issue Closed & Verified', ?, 'INFO', ?)
      `, [
        issue.assigned_agent_id,
        `Issue ${issue.ticket_no} for ${issue.toilet_code || 'facility'} has been verified and closed by ${req.user.name}.`,
        JSON.stringify({ issue_id: issueId, ticket_no: issue.ticket_no })
      ]);
    }

    await auditLogFromReq(req, 'ISSUE_STATUS_UPDATED', 'ISSUE', issue.ticket_no, {
      from_status: fromStatus,
      to_status: toStatus,
      remarks
    });

    res.json({
      success: true,
      message: `Issue ${issue.ticket_no} updated to ${toStatus}.`,
      status: toStatus
    });
  } catch (err) {
    console.error('Issue status update error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single Issue Detail with History
router.get('/:id', authenticate, async (req, res) => {
  const issueId = toId(req.params.id);
  const issue = issueId && await db.get(`
    SELECT i.*, t.code as toilet_code, t.name as toilet_name, t.toilet_uid, t.supervisor_id as toilet_supervisor_id,
           t.gender as toilet_gender, t.area_id as toilet_area_id,
           p.name as plant_name, p.code as plant_code,
           a.name as area_name, f.name as floor_name, bl.name as block_name, b.name as building_name,
           u_sup.name as supervisor_name,
           u_tsup.name as toilet_supervisor_name,
           u_agent.name as agent_name, u_agent.employee_id as agent_emp_id,
           src.session_code as source_session_code, src.slot_label as source_slot_label, src.slot_start as source_slot_start,
           src.slot_end as source_slot_end, src.slot_date as source_slot_date, src.start_time as source_start_time,
           src.submit_time as source_submit_time, src.approval_status as source_approval_status
    FROM issues i
    LEFT JOIN cleaning_sessions src ON i.source_session_id = src.id
    JOIN plants p ON i.plant_id = p.id
    LEFT JOIN toilets t ON i.toilet_id = t.id
    LEFT JOIN areas a ON i.area_id = a.id
    LEFT JOIN floors f ON a.floor_id = f.id
    LEFT JOIN blocks bl ON f.block_id = bl.id
    LEFT JOIN buildings b ON f.building_id = b.id
    LEFT JOIN users u_sup ON i.supervisor_id = u_sup.id
    LEFT JOIN users u_tsup ON t.supervisor_id = u_tsup.id
    LEFT JOIN users u_agent ON i.assigned_agent_id = u_agent.id
    WHERE i.id = ?
  `, [issueId]);

  if (!issue) {
    return res.status(404).json({ success: false, error: 'Issue not found' });
  }
  issue.can_verify = VERIFIER_ROLES.includes(req.user.role) || issue.toilet_supervisor_id === req.user.id;

  const updates = await db.all(`
    SELECT iu.*, u.name as user_name, u.role as user_role
    FROM issue_updates iu
    JOIN users u ON iu.user_id = u.id
    WHERE iu.issue_id = ?
    ORDER BY iu.created_at ASC
  `, [issueId]);

  res.json({ success: true, issue, updates });
});

module.exports = router;
