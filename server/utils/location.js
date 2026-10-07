const db = require('../database');

const TOILET_CONTEXT_SQL = `
  SELECT t.id, t.code, t.name, t.gender, t.status, t.plant_id, t.area_id, t.toilet_uid, t.qr_token,
         t.assigned_user_id, t.supervisor_id, t.cleaning_frequency,
         t.urinal_count, t.wc_count, t.basin_count, t.drinking_water_nearby,
         p.name as plant_name, p.code as plant_code, p.location as plant_location,
         b.name as building_name, bl.name as block_name, f.name as floor_name, a.name as area_name,
         u_asn.name as assigned_user_name, u_asn.employee_id as assigned_user_emp_id,
         u_sup.name as supervisor_name, u_sup.employee_id as supervisor_emp_id
  FROM toilets t
  JOIN plants p ON t.plant_id = p.id
  LEFT JOIN areas a ON t.area_id = a.id
  LEFT JOIN floors f ON a.floor_id = f.id
  LEFT JOIN blocks bl ON f.block_id = bl.id
  LEFT JOIN buildings b ON f.building_id = b.id
  LEFT JOIN users u_asn ON t.assigned_user_id = u_asn.id
  LEFT JOIN users u_sup ON t.supervisor_id = u_sup.id
`;

function getToiletContext(toiletId) {
  if (!toiletId) return null;
  return db.get(`${TOILET_CONTEXT_SQL} WHERE t.id = ?`, [toiletId]) || null;
}

function locationLine(ctx) {
  if (!ctx) return '';
  return [ctx.plant_name, ctx.building_name, ctx.block_name, ctx.floor_name, ctx.area_name].filter(Boolean).join(' / ');
}

// Server time in IST, split for the photo stamp
function istStamp(date = new Date()) {
  const opts = { timeZone: 'Asia/Kolkata' };
  return {
    date: date.toLocaleDateString('en-GB', { ...opts, day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    full: date.toLocaleString('en-IN', { ...opts, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
  };
}

function watermarkMeta(ctx, { photoType, reference, user }) {
  const stamp = istStamp();
  return {
    plantName: ctx ? ctx.plant_name : 'PLANT',
    toiletCode: ctx ? (ctx.toilet_uid || ctx.code) : 'FACILITY',
    location: locationLine(ctx),
    sessionCode: reference || '',
    photoType,
    serverTimestampStr: stamp.full,
    dateStr: stamp.date,
    timeStr: stamp.time,
    uploadedBy: user ? `${user.name}${user.employee_id ? ` (${user.employee_id})` : ''}` : 'USER'
  };
}

// Supervisor who verifies issues for a toilet: toilet master supervisor, else any plant supervisor, else a plant admin
function resolveSupervisorId(ctx) {
  if (ctx && ctx.supervisor_id) return ctx.supervisor_id;
  const plantId = ctx ? ctx.plant_id : null;
  const sup = db.get(`
    SELECT id FROM users WHERE role = 'SUPERVISOR' AND is_active = 1 AND (plant_id = ? OR plant_id IS NULL)
    ORDER BY plant_id IS NULL, id LIMIT 1
  `, [plantId]);
  if (sup) return sup.id;
  const admin = db.get(`
    SELECT id FROM users WHERE role IN ('PLANT_ADMIN', 'SUPER_ADMIN', 'IT_ADMIN') AND is_active = 1 AND (plant_id = ? OR plant_id IS NULL)
    ORDER BY plant_id IS NULL, id LIMIT 1
  `, [plantId]);
  return admin ? admin.id : 1;
}

function issueTargetHours() {
  const row = db.get("SELECT value FROM system_settings WHERE key = 'issue_target_hours'");
  const hours = Number(row && row.value);
  return Number.isFinite(hours) && hours > 0 ? hours : 4;
}

// UTC 'YYYY-MM-DD HH:MM:SS', same format as CURRENT_TIMESTAMP
function targetFromNow(hours = issueTargetHours()) {
  return new Date(Date.now() + hours * 3600000).toISOString().replace('T', ' ').slice(0, 19);
}

function nextTicketNo(prefix) {
  const row = db.get('SELECT COALESCE(MAX(id), 0) as maxId FROM issues');
  let n = Number(row.maxId) + 301;
  let ticket = `${prefix}-${String(n).padStart(6, '0')}`;
  while (db.get('SELECT id FROM issues WHERE ticket_no = ?', [ticket])) {
    n += 1;
    ticket = `${prefix}-${String(n).padStart(6, '0')}`;
  }
  return ticket;
}

module.exports = {
  TOILET_CONTEXT_SQL,
  getToiletContext,
  locationLine,
  istStamp,
  watermarkMeta,
  resolveSupervisorId,
  issueTargetHours,
  targetFromNow,
  nextTicketNo
};
