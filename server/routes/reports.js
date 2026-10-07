const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { calculatePlantCompliance, calculateComplianceForDates } = require('../utils/complianceEngine');

function numericId(value) {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function countsByDay(sql, params) {
  const rows = await db.all(sql, params);
  return new Map(rows.map(r => [r.d, Number(r.n) || 0]));
}

// 1. Day-Wise Achievement Matrix
router.get('/day-wise', authenticate, async (req, res) => {
  const { startDate, endDate } = req.query;
  const plantId = numericId(req.query.plantId);

  const start = startDate ? new Date(startDate) : new Date(Date.now() - 13 * 86400000);
  const end = endDate ? new Date(endDate) : new Date();

  const days = [];
  const curr = new Date(start);
  while (curr <= end) {
    days.push({
      dStr: curr.toISOString().slice(0, 10),
      displayDate: curr.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    });
    curr.setDate(curr.getDate() + 1);
  }

  const results = [];
  if (days.length) {
    const keys = days.map(d => d.dStr).sort();
    const fromDate = keys[0];
    const toDate = keys[keys.length - 1];

    const compByDay = await calculateComplianceForDates(plantId, fromDate, toDate);

    let issSql = 'SELECT date(created_at) as d, COUNT(*) as n FROM issues WHERE date(created_at) >= ? AND date(created_at) <= ?';
    const issParams = [fromDate, toDate];
    if (plantId) { issSql += ' AND plant_id = ?'; issParams.push(plantId); }
    issSql += ' GROUP BY date(created_at)';

    let resSql = 'SELECT date(resolved_at) as d, COUNT(*) as n FROM issues WHERE date(resolved_at) >= ? AND date(resolved_at) <= ?';
    const resParams = [fromDate, toDate];
    if (plantId) { resSql += ' AND plant_id = ?'; resParams.push(plantId); }
    resSql += ' GROUP BY date(resolved_at)';

    let inspSql = `
      SELECT date(si.inspected_at) as d, COUNT(*) as n
      FROM supervisor_inspections si
      JOIN toilets t ON si.toilet_id = t.id
      WHERE date(si.inspected_at) >= ? AND date(si.inspected_at) <= ?
    `;
    const inspParams = [fromDate, toDate];
    if (plantId) { inspSql += ' AND t.plant_id = ?'; inspParams.push(plantId); }
    inspSql += ' GROUP BY date(si.inspected_at)';

    const [issuesByDay, resolvedByDay, inspByDay] = await Promise.all([
      countsByDay(issSql, issParams),
      countsByDay(resSql, resParams),
      countsByDay(inspSql, inspParams)
    ]);

    for (const { dStr, displayDate } of days) {
      const comp = compByDay.get(dStr) || { expected: 0, completed: 0, pending: 0, compliancePercentage: 100 };
      results.push({
        date: dStr,
        displayDate,
        expected: comp.expected,
        completed: comp.completed,
        pending: comp.pending,
        missed: comp.pending,
        compliancePercentage: comp.compliancePercentage,
        issues: issuesByDay.get(dStr) || 0,
        resolved: resolvedByDay.get(dStr) || 0,
        inspections: inspByDay.get(dStr) || 0
      });
    }
  }

  // Reverse so newest date is first
  results.reverse();

  res.json({ success: true, achievements: results });
});

// 2. Comprehensive Filterable Reports
router.get('/data', authenticate, async (req, res) => {
  const { reportType = 'daily_cleaning', date, month, status } = req.query;
  const plantId = numericId(req.query.plantId);
  const toiletId = numericId(req.query.toiletId);
  const agentId = numericId(req.query.agentId);
  const supervisorId = numericId(req.query.supervisorId);

  let records = [];

  switch (reportType) {
    case 'daily_cleaning': {
      let query = `
        SELECT cs.session_code, cs.date, cs.start_time, cs.submit_time, cs.checklist_score, cs.status, cs.remarks,
               cs.total_items, cs.passed_items, cs.failed_items,
               t.code as toilet_code, t.name as toilet_name, p.name as plant_name,
               u.name as agent_name, u.employee_id as agent_emp_id
        FROM cleaning_sessions cs
        JOIN toilets t ON cs.toilet_id = t.id
        JOIN plants p ON t.plant_id = p.id
        LEFT JOIN users u ON cs.user_id = u.id
        WHERE 1=1
      `;
      const params = [];
      if (date) { query += ' AND cs.date = ?'; params.push(date); }
      if (plantId) { query += ' AND t.plant_id = ?'; params.push(plantId); }
      if (toiletId) { query += ' AND cs.toilet_id = ?'; params.push(toiletId); }
      if (agentId) { query += ' AND cs.user_id = ?'; params.push(agentId); }
      if (status) { query += ' AND cs.status = ?'; params.push(status); }

      query += ' ORDER BY cs.date DESC, cs.submit_time DESC';
      records = await db.all(query, params);
      break;
    }

    case 'toilet_performance': {
      let query = `
        SELECT t.id, t.code as toilet_code, t.name as toilet_name, p.name as plant_name, a.name as area_name,
               COUNT(cs.id) as sessions_completed,
               ROUND(AVG(cs.checklist_score), 1) as avg_score,
               (SELECT COUNT(*) FROM issues i WHERE i.toilet_id = t.id) as total_issues_raised
        FROM toilets t
        JOIN plants p ON t.plant_id = p.id
        JOIN areas a ON t.area_id = a.id
        LEFT JOIN cleaning_sessions cs ON t.id = cs.toilet_id AND cs.status = 'COMPLETED'
        WHERE t.is_active = 1
      `;
      const params = [];
      if (plantId) { query += ' AND t.plant_id = ?'; params.push(plantId); }
      query += ' GROUP BY t.id, p.name, a.name ORDER BY avg_score DESC NULLS LAST, t.code ASC';
      records = await db.all(query, params);
      break;
    }

    case 'agent_performance': {
      let query = `
        SELECT u.id, u.name as agent_name, u.employee_id, p.name as plant_name,
               COUNT(cs.id) as sessions_completed,
               ROUND(AVG(cs.checklist_score), 1) as avg_checklist_score,
               (SELECT COUNT(*) FROM issues i WHERE i.assigned_agent_id = u.id AND i.status IN ('RESOLVED', 'CLOSED')) as issues_resolved
        FROM users u
        LEFT JOIN plants p ON u.plant_id = p.id
        LEFT JOIN cleaning_sessions cs ON u.id = cs.user_id AND cs.status = 'COMPLETED'
        WHERE u.role = 'HOUSEKEEPING_AGENT' AND u.is_active = 1
      `;
      const params = [];
      if (plantId) { query += ' AND u.plant_id = ?'; params.push(plantId); }
      query += ' GROUP BY u.id, p.name ORDER BY sessions_completed DESC';
      records = await db.all(query, params);
      break;
    }

    case 'supervisor_inspections': {
      let query = `
        SELECT si.id, si.inspected_at, si.overall_status, si.score, si.remarks,
               t.code as toilet_code, t.name as toilet_name, p.name as plant_name,
               u.name as supervisor_name
        FROM supervisor_inspections si
        JOIN toilets t ON si.toilet_id = t.id
        JOIN plants p ON t.plant_id = p.id
        JOIN users u ON si.supervisor_id = u.id
        WHERE 1=1
      `;
      const params = [];
      if (plantId) { query += ' AND t.plant_id = ?'; params.push(plantId); }
      if (supervisorId) { query += ' AND si.supervisor_id = ?'; params.push(supervisorId); }
      query += ' ORDER BY si.inspected_at DESC';
      records = await db.all(query, params);
      break;
    }

    case 'issues': {
      let query = `
        SELECT i.ticket_no, i.category, i.description, i.priority, i.status, i.created_at, i.resolved_at,
               t.code as toilet_code, t.name as toilet_name, p.name as plant_name,
               u_sup.name as supervisor_name, u_ag.name as agent_name
        FROM issues i
        JOIN plants p ON i.plant_id = p.id
        LEFT JOIN toilets t ON i.toilet_id = t.id
        LEFT JOIN users u_sup ON i.supervisor_id = u_sup.id
        LEFT JOIN users u_ag ON i.assigned_agent_id = u_ag.id
        WHERE 1=1
      `;
      const params = [];
      if (plantId) { query += ' AND i.plant_id = ?'; params.push(plantId); }
      if (status) { query += ' AND i.status = ?'; params.push(status); }
      query += ' ORDER BY i.created_at DESC';
      records = await db.all(query, params);
      break;
    }

    case 'missed_cleaning': {
      const targetDate = date || new Date().toISOString().slice(0, 10);
      const comp = await calculatePlantCompliance(plantId, targetDate);
      records = comp.pendingToilets.map(t => ({
        date: targetDate,
        toilet_code: t.code,
        toilet_name: t.name,
        status: 'MISSED / PENDING',
        compliance_impact: 'Flagged by Checkpoint Timer'
      }));
      break;
    }

    default:
      records = [];
  }

  res.json({ success: true, reportType, records });
});

// 3. Export to CSV format
router.get('/export-csv', authenticate, async (req, res) => {
  const { reportType = 'daily_cleaning', date } = req.query;
  const plantId = numericId(req.query.plantId);

  let query = `
    SELECT cs.session_code, cs.date, cs.start_time, cs.submit_time, cs.checklist_score, cs.status,
           t.code as toilet_code, p.name as plant_name, u.name as agent_name
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  if (date) { query += ' AND cs.date = ?'; params.push(date); }
  if (plantId) { query += ' AND t.plant_id = ?'; params.push(plantId); }
  query += ' ORDER BY cs.date DESC';

  const rows = await db.all(query, params);

  let csvContent = 'Session Code,Date,Start Time,Submit Time,Score %,Status,Toilet Code,Plant,Agent Name\n';
  for (const r of rows) {
    csvContent += `"${r.session_code}","${r.date}","${r.start_time}","${r.submit_time || ''}",${r.checklist_score},"${r.status}","${r.toilet_code}","${r.plant_name}","${r.agent_name || ''}"\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=Hygiene360_${reportType}_${Date.now()}.csv`);
  res.send(csvContent);
});

module.exports = router;
