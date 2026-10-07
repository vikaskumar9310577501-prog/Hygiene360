const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');

// Audit logs are visible to Super Admin, Plant Admin, and Management
router.get('/', authenticate, requireRole('SUPER_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT'), (req, res) => {
  const { action, role, search, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM audit_logs WHERE 1=1';
  const params = [];

  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }
  if (search) {
    query += ' AND (user_name LIKE ? OR entity_id LIKE ? OR details_json LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const logs = db.all(query, params);
  const countRow = db.get('SELECT COUNT(*) as total FROM audit_logs');

  res.json({
    success: true,
    total: countRow.total,
    logs
  });
});

module.exports = router;
