const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');
const { applyWatermark } = require('../utils/watermark');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, fieldSize: 15 * 1024 * 1024 }
});

const EVIDENCE_DIR = path.join(__dirname, '..', 'uploads', 'evidence');

// Submit Supervisor Inspection
router.post('/submit', authenticate, requireRole('SUPERVISOR', 'SUPER_ADMIN', 'PLANT_ADMIN'), upload.single('photo'), async (req, res) => {
  try {
    const { toiletId, sessionId, overallStatus, score = 100, remarks = '', isLiveCamera } = req.body;

    if (!toiletId) {
      return res.status(400).json({ success: false, error: 'toiletId is required' });
    }

    const toilet = db.get(`
      SELECT t.*, p.name as plant_name 
      FROM toilets t 
      JOIN plants p ON t.plant_id = p.id 
      WHERE t.id = ?
    `, [toiletId]);

    if (!toilet) {
      return res.status(404).json({ success: false, error: 'Toilet not found' });
    }

    let photoPath = null;
    if (req.file || req.body.imageBase64) {
      let buffer = req.file ? req.file.buffer : Buffer.from(req.body.imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const serverTimestampStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
      
      const watermarked = await applyWatermark(buffer, {
        plantName: toilet.plant_name,
        toiletCode: toilet.code,
        sessionCode: 'INSPECTION',
        photoType: 'SUPERVISOR INSPECTION',
        serverTimestampStr,
        uploadedBy: req.user.name
      });

      const fileName = `H360_INSPECT_${toilet.code}_${Date.now()}.jpg`;
      fs.writeFileSync(path.join(EVIDENCE_DIR, fileName), watermarked.buffer);
      photoPath = `/uploads/evidence/${fileName}`;
    }

    const inspectRes = db.run(`
      INSERT INTO supervisor_inspections (toilet_id, supervisor_id, session_id, overall_status, score, remarks, evidence_photo_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [toiletId, req.user.id, sessionId || null, overallStatus || 'SATISFACTORY', score, remarks, photoPath]);

    const inspectId = inspectRes.lastInsertRowid;

    auditLogFromReq(req, 'SUPERVISOR_INSPECTION', 'TOILET', toilet.code, {
      inspection_id: inspectId,
      overall_status: overallStatus,
      score
    });

    res.json({
      success: true,
      message: `Inspection recorded for ${toilet.name}. Status: ${overallStatus}`,
      inspectionId: inspectId
    });
  } catch (err) {
    console.error('Inspection submit error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get supervisor inspections today
router.get('/today', authenticate, (req, res) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  let query = `
    SELECT si.*, t.code as toilet_code, t.name as toilet_name, p.name as plant_name, u.name as supervisor_name
    FROM supervisor_inspections si
    JOIN toilets t ON si.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    JOIN users u ON si.supervisor_id = u.id
    WHERE date(si.inspected_at) = ?
  `;
  const params = [todayStr];

  if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
    query += ' AND t.plant_id = ?';
    params.push(req.user.plant_id);
  }

  query += ' ORDER BY si.inspected_at DESC';

  const inspections = db.all(query, params);
  res.json({ success: true, inspections });
});

module.exports = router;
