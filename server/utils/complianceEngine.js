const db = require('../database');

/**
 * Calculate dynamic plant compliance for a given date
 */
function calculatePlantCompliance(plantId, targetDate = null) {
  const dateStr = targetDate || new Date().toISOString().slice(0, 10);

  // Active toilets for the plant
  let toiletQuery = 'SELECT id, code, name, area_id FROM toilets WHERE is_active = 1';
  const toiletParams = [];
  if (plantId) {
    toiletQuery += ' AND plant_id = ?';
    toiletParams.push(plantId);
  }
  const allToilets = db.all(toiletQuery, toiletParams);
  const expectedCount = allToilets.length;

  if (expectedCount === 0) {
    return {
      expected: 0,
      completed: 0,
      pending: 0,
      missed: 0,
      compliancePercentage: 100,
      completedToilets: [],
      pendingToilets: []
    };
  }

  // Get completed sessions today
  let sessionQuery = `
    SELECT cs.id, cs.toilet_id, cs.status, cs.checklist_score, cs.submit_time, t.code as toilet_code, t.name as toilet_name, u.name as agent_name
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.date = ? AND cs.status = 'COMPLETED'
  `;
  const sessionParams = [dateStr];
  if (plantId) {
    sessionQuery += ' AND t.plant_id = ?';
    sessionParams.push(plantId);
  }

  const completedSessions = db.all(sessionQuery, sessionParams);
  const completedToiletIdSet = new Set(completedSessions.map(s => s.toilet_id));

  const completedCount = completedToiletIdSet.size;
  const pendingCount = Math.max(0, expectedCount - completedCount);
  const compliancePercentage = Number(((completedCount / expectedCount) * 100).toFixed(1));

  const pendingToilets = allToilets.filter(t => !completedToiletIdSet.has(t.id));

  return {
    date: dateStr,
    expected: expectedCount,
    completed: completedCount,
    pending: pendingCount,
    missed: pendingCount, // pending at end of day or checkpoint is treated as missed
    compliancePercentage,
    completedSessions,
    pendingToilets
  };
}

/**
 * Detect recurring issues across toilets (e.g. Floor issue 5x, Flush issue 3x)
 */
function getRecurringIssues(plantId = null, days = 30, minOccurrences = 2) {
  let query = `
    SELECT 
      t.id as toilet_id,
      t.code as toilet_code,
      t.name as toilet_name,
      p.name as plant_name,
      p.code as plant_code,
      i.category,
      COUNT(i.id) as occurrence_count,
      MAX(i.created_at) as last_occurred_at,
      GROUP_CONCAT(DISTINCT i.priority) as priorities
    FROM issues i
    JOIN toilets t ON i.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    WHERE i.created_at >= datetime('now', '-' || ? || ' days')
  `;
  const params = [days];
  if (plantId) {
    query += ' AND t.plant_id = ?';
    params.push(plantId);
  }
  query += `
    GROUP BY t.id, i.category
    HAVING COUNT(i.id) >= ?
    ORDER BY occurrence_count DESC
  `;
  params.push(minOccurrences);

  return db.all(query, params);
}

/**
 * Checkpoint evaluator for missed cleaning alerts
 */
function checkAndTriggerMissedCleaningAlerts(plantId = null) {
  const plants = plantId 
    ? db.all('SELECT id, code, name FROM plants WHERE id = ?', [plantId])
    : db.all('SELECT id, code, name FROM plants WHERE is_active = 1');

  const alertsTriggered = [];

  for (const plant of plants) {
    const compliance = calculatePlantCompliance(plant.id);
    if (compliance.pending > 0) {
      const message = `Daily Hygiene Compliance Alert: ${compliance.pending} toilets have not been cleaned/recorded today at ${plant.name}. Current compliance: ${compliance.compliancePercentage}%.`;
      
      // Notify Plant Admins, Supervisors and Management
      const recipients = db.all(`
        SELECT id, role FROM users 
        WHERE (role IN ('PLANT_ADMIN', 'SUPERVISOR') AND plant_id = ?) 
           OR role IN ('SUPER_ADMIN', 'MANAGEMENT')
      `, [plant.id]);

      for (const r of recipients) {
        db.run(`
          INSERT INTO notifications (user_id, title, message, type, metadata_json)
          VALUES (?, 'Checkpoint Compliance Alert', ?, 'MISSED_CLEANING', ?)
        `, [
          r.id, 
          message, 
          JSON.stringify({ plant_id: plant.id, plant_code: plant.code, pending_count: compliance.pending, compliance_pct: compliance.compliancePercentage })
        ]);
      }

      alertsTriggered.push({
        plant: plant.code,
        pending: compliance.pending,
        recipientsCount: recipients.length
      });
    }
  }

  return alertsTriggered;
}

module.exports = {
  calculatePlantCompliance,
  getRecurringIssues,
  checkAndTriggerMissedCleaningAlerts
};
