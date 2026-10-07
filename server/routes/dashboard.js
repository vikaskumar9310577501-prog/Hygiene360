const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { calculatePlantCompliance, calculateComplianceForDates, getRecurringIssues, checkAndTriggerMissedCleaningAlerts } = require('../utils/complianceEngine');

// 1. Management Dashboard Overview KPIs & Charts
router.get('/management', authenticate, async (req, res) => {
  const { plantId, date } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // Plant scope determination (supports specific plant ID or 'all' for enterprise)
  let targetPlantId = null;
  if (plantId && plantId !== 'all' && !isNaN(Number(plantId))) {
    targetPlantId = Number(plantId);
  } else if (plantId === 'all') {
    targetPlantId = null;
  } else if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
    targetPlantId = req.user.plant_id;
  } else {
    // Default to first active plant if none specified
    const firstPlant = (await db.get("SELECT id FROM plants WHERE code = 'BHIWADI' LIMIT 1")) || (await db.get('SELECT id FROM plants LIMIT 1'));
    targetPlantId = firstPlant ? firstPlant.id : null;
  }

  const plant = targetPlantId 
    ? await db.get('SELECT * FROM plants WHERE id = ?', [targetPlantId]) 
    : { id: 'all', name: 'All Manufacturing Plants', code: 'ALL' };

  // 1. Compliance calculations using single source of truth engine
  const compliance = await calculatePlantCompliance(targetPlantId, targetDate);

  // 2. Consistent 7 Management KPIs (Toilet Cleaning + Compliance + Achievement)
  const totalToilets = compliance.expected;
  const cleanedToilets = compliance.completed;
  const notCleaned = compliance.pending;
  const dailyCleaningPct = compliance.compliancePercentage;
  const cleanToiletsPct = compliance.compliancePercentage;
  const notCleanedPct = totalToilets > 0 ? Number(((notCleaned / totalToilets) * 100).toFixed(1)) : 0;
  const achievementPct = dailyCleaningPct;

  const kpis = {
    totalToilets,
    cleanedToilets,
    cleanedToday: cleanedToilets,
    notCleaned,
    pending: notCleaned,
    dailyCleaningPct,
    cleaningCompliance: dailyCleaningPct,
    cleanToiletsPct,
    notCleanedPct,
    achievementTarget: totalToilets,
    achievementActual: cleanedToilets,
    achievementPct
  };

  const trendDays = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    trendDays.push(d);
  }
  const trendMonths = [];
  for (let m = 5; m >= 0; m--) {
    const base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() - m);
    trendMonths.push(base);
  }
  const monthKey = (y, mo, day) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const firstSession = await db.get('SELECT MIN(date) as d FROM cleaning_sessions');
  const goLive = firstSession?.d || new Date().toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  const firstTrendDay = trendDays[0].toISOString().slice(0, 10);
  const firstMonthDay = monthKey(trendMonths[0].getFullYear(), trendMonths[0].getMonth(), 1);
  const monthFrom = goLive > firstMonthDay ? goLive : firstMonthDay;
  const earliestDate = firstTrendDay < monthFrom ? firstTrendDay : monthFrom;
  const complianceByDate = await calculateComplianceForDates(targetPlantId, earliestDate, todayStr);
  const complianceOn = (dStr) => complianceByDate.get(dStr) || { expected: 0, completed: 0, pending: 0, compliancePercentage: 100 };

  // 3. Day-wise cleaning trend (past 7 days)
  const dayWiseTrend = [];
  for (const d of trendDays) {
    const dStr = d.toISOString().slice(0, 10);
    const comp = complianceOn(dStr);
    dayWiseTrend.push({
      date: dStr,
      displayDate: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      expected: comp.expected,
      completed: comp.completed,
      pending: comp.pending,
      compliancePercentage: comp.compliancePercentage
    });
  }

  // 4. Month-wise cleaning trend (past 6 months)
  const monthWiseTrend = [];
  for (const base of trendMonths) {
    const y = base.getFullYear();
    const mo = base.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    let expected = 0;
    let completed = 0;
    let days = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = monthKey(y, mo, day);
      if (dStr < goLive || dStr > todayStr) continue;
      const comp = complianceOn(dStr);
      expected += comp.expected;
      completed += comp.completed;
      days++;
    }
    monthWiseTrend.push({
      month: base.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      displayMonth: base.toLocaleDateString('en-GB', { month: 'short' }),
      expected,
      completed,
      days,
      compliance: expected > 0 ? Math.round((completed / expected) * 100) : null
    });
  }

  // 5. Toilet-wise real-time performance matrix
  let toiletPerfSql = `
    SELECT 
      t.id, t.code, t.name, t.gender,
      a.name as area_name, b.name as building_name,
      p.name as plant_name,
      COALESCE(cs.status, 'PENDING') as today_status,
      cs.checklist_score, cs.submit_time, cs.id as session_id,
      u.name as agent_name,
      (SELECT COUNT(*) FROM issues i WHERE i.toilet_id = t.id AND i.status NOT IN ('CLOSED', 'VERIFIED')) as active_issues
    FROM toilets t
    JOIN plants p ON t.plant_id = p.id
    JOIN areas a ON t.area_id = a.id
    JOIN floors f ON a.floor_id = f.id
    JOIN buildings b ON f.building_id = b.id
    LEFT JOIN cleaning_sessions cs ON t.id = cs.toilet_id AND cs.date = ? AND cs.status = 'COMPLETED'
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE t.is_active = 1
  `;
  const toiletPerfParams = [targetDate];
  if (targetPlantId) {
    toiletPerfSql += ' AND t.plant_id = ?';
    toiletPerfParams.push(targetPlantId);
  }
  toiletPerfSql += ' ORDER BY t.code ASC';
  const toiletPerformance = await db.all(toiletPerfSql, toiletPerfParams);
  const recurringIssues = await getRecurringIssues(targetPlantId, 30, 2);

  res.json({
    success: true,
    plant,
    date: targetDate,
    kpis,
    dayWiseTrend,
    monthWiseTrend,
    toiletPerformance,
    recurringIssues,
    pendingToilets: compliance.pendingToilets
  });
});

// 2. Housekeeping Agent Dashboard
router.get('/agent', authenticate, async (req, res) => {
  const userId = req.user.id;
  const todayStr = new Date().toISOString().slice(0, 10);
  const plantId = req.user.plant_id;

  // Agent's assigned toilets for today
  let toiletSql = `
    SELECT t.id, t.code, t.name, t.gender, t.qr_token,
           a.name as area_name, b.name as building_name,
           COALESCE(cs.status, 'PENDING') as status,
           cs.id as session_id, cs.checklist_score, cs.submit_time, cs.remarks
    FROM toilets t
    JOIN areas a ON t.area_id = a.id
    JOIN floors f ON a.floor_id = f.id
    JOIN buildings b ON f.building_id = b.id
    LEFT JOIN assignments asn ON t.id = asn.toilet_id AND asn.user_id = ? AND asn.assigned_date = ?
    LEFT JOIN cleaning_sessions cs ON t.id = cs.toilet_id AND cs.date = ? AND cs.status = 'COMPLETED'
    WHERE t.is_active = 1
  `;
  const params = [userId, todayStr, todayStr];

  // If agent has specific assignments, prioritize them; else show plant toilets
  if (plantId) {
    toiletSql += ' AND (t.plant_id = ?)';
    params.push(plantId);
  }
  toiletSql += ' ORDER BY t.code ASC';

  const toilets = await db.all(toiletSql, params);

  const targetCount = toilets.length;
  const completedCount = toilets.filter(t => t.status === 'COMPLETED').length;
  const pendingCount = targetCount - completedCount;
  const progressPct = targetCount > 0 ? Number(((completedCount / targetCount) * 100).toFixed(1)) : 100;

  // Agent's assigned issues
  const assignedIssues = await db.all(`
    SELECT i.*, t.code as toilet_code, t.name as toilet_name
    FROM issues i
    JOIN toilets t ON i.toilet_id = t.id
    WHERE i.assigned_agent_id = ? AND i.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
    ORDER BY i.created_at DESC
  `, [userId]);

  // Rejected submissions if any
  const rejectedSessions = await db.all(`
    SELECT cs.*, t.code as toilet_code, t.name as toilet_name
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    WHERE cs.user_id = ? AND cs.status = 'REJECTED'
    ORDER BY cs.id DESC LIMIT 10
  `, [userId]);

  res.json({
    success: true,
    kpis: {
      target: targetCount,
      completed: completedCount,
      pending: pendingCount,
      rejected: rejectedSessions.length,
      issues: assignedIssues.length,
      progressPercentage: progressPct
    },
    toilets,
    assignedIssues,
    rejectedSessions
  });
});

// 3. Supervisor Dashboard
router.get('/supervisor', authenticate, async (req, res) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const plantId = req.user.plant_id;

  // Inspections today
  let inspectSql = `
    SELECT si.*, t.code as toilet_code, t.name as toilet_name, u.name as supervisor_name
    FROM supervisor_inspections si
    JOIN toilets t ON si.toilet_id = t.id
    JOIN users u ON si.supervisor_id = u.id
    WHERE date(si.inspected_at) = ?
  `;
  const inspectParams = [todayStr];
  if (plantId) {
    inspectSql += ' AND t.plant_id = ?';
    inspectParams.push(plantId);
  }
  const inspections = await db.all(inspectSql, inspectParams);

  // Issues found today and active
  let issueSql = `
    SELECT i.*, t.code as toilet_code, t.name as toilet_name, u.name as agent_name
    FROM issues i
    JOIN toilets t ON i.toilet_id = t.id
    LEFT JOIN users u ON i.assigned_agent_id = u.id
    WHERE 1=1
  `;
  const issueParams = [];
  if (plantId) {
    issueSql += ' AND i.plant_id = ?';
    issueParams.push(plantId);
  }
  issueSql += ' ORDER BY i.created_at DESC LIMIT 50';
  const allIssues = await db.all(issueSql, issueParams);

  const openIssues = allIssues.filter(i => ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(i.status));
  const resolvedIssues = allIssues.filter(i => i.status === 'RESOLVED'); // Waiting for verification
  const closedIssues = allIssues.filter(i => ['VERIFIED', 'CLOSED'].includes(i.status));

  // Compliance summary
  const compliance = await calculatePlantCompliance(plantId, todayStr);

  // Recurring issues
  const recurring = await getRecurringIssues(plantId, 30, 2);

  res.json({
    success: true,
    kpis: {
      inspectionsToday: inspections.length,
      issuesFoundToday: allIssues.filter(i => i.created_at.startsWith(todayStr)).length,
      openIssues: openIssues.length,
      pendingVerification: resolvedIssues.length,
      resolvedClosed: closedIssues.length,
      repeatedIssuesCount: recurring.length,
      plantCompliance: compliance.compliancePercentage
    },
    inspections,
    openIssues,
    pendingVerification: resolvedIssues,
    recurringIssues: recurring
  });
});

// 4. Toilet 360 Drilldown Detail Modal
router.get('/toilet/:id', authenticate, async (req, res) => {
  const toiletId = req.params.id;
  const todayStr = new Date().toISOString().slice(0, 10);

  const toilet = await db.get(`
    SELECT t.*, p.name as plant_name, p.code as plant_code,
           b.name as building_name, f.name as floor_name, a.name as area_name
    FROM toilets t
    JOIN plants p ON t.plant_id = p.id
    JOIN areas a ON t.area_id = a.id
    JOIN floors f ON a.floor_id = f.id
    JOIN buildings b ON f.building_id = b.id
    WHERE t.id = ?
  `, [toiletId]);

  if (!toilet) {
    return res.status(404).json({ success: false, error: 'Toilet not found' });
  }

  // Latest cleaning session
  const lastCleaning = await db.get(`
    SELECT cs.*, u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    JOIN users u ON cs.user_id = u.id
    WHERE cs.toilet_id = ?
    ORDER BY cs.id DESC LIMIT 1
  `, [toiletId]);

  let evidencePhotos = [];
  let checklistResponses = [];
  if (lastCleaning) {
    evidencePhotos = await db.all('SELECT * FROM evidence_photos WHERE session_id = ?', [lastCleaning.id]);
    checklistResponses = await db.all('SELECT * FROM checklist_responses WHERE session_id = ?', [lastCleaning.id]);
  }

  // Last supervisor inspection
  const lastInspection = await db.get(`
    SELECT si.*, u.name as supervisor_name
    FROM supervisor_inspections si
    JOIN users u ON si.supervisor_id = u.id
    WHERE si.toilet_id = ?
    ORDER BY si.id DESC LIMIT 1
  `, [toiletId]);

  // Open issues
  const openIssues = await db.all(`
    SELECT i.*, u.name as supervisor_name, a.name as agent_name
    FROM issues i
    JOIN users u ON i.supervisor_id = u.id
    LEFT JOIN users a ON i.assigned_agent_id = a.id
    WHERE i.toilet_id = ? AND i.status NOT IN ('CLOSED', 'VERIFIED')
    ORDER BY i.created_at DESC
  `, [toiletId]);

  // Historical Timeline of events for this toilet
  const timeline = [];
  if (lastCleaning) {
    timeline.push({
      time: lastCleaning.start_time,
      type: 'CLEANING_STARTED',
      title: 'Cleaning Started',
      description: `Agent ${lastCleaning.agent_name} initiated cleaning workflow.`
    });
    if (lastCleaning.submit_time) {
      timeline.push({
        time: lastCleaning.submit_time,
        type: 'CLEANING_COMPLETED',
        title: 'Checklist & Evidence Submitted',
        description: `Checklist passed with score ${lastCleaning.checklist_score}%. 3 live photos recorded.`
      });
    }
  }

  if (lastInspection) {
    timeline.push({
      time: lastInspection.inspected_at,
      type: 'SUPERVISOR_INSPECTED',
      title: 'Supervisor Inspected',
      description: `Supervisor ${lastInspection.supervisor_name} inspected toilet. Status: ${lastInspection.overall_status}.`
    });
  }

  for (const oi of openIssues) {
    timeline.push({
      time: oi.created_at,
      type: 'ISSUE_RAISED',
      title: `Issue Ticket ${oi.ticket_no} Raised`,
      description: `${oi.category}: ${oi.description}`
    });
  }

  timeline.sort((a, b) => new Date(b.time) - new Date(a.time));

  res.json({
    success: true,
    toilet,
    lastCleaning: lastCleaning ? {
      ...lastCleaning,
      evidencePhotos,
      checklistResponses
    } : null,
    lastInspection,
    openIssues,
    timeline
  });
});

// 5. Trigger Missed Cleaning Checkpoint Evaluation
router.post('/trigger-checkpoint', authenticate, async (req, res) => {
  const { plantId } = req.body;
  const alerts = await checkAndTriggerMissedCleaningAlerts(plantId);
  res.json({
    success: true,
    message: 'Checkpoint compliance evaluation executed.',
    alertsTriggered: alerts
  });
});

module.exports = router;
