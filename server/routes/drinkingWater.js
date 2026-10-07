const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../database');
const storage = require('../utils/storage');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');
const { applyWatermark } = require('../utils/watermark');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, fieldSize: 15 * 1024 * 1024 }
});
// Submit Drinking Water Inspection
router.post('/check', authenticate, requireRole('SUPERVISOR', 'SUPER_ADMIN', 'PLANT_ADMIN'), upload.single('photo'), async (req, res) => {
  try {
    const {
      plantId,
      areaId,
      pointName = 'Drinking Water Dispenser Hub',
      waterAvailable = 1,
      dispenserClean = 1,
      drinkingAreaClean = 1,
      glassesAvailable = 1,
      roFunctioning = 1,
      waterLeakage = 0,
      areaCleanliness = 1,
      remarks = ''
    } = req.body;

    const actualPlantId = plantId || req.user.plant_id;
    if (!actualPlantId) {
      return res.status(400).json({ success: false, error: 'plantId is required' });
    }

    const plant = await db.get('SELECT name, code FROM plants WHERE id = ?', [actualPlantId]);
    if (!plant) {
      return res.status(404).json({ success: false, error: 'Plant not found' });
    }

    // Determine overall status
    const isPass = (
      Number(waterAvailable) === 1 &&
      Number(dispenserClean) === 1 &&
      Number(drinkingAreaClean) === 1 &&
      Number(roFunctioning) === 1 &&
      Number(waterLeakage) === 0
    );
    const status = isPass ? 'PASS' : 'FAIL';

    let photoPath = null;
    if (req.file || req.body.imageBase64) {
      let buffer = req.file ? req.file.buffer : Buffer.from(req.body.imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const serverTimestampStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      const watermarked = await applyWatermark(buffer, {
        plantName: plant.name,
        toiletCode: 'DRINKING-WATER',
        sessionCode: 'DW-INSPECT',
        photoType: 'DRINKING WATER HYGIENE',
        serverTimestampStr,
        uploadedBy: req.user.name
      });

      const fileName = `H360_DW_${Date.now()}.jpg`;
      photoPath = await storage.save(`/uploads/evidence/${fileName}`, watermarked.buffer, 'image/jpeg');
    }

    const insertRes = await db.run(`
      INSERT INTO drinking_water_checks (
        plant_id, area_id, point_name, supervisor_id,
        water_available, dispenser_clean, drinking_area_clean, glasses_available,
        ro_functioning, water_leakage, area_cleanliness, status, remarks, evidence_photo_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      actualPlantId,
      areaId || null,
      pointName,
      req.user.id,
      Number(waterAvailable),
      Number(dispenserClean),
      Number(drinkingAreaClean),
      Number(glassesAvailable),
      Number(roFunctioning),
      Number(waterLeakage),
      Number(areaCleanliness),
      status,
      remarks,
      photoPath
    ]);

    await auditLogFromReq(req, 'DRINKING_WATER_CHECK', 'WATER_POINT', pointName, {
      check_id: insertRes.lastInsertRowid,
      status,
      water_available: waterAvailable,
      ro_functioning: roFunctioning
    });

    res.json({
      success: true,
      message: `Drinking water inspection recorded. Overall status: ${status}`,
      checkId: insertRes.lastInsertRowid,
      status
    });
  } catch (err) {
    console.error('Drinking water check error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// List drinking water checks
router.get('/', authenticate, async (req, res) => {
  let query = `
    SELECT dw.*, p.name as plant_name, a.name as area_name, u.name as supervisor_name
    FROM drinking_water_checks dw
    JOIN plants p ON dw.plant_id = p.id
    LEFT JOIN areas a ON dw.area_id = a.id
    JOIN users u ON dw.supervisor_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
    query += ' AND dw.plant_id = ?';
    params.push(req.user.plant_id);
  }

  query += ' ORDER BY dw.created_at DESC LIMIT 50';

  const checks = await db.all(query, params);
  res.json({ success: true, checks });
});

module.exports = router;
