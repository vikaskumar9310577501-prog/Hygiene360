const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const os = require('os');
const QRCode = require('qrcode');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');
const slotUtils = require('../utils/slots');
const location = require('../utils/location');

// Phones must reach the app over HTTPS for the live camera; set PUBLIC_APP_URL when the server has a fixed address
function publicBaseUrl() {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');
  const lanIp = Object.values(os.networkInterfaces()).flat()
    .find(n => n && n.family === 'IPv4' && !n.internal)?.address || 'localhost';
  return `https://${lanIp}:${process.env.HTTPS_PORT || 5443}`;
}

// Scanned text may be a Toilet ID (TOILET-SUPA-BLOCK-A-01), an old opaque token (H360-QR-...), or a URL/URI wrapping either
function cleanScannedToken(raw) {
  let cleaned = String(raw || '').trim();
  const link = cleaned.match(/[?&]t=([^&#\s]+)/);
  if (link) {
    cleaned = decodeURIComponent(link[1]);
  } else if (cleaned.includes('token=')) {
    const match = cleaned.match(/token=([a-zA-Z0-9_-]+)/);
    if (match) cleaned = match[1];
  } else if (cleaned.includes('//')) {
    cleaned = cleaned.split('/').pop().split('?')[0];
  }
  return cleaned.trim();
}

async function findToiletByScan(cleanedToken, extraWhere = '') {
  return db.get(`
    ${location.TOILET_CONTEXT_SQL}
    WHERE (t.qr_token = ? OR UPPER(t.toilet_uid) = UPPER(?)) AND t.is_active = 1 ${extraWhere}
  `, [cleanedToken, cleanedToken]);
}

// Validate scanned QR token with role-based routing
router.post('/validate', authenticate, async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'QR token is required' });
  }

  const cleanedToken = cleanScannedToken(token);
  const toilet = await findToiletByScan(cleanedToken);

  if (!toilet) {
    return res.status(404).json({
      success: false,
      error: 'Invalid, unrecognized or inactive QR code. Security token verification failed.'
    });
  }

  // Check plant authorization:
  // IT_ADMIN & SUPER_ADMIN have universal access across all plants
  const isITAdmin = req.user.role === 'SUPER_ADMIN' || req.user.role === 'IT_ADMIN';
  if (!isITAdmin && req.user.plant_id && req.user.plant_id !== toilet.plant_id) {
    const userPlant = await db.get('SELECT name FROM plants WHERE id = ?', [req.user.plant_id]);
    return res.status(403).json({
      success: false,
      error: `Access Denied: You are assigned to ${userPlant?.name || 'Plant #' + req.user.plant_id}. You cannot scan or access facilities in ${toilet.plant_name}.`
    });
  }

  // Audit log scan event
  await auditLogFromReq(req, 'QR_SCAN', 'TOILET', toilet.code, {
    token_prefix: cleanedToken.slice(0, 10),
    plant: toilet.plant_name,
    user_role: req.user.role
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch today's cleaning session for this toilet if any
  const todaySession = await db.get(`
    SELECT cs.*, u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    JOIN users u ON cs.user_id = u.id
    WHERE cs.toilet_id = ? AND cs.date = ?
    ORDER BY cs.id DESC LIMIT 1
  `, [toilet.id, todayStr]);

  // Fetch active issues for this toilet
  const activeIssues = await db.all(`
    SELECT id, ticket_no, category, description, priority, status, created_at
    FROM issues
    WHERE toilet_id = ? AND status NOT IN ('CLOSED', 'VERIFIED')
    ORDER BY created_at DESC
  `, [toilet.id]);

  // Scanning inside the app always opens the housekeeping cleaning form; scanning with any other
  // scanner opens the public complaint link encoded in the QR instead
  const areaToilets = await db.all(`
    ${location.TOILET_CONTEXT_SQL}
    WHERE t.is_active = 1 AND t.plant_id = ?
    ORDER BY a.name, t.code
  `, [toilet.plant_id]);
  return res.json({
    success: true,
    workflow: 'HOUSEKEEPING_CLEANING',
    targetTab: 'cleaning_workflow',
    toilet,
    areaToilets,
    todaySession,
    activeIssues,
    message: `Ready to start cleaning for ${toilet.name}.`
  });
});
// Public facility lookup by QR token (unauthenticated for factory staff scanning with mobile browser camera)
router.get('/facility/:token', async (req, res) => {
  const found = await findToiletByScan(cleanScannedToken(req.params.token));
  if (!found) {
    return res.status(404).json({ success: false, error: 'Facility QR code not found or inactive.' });
  }

  const toilet = {
    id: found.id, code: found.code, name: found.name, gender: found.gender, plant_id: found.plant_id, area_id: found.area_id,
    toilet_uid: found.toilet_uid, qr_token: found.qr_token, plant_name: found.plant_name, plant_code: found.plant_code,
    building_name: found.building_name, block_name: found.block_name, floor_name: found.floor_name, area_name: found.area_name
  };
  res.json({
    success: true,
    toilet
  });
});

// Regenerate QR token for a toilet
router.post('/regenerate/:toiletId', authenticate, requireRole('SUPER_ADMIN', 'PLANT_ADMIN'), async (req, res) => {
  const toiletId = req.params.toiletId;
  const toilet = await db.get('SELECT * FROM toilets WHERE id = ?', [toiletId]);
  if (!toilet) {
    return res.status(404).json({ success: false, error: 'Toilet not found' });
  }

  // Deactivate old QR
  await db.run('UPDATE qr_codes SET is_active = 0, disabled_at = CURRENT_TIMESTAMP WHERE toilet_id = ?', [toiletId]);

  // Generate fresh secure token
  const newToken = 'H360-QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  await db.run('UPDATE toilets SET qr_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newToken, toiletId]);
  await db.run('INSERT INTO qr_codes (toilet_id, token, is_active, regenerated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)', [toiletId, newToken]);

  await auditLogFromReq(req, 'QR_REGENERATED', 'TOILET', toilet.code, {
    old_token_prefix: toilet.qr_token.slice(0, 10),
    new_token_prefix: newToken.slice(0, 10)
  });

  res.json({
    success: true,
    message: `QR code successfully regenerated for toilet ${toilet.code}. Previous QR is now invalid.`,
    token: newToken
  });
});

// Download/Generate QR Code image
router.get('/image/:toiletId', async (req, res) => {
  const toiletId = req.params.toiletId;
  const toilet = await location.getToiletContext(toiletId);

  if (!toilet) {
    return res.status(404).send('Toilet not found');
  }

  try {
    // Any phone scanner opens the public complaint link; the in-app scanner reads the Toilet ID from it.
    // Previously printed placards (plain Toilet ID / H360-QR token) keep working in /validate
    const payload = `${publicBaseUrl()}/complaint?t=${encodeURIComponent(toilet.toilet_uid || toilet.qr_token)}`;
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      toilet: {
        id: toilet.id,
        code: toilet.code,
        name: toilet.name,
        plantName: toilet.plant_name,
        token: toilet.qr_token,
        toiletUid: toilet.toilet_uid,
        gender: toilet.gender,
        location: location.locationLine(toilet)
      },
      qrDataUrl,
      payload
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to generate QR image' });
  }
});

// List all QR codes and status
router.get('/list', authenticate, async (req, res) => {
  let query = `
    SELECT t.id, t.code, t.name, t.gender, t.qr_token, t.toilet_uid, t.is_active, t.area_id, p.name as plant_name, p.id as plant_id,
           b.name as building_name, bl.name as block_name, f.name as floor_name, a.name as area_name,
           q.generated_at, q.regenerated_at
    FROM toilets t
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN areas a ON t.area_id = a.id
    LEFT JOIN floors f ON a.floor_id = f.id
    LEFT JOIN blocks bl ON f.block_id = bl.id
    LEFT JOIN buildings b ON f.building_id = b.id
    LEFT JOIN qr_codes q ON t.id = q.toilet_id AND q.is_active = 1
    WHERE 1=1
  `;
  const params = [];
  if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
    query += ' AND t.plant_id = ?';
    params.push(req.user.plant_id);
  }
  query += ' ORDER BY p.name, t.code';

  const list = await db.all(query, params);
  res.json({ success: true, qrCodes: list });
});

module.exports = router;
