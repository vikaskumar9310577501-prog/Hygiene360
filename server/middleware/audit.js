const db = require('../database');

function logAudit({ userId, userName, role, action, entityType, entityId, details, ipAddress }) {
  try {
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : String(details || '');
    db.run(`
      INSERT INTO audit_logs (user_id, user_name, role, action, entity_type, entity_id, details_json, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId || null,
      userName || 'SYSTEM',
      role || 'SYSTEM',
      action,
      entityType || null,
      String(entityId || ''),
      detailsStr,
      ipAddress || '127.0.0.1'
    ]);
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}

// Express helper to log from request context
function auditLogFromReq(req, action, entityType, entityId, details) {
  const user = req.user || {};
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  logAudit({
    userId: user.id,
    userName: user.name,
    role: user.role,
    action,
    entityType,
    entityId,
    details,
    ipAddress: ip
  });
}

module.exports = {
  logAudit,
  auditLogFromReq
};
