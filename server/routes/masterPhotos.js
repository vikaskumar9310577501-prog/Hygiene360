const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { compareWithMasterPhoto } = require('../utils/photoMatcher');
const { getToiletRefs } = require('../utils/cleanCheck');

function logAudit(req, action, details) {
  try {
    db.run(`
      INSERT INTO audit_logs (user_id, user_name, role, action, entity_type, entity_id, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      req.user?.id || null,
      req.user?.name || 'IT Admin',
      req.user?.role || 'IT_ADMIN',
      action,
      'MASTER_PHOTO',
      details?.itemLabel || 'ITEM',
      JSON.stringify(details || {}),
      req.ip || '127.0.0.1'
    ]);
  } catch (e) {}
}

// Storage directory for master reference clean photos
const MASTER_DIR = path.join(__dirname, '..', 'uploads', 'master_photos');
if (!fs.existsSync(MASTER_DIR)) {
  fs.mkdirSync(MASTER_DIR, { recursive: true });
}

// Multer memory storage for uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, fieldSize: 15 * 1024 * 1024 }
});

/**
 * 1. GET /api/master-photos
 * Lists all checklist items and their corresponding master photos for a plant & optional toilet
 * Accessible to IT_ADMIN, SUPER_ADMIN
 */
router.get('/', authenticate, requireRole('SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN'), (req, res) => {
  const { plantId, toiletId } = req.query;

  if (!plantId) {
    return res.status(400).json({ success: false, error: 'plantId is required' });
  }

  // Fetch all checklist items
  const items = db.all(`
    SELECT id, category, label, description, is_mandatory, order_num
    FROM checklist_items
    WHERE is_active = 1
    ORDER BY order_num ASC
  `);

  // Fetch master photos for this plant and toilet
  let masterPhotos;
  if (toiletId && toiletId !== 'all') {
    masterPhotos = db.all(`
      SELECT * FROM master_reference_photos
      WHERE plant_id = ? AND (toilet_id = ? OR toilet_id IS NULL)
      ORDER BY toilet_id DESC
    `, [plantId, toiletId]);
  } else {
    masterPhotos = db.all(`
      SELECT * FROM master_reference_photos
      WHERE plant_id = ? AND toilet_id IS NULL
    `, [plantId]);
  }

  // Map master photo to items
  const itemsWithMaster = items.map(item => {
    // If specific toilet photo exists, use it; otherwise fallback to plant default
    const master = masterPhotos.find(m => m.item_id === item.id);
    return {
      ...item,
      hasMaster: !!master,
      masterPhoto: master || null
    };
  });

  res.json({
    success: true,
    plantId,
    toiletId: toiletId || null,
    totalItems: items.length,
    configuredMasters: masterPhotos.length,
    items: itemsWithMaster
  });
});

/**
 * 2. POST /api/master-photos/upload
 * Only IT ADMIN and SUPER ADMIN can upload or replace master reference photos
 * Supports both Multipart Form Upload (file) and JSON DataUrl (live camera snap)
 */
router.post('/upload', authenticate, requireRole('SUPER_ADMIN', 'IT_ADMIN'), upload.single('imageFile'), async (req, res) => {
  try {
    const { plantId, toiletId, itemId, dataUrl } = req.body;

    if (!plantId || !itemId) {
      return res.status(400).json({ success: false, error: 'plantId and itemId are required.' });
    }

    const item = db.get('SELECT id, label, category FROM checklist_items WHERE id = ?', [itemId]);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Checklist item not found' });
    }

    let imageBuffer;
    let fileExt = 'jpg';

    if (req.file) {
      imageBuffer = req.file.buffer;
      if (req.file.mimetype.includes('png')) fileExt = 'png';
    } else if (dataUrl && dataUrl.startsWith('data:image/')) {
      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      return res.status(400).json({ success: false, error: 'No image file or live camera dataUrl provided.' });
    }

    const targetToiletId = toiletId && toiletId !== 'all' ? parseInt(toiletId, 10) : null;
    const filename = `master_p${plantId}_t${targetToiletId || 'default'}_i${itemId}_${Date.now()}.${fileExt}`;
    const filePath = path.join(MASTER_DIR, filename);

    // Save image to disk
    fs.writeFileSync(filePath, imageBuffer);
    const imageUrl = `/uploads/master_photos/${filename}`;

    // Upsert into master_reference_photos
    const existing = db.get(`
      SELECT id, image_url FROM master_reference_photos
      WHERE plant_id = ? AND (toilet_id = ? OR (toilet_id IS NULL AND ? IS NULL)) AND item_id = ?
    `, [plantId, targetToiletId, targetToiletId, itemId]);

    if (existing) {
      // Remove old file if it exists
      if (existing.image_url) {
        const oldPath = path.join(__dirname, '..', existing.image_url);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (e) {}
        }
      }

      db.run(`
        UPDATE master_reference_photos
        SET image_url = ?, uploaded_by_name = ?, uploaded_by_emp_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [imageUrl, req.user.name, req.user.employee_id || 'IT_ADMIN', existing.id]);
    } else {
      db.run(`
        INSERT INTO master_reference_photos (
          plant_id, toilet_id, item_id, item_code, item_label, image_url,
          uploaded_by_name, uploaded_by_emp_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `, [
        plantId,
        targetToiletId,
        itemId,
        `ITEM_${itemId}`,
        item.label,
        imageUrl,
        req.user.name,
        req.user.employee_id || 'IT_ADMIN'
      ]);
    }

    logAudit(req, 'MASTER_PHOTO_UPDATED', {
      plantId,
      toiletId: targetToiletId,
      itemLabel: item.label,
      imageUrl
    });

    res.json({
      success: true,
      message: `Master Reference Photo for "${item.label}" successfully saved!`,
      masterPhoto: {
        plantId,
        toiletId: targetToiletId,
        itemId,
        itemLabel: item.label,
        imageUrl,
        updatedAt: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Master photo upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save master photo.' });
  }
});

/**
 * 3. DELETE /api/master-photos/:id
 * Only IT ADMIN and SUPER ADMIN can delete
 */
router.delete('/:id', authenticate, requireRole('SUPER_ADMIN', 'IT_ADMIN'), (req, res) => {
  const photo = db.get('SELECT * FROM master_reference_photos WHERE id = ?', [req.params.id]);
  if (!photo) {
    return res.status(404).json({ success: false, error: 'Master photo not found' });
  }

  // Delete file from disk
  if (photo.image_url) {
    const fullPath = path.join(__dirname, '..', photo.image_url);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch (e) {}
    }
  }

  db.run('DELETE FROM master_reference_photos WHERE id = ?', [req.params.id]);

  logAudit(req, 'MASTER_PHOTO_DELETED', {
    itemLabel: photo.item_label,
    plantId: photo.plant_id
  });

  res.json({ success: true, message: 'Master reference photo deleted.' });
});

/**
 * 4. GET /api/master-photos/for-item
 * Public for authenticated housekeeper when cleaning a toilet
 * Returns the master photo for ghost overlay & live alignment box
 */
router.get('/for-item', authenticate, (req, res) => {
  const { itemId, toiletId, plantId } = req.query;

  if (!itemId) {
    return res.status(400).json({ success: false, error: 'itemId is required' });
  }

  // 1. Try toilet-specific master photo
  let master = null;
  if (toiletId) {
    master = db.get(`
      SELECT * FROM master_reference_photos
      WHERE item_id = ? AND toilet_id = ?
    `, [itemId, toiletId]);
  }

  // 2. If not found, fallback to plant-level default
  if (!master && plantId) {
    master = db.get(`
      SELECT * FROM master_reference_photos
      WHERE item_id = ? AND plant_id = ? AND toilet_id IS NULL
    `, [itemId, plantId]);
  }

  // 3. Fallback to any master photo for this item in system
  if (!master) {
    master = db.get(`
      SELECT * FROM master_reference_photos
      WHERE item_id = ?
      ORDER BY updated_at DESC LIMIT 1
    `, [itemId]);
  }

  res.json({
    success: true,
    hasMaster: !!master,
    masterPhoto: master || null
  });
});

/**
 * 5. POST /api/master-photos/compare
 * Compares live captured photo against the IT Admin master benchmark
 */
router.post('/compare', authenticate, async (req, res) => {
  try {
    const { liveImage, itemId, toiletId, plantId } = req.body;

    if (!liveImage || !itemId) {
      return res.status(400).json({ success: false, error: 'liveImage and itemId are required' });
    }

    // Lookup master photo
    let master = null;
    if (toiletId) {
      master = db.get('SELECT * FROM master_reference_photos WHERE item_id = ? AND toilet_id = ?', [itemId, toiletId]);
    }
    if (!master && plantId) {
      master = db.get('SELECT * FROM master_reference_photos WHERE item_id = ? AND plant_id = ? AND toilet_id IS NULL', [itemId, plantId]);
    }
    if (!master) {
      master = db.get('SELECT * FROM master_reference_photos WHERE item_id = ? ORDER BY updated_at DESC LIMIT 1', [itemId]);
    }

    // If no master photo has been uploaded by IT Admin yet, we accept with warning
    if (!master) {
      return res.json({
        success: true,
        hasMaster: false,
        isMatch: true,
        similarityScore: 90,
        cleanlinessScore: 90,
        boxColor: 'GREEN',
        message: 'No Master Reference photo configured by IT Admin. Standard verification applied.'
      });
    }

    // Verify live image size & convert base64 to buffer
    const base64Data = liveImage.replace(/^data:image\/\w+;base64,/, '');
    const liveBuffer = Buffer.from(base64Data, 'base64');

    // Run Computer Vision verification using Jimp perceptual hashing + pixel analysis
    const matchResult = await compareWithMasterPhoto(liveBuffer, master.image_url);

    return res.json({
      success: true,
      hasMaster: true,
      isMatch: matchResult.isMatch,
      similarityScore: matchResult.similarityScore,
      cleanlinessScore: matchResult.cleanlinessScore,
      boxColor: matchResult.boxColor,
      metrics: matchResult.metrics || null,
      message: matchResult.message
    });
  } catch (err) {
    console.error('Photo comparison error:', err);
    res.status(500).json({ success: false, error: err.message || 'Comparison failed' });
  }
});

const MAX_TOILET_REFS = 4;
const REF_KINDS = ['TOILET', 'CHECK_SHEET'];

// Reference photos per toilet: the live camera guides the housekeeper to the same view and the clean check compares against them
router.get('/toilet-refs/:toiletId', authenticate, (req, res) => {
  const kind = REF_KINDS.includes(req.query.kind) ? req.query.kind : 'TOILET';
  const toiletId = Number(req.params.toiletId);
  const refs = getToiletRefs(toiletId, kind, { fallbackToPlant: kind === 'CHECK_SHEET' && req.query.fallback === '1' })
    .map(r => ({ id: r.id, toilet_id: r.toilet_id, kind: r.kind, image_url: r.image_url, uploaded_by_name: r.uploaded_by_name, created_at: r.created_at }));
  const inherited = refs.some(r => r.toilet_id !== toiletId);
  res.json({ success: true, kind, max: MAX_TOILET_REFS, inherited, refs });
});

router.post('/toilet-refs/:toiletId', authenticate, requireRole('SUPER_ADMIN', 'IT_ADMIN'), upload.single('imageFile'), (req, res) => {
  try {
    const toilet = db.get('SELECT id, plant_id, code FROM toilets WHERE id = ?', [Number(req.params.toiletId)]);
    if (!toilet) return res.status(404).json({ success: false, error: 'Toilet not found' });
    const kind = REF_KINDS.includes(req.body.kind) ? req.body.kind : 'TOILET';

    const count = db.get('SELECT COUNT(*) AS c FROM toilet_reference_photos WHERE toilet_id = ? AND kind = ?', [toilet.id, kind]).c;
    if (count >= MAX_TOILET_REFS) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_TOILET_REFS} reference photos allowed. Delete one first.` });
    }

    let imageBuffer = null;
    if (req.file) imageBuffer = req.file.buffer;
    else if (req.body.dataUrl && req.body.dataUrl.startsWith('data:image/')) {
      imageBuffer = Buffer.from(req.body.dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    }
    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({ success: false, error: 'No image received.' });
    }

    const filename = `ref_t${toilet.id}_${kind.toLowerCase()}_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(MASTER_DIR, filename), imageBuffer);
    const imageUrl = `/uploads/master_photos/${filename}`;
    const r = db.run(
      'INSERT INTO toilet_reference_photos (toilet_id, plant_id, kind, image_url, uploaded_by_name) VALUES (?, ?, ?, ?, ?)',
      [toilet.id, toilet.plant_id, kind, imageUrl, req.user.name]
    );
    logAudit(req, 'TOILET_REFERENCE_ADDED', { itemLabel: `${toilet.code} ${kind}`, imageUrl });
    res.json({ success: true, ref: { id: r.lastInsertRowid, toilet_id: toilet.id, kind, image_url: imageUrl } });
  } catch (err) {
    console.error('Toilet reference upload error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to save reference photo.' });
  }
});

router.delete('/toilet-refs/ref/:id', authenticate, requireRole('SUPER_ADMIN', 'IT_ADMIN'), (req, res) => {
  const ref = db.get('SELECT * FROM toilet_reference_photos WHERE id = ?', [Number(req.params.id)]);
  if (!ref) return res.status(404).json({ success: false, error: 'Reference photo not found' });
  const fullPath = path.join(__dirname, '..', ref.image_url.replace(/^[/\\]+/, ''));
  if (fs.existsSync(fullPath)) {
    try { fs.unlinkSync(fullPath); } catch (e) {}
  }
  db.run('DELETE FROM toilet_reference_photos WHERE id = ?', [ref.id]);
  logAudit(req, 'TOILET_REFERENCE_DELETED', { itemLabel: `toilet ${ref.toilet_id} ${ref.kind}` });
  res.json({ success: true });
});

module.exports = router;
