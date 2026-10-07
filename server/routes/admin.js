const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');

// ----------------- PLANTS (READ ACCESSIBLE TO ALL AUTHENTICATED ROLES) -----------------
router.get('/plants', authenticate, (req, res) => {
  let query = `
    SELECT p.*,
      (SELECT COUNT(*) FROM toilets t WHERE t.plant_id = p.id) as toilet_count,
      (SELECT COUNT(*) FROM buildings b WHERE b.plant_id = p.id) as building_count
    FROM plants p WHERE 1=1
  `;
  const params = [];
  if (req.user.plant_id && req.user.role === 'PLANT_ADMIN') {
    query += ' AND p.id = ?';
    params.push(req.user.plant_id);
  }
  query += ' ORDER BY p.name ASC';
  const plants = db.all(query, params);
  res.json({ success: true, plants });
});

// Middleware for Admin-only access to configuration and management routes
router.use(authenticate, requireRole('SUPER_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT'));

router.post('/plants', requireRole('SUPER_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT'), (req, res) => {
  const { code, name, location } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'Plant Code and Plant Name are required' });
  }

  const cleanCode = code.toUpperCase().trim();
  const cleanName = name.trim();
  const cleanLoc = (location || '').trim();

  // If plant with this code already exists, update name and location gracefully!
  const existing = db.get('SELECT * FROM plants WHERE UPPER(code) = ?', [cleanCode]);
  if (existing) {
    db.run('UPDATE plants SET name = ?, location = ? WHERE id = ?', [cleanName, cleanLoc, existing.id]);
    auditLogFromReq(req, 'PLANT_UPDATED', 'PLANT', cleanCode, { plant_id: existing.id, name: cleanName, location: cleanLoc });
    return res.json({
      success: true,
      plantId: existing.id,
      message: `Plant [${cleanCode}] updated successfully with location "${cleanLoc}".`
    });
  }

  try {
    const r = db.run(
      'INSERT INTO plants (code, name, location) VALUES (?, ?, ?)',
      [cleanCode, cleanName, cleanLoc]
    );
    const newPlantId = r.lastInsertRowid;

    // Automatically create initial building, floor, and area hierarchy so QR codes can be created immediately
    const bldRes = db.run(
      'INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)',
      [newPlantId, 'BLD-MAIN', 'Main Plant Building']
    );
    const flRes = db.run(
      'INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, ?)',
      [bldRes.lastInsertRowid, 'FL-00', 'Ground Floor', 0]
    );
    db.run(
      'INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)',
      [flRes.lastInsertRowid, 'AREA-01', 'General Plant Area']
    );

    auditLogFromReq(req, 'PLANT_CREATED', 'PLANT', cleanCode, { plant_id: newPlantId, name: cleanName, location: cleanLoc });
    res.json({ success: true, plantId: newPlantId, message: 'Plant created successfully with initial location structure' });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Failed to create plant: ' + err.message });
  }
});

router.put('/plants/:id', requireRole('SUPER_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT'), (req, res) => {
  const { id } = req.params;
  const { code, name, location } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, error: 'Plant Code and Plant Name are required' });
  }

  const existing = db.get('SELECT * FROM plants WHERE id = ?', [id]);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Plant not found' });
  }

  try {
    db.run(
      'UPDATE plants SET code = ?, name = ?, location = ? WHERE id = ?',
      [code.toUpperCase().trim(), name.trim(), (location || '').trim(), id]
    );
    auditLogFromReq(req, 'PLANT_UPDATED', 'PLANT', code, { plant_id: id, name, location });
    res.json({ success: true, message: 'Plant location updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Failed to update plant: ' + err.message });
  }
});

router.delete('/plants/:id', requireRole('SUPER_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT'), (req, res) => {
  const { id } = req.params;
  const plant = db.get('SELECT * FROM plants WHERE id = ?', [id]);
  if (!plant) {
    return res.status(404).json({ success: false, error: 'Plant not found' });
  }

  try {
    db.run('DELETE FROM qr_codes WHERE toilet_id IN (SELECT id FROM toilets WHERE plant_id = ?)', [id]);
    db.run('DELETE FROM evidence_photos WHERE session_id IN (SELECT cs.id FROM cleaning_sessions cs JOIN toilets t ON cs.toilet_id = t.id WHERE t.plant_id = ?)', [id]);
    db.run('DELETE FROM checklist_responses WHERE session_id IN (SELECT cs.id FROM cleaning_sessions cs JOIN toilets t ON cs.toilet_id = t.id WHERE t.plant_id = ?)', [id]);
    db.run('DELETE FROM cleaning_sessions WHERE toilet_id IN (SELECT id FROM toilets WHERE plant_id = ?)', [id]);
    db.run('DELETE FROM supervisor_inspections WHERE toilet_id IN (SELECT id FROM toilets WHERE plant_id = ?)', [id]);
    db.run('DELETE FROM issues WHERE plant_id = ?', [id]);
    db.run('DELETE FROM drinking_water_checks WHERE plant_id = ?', [id]);
    db.run('DELETE FROM assignments WHERE toilet_id IN (SELECT id FROM toilets WHERE plant_id = ?)', [id]);
    db.run('DELETE FROM toilets WHERE plant_id = ?', [id]);
    db.run('DELETE FROM areas WHERE floor_id IN (SELECT f.id FROM floors f JOIN buildings b ON f.building_id = b.id WHERE b.plant_id = ?)', [id]);
    db.run('DELETE FROM floors WHERE building_id IN (SELECT b.id FROM buildings b WHERE b.plant_id = ?)', [id]);
    db.run('DELETE FROM buildings WHERE plant_id = ?', [id]);
    db.run('DELETE FROM shifts WHERE plant_id = ?', [id]);
    db.run('DELETE FROM plants WHERE id = ?', [id]);

    auditLogFromReq(req, 'PLANT_DELETED', 'PLANT', plant.code, { plant_id: id, name: plant.name });
    res.json({ success: true, message: `Plant ${plant.name} (${plant.code}) and its facilities were successfully deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete plant: ' + err.message });
  }
});

// ----------------- TOILETS -----------------
router.delete('/toilets/:id', requireRole('SUPER_ADMIN', 'PLANT_ADMIN', 'MANAGEMENT'), (req, res) => {
  const { id } = req.params;
  const toilet = db.get('SELECT * FROM toilets WHERE id = ?', [id]);
  if (!toilet) {
    return res.status(404).json({ success: false, error: 'Toilet facility not found' });
  }

  try {
    db.run('DELETE FROM qr_codes WHERE toilet_id = ?', [id]);
    db.run('DELETE FROM evidence_photos WHERE session_id IN (SELECT id FROM cleaning_sessions WHERE toilet_id = ?)', [id]);
    db.run('DELETE FROM checklist_responses WHERE session_id IN (SELECT id FROM cleaning_sessions WHERE toilet_id = ?)', [id]);
    db.run('DELETE FROM cleaning_sessions WHERE toilet_id = ?', [id]);
    db.run('DELETE FROM supervisor_inspections WHERE toilet_id = ?', [id]);
    db.run('DELETE FROM issues WHERE toilet_id = ?', [id]);
    db.run('DELETE FROM assignments WHERE toilet_id = ?', [id]);
    db.run('DELETE FROM toilets WHERE id = ?', [id]);

    auditLogFromReq(req, 'TOILET_DELETED', 'TOILET', toilet.code, {
      toilet_id: id,
      name: toilet.name,
      plant_id: toilet.plant_id
    });

    res.json({ success: true, message: `Facility QR ${toilet.code} successfully deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete facility: ' + err.message });
  }
});
router.get('/toilets', (req, res) => {
  let query = `
    SELECT t.*, p.name as plant_name, p.code as plant_code,
           b.name as building_name, f.name as floor_name, a.name as area_name
    FROM toilets t
    JOIN plants p ON t.plant_id = p.id
    JOIN areas a ON t.area_id = a.id
    JOIN floors f ON a.floor_id = f.id
    JOIN buildings b ON f.building_id = b.id
    WHERE 1=1
  `;
  const params = [];
  if (req.query.plantId) {
    query += ' AND t.plant_id = ?';
    params.push(req.query.plantId);
  } else if (req.user.plant_id && req.user.role === 'PLANT_ADMIN') {
    query += ' AND t.plant_id = ?';
    params.push(req.user.plant_id);
  }
  query += ' ORDER BY a.name ASC, t.code ASC';
  const toilets = db.all(query, params);
  res.json({ success: true, toilets });
});

router.post('/toilets', (req, res) => {
  const { plantId, areaId, areaName, code, name, gender = 'UNISEX' } = req.body;
  if (!plantId || (!areaId && !areaName) || !code || !name) {
    return res.status(400).json({ success: false, error: 'plantId, area (areaId or areaName), code and name are required' });
  }

  // Generate secure opaque token
  const qrToken = 'H360-QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  try {
    let targetAreaId = areaId;
    if (!targetAreaId && areaName) {
      let area = db.get(`
        SELECT a.id FROM areas a
        JOIN floors f ON a.floor_id = f.id
        JOIN buildings b ON f.building_id = b.id
        WHERE b.plant_id = ? AND LOWER(a.name) = LOWER(?)
      `, [plantId, areaName.trim()]);

      if (area) {
        targetAreaId = area.id;
      } else {
        let bld = db.get('SELECT id FROM buildings WHERE plant_id = ? LIMIT 1', [plantId]);
        if (!bld) {
          const bRes = db.run('INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)', [plantId, 'BLD-01', 'Main Facility']);
          bld = { id: bRes.lastInsertRowid };
        }
        let fl = db.get('SELECT id FROM floors WHERE building_id = ? LIMIT 1', [bld.id]);
        if (!fl) {
          const fRes = db.run('INSERT INTO floors (building_id, code, name, floor_number) VALUES (?, ?, ?, 0)', [bld.id, 'FL-00', 'Ground Floor']);
          fl = { id: fRes.lastInsertRowid };
        }
        const areaCode = 'AREA-' + Date.now().toString().slice(-4);
        const aRes = db.run('INSERT INTO areas (floor_id, code, name) VALUES (?, ?, ?)', [fl.id, areaCode, areaName.trim()]);
        targetAreaId = aRes.lastInsertRowid;
      }
    }

    const resToilet = db.run(`
      INSERT INTO toilets (plant_id, area_id, code, name, gender, qr_token, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
    `, [plantId, targetAreaId, code.toUpperCase().trim(), name.trim(), gender, qrToken]);

    const toiletId = resToilet.lastInsertRowid;
    db.run('INSERT INTO qr_codes (toilet_id, token, is_active) VALUES (?, ?, 1)', [toiletId, qrToken]);

    auditLogFromReq(req, 'TOILET_CREATED', 'TOILET', code, { toilet_id: toiletId, name });

    res.json({ success: true, toiletId, qrToken, message: 'Toilet created successfully with active opaque QR token' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------- USERS -----------------
router.get('/users', (req, res) => {
  let query = `
    SELECT u.id, u.employee_id, u.name, u.email, u.role, u.plant_id, u.phone, u.is_active, u.created_at,
           p.name as plant_name, p.code as plant_code, p.location as plant_location
    FROM users u
    LEFT JOIN plants p ON u.plant_id = p.id
    WHERE 1=1
  `;
  const params = [];
  if (req.user.plant_id && req.user.role === 'PLANT_ADMIN') {
    query += ' AND u.plant_id = ?';
    params.push(req.user.plant_id);
  }
  query += ' ORDER BY u.role, u.name ASC';
  const users = db.all(query, params);
  res.json({ success: true, users });
});

router.post('/users', async (req, res) => {
  const { employeeId, name, email, password, role, plantId, phone } = req.body;
  if (!employeeId || !name || !email || !role) {
    return res.status(400).json({ success: false, error: 'Missing required user fields' });
  }

  try {
    const finalPassword = (password && password.trim()) ? password.trim() : ('OTP_AUTH_' + crypto.randomBytes(8).toString('hex'));
    const passwordHash = await bcrypt.hash(finalPassword, 10);
    const result = db.run(`
      INSERT INTO users (employee_id, name, email, password_hash, role, plant_id, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [employeeId.trim(), name.trim(), email.trim().toLowerCase(), passwordHash, role, plantId || null, phone || '']);

    auditLogFromReq(req, 'USER_CREATED', 'USER', employeeId, { role, plantId });
    res.json({ success: true, userId: result.lastInsertRowid, message: 'User created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Email or Employee ID already exists: ' + err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { name, email, role, plantId, phone, password } = req.body;
  
  const existing = db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

  let normalizedRole = role || existing.role;
  if (normalizedRole === 'IT ADMIN' || normalizedRole === 'IT_ADMIN') normalizedRole = 'SUPER_ADMIN';
  if (normalizedRole === 'HOUSEKEEPING' || normalizedRole === 'HOUSEKEEPING_AGENT') normalizedRole = 'HOUSEKEEPING_AGENT';

  try {
    const finalPlantId = (plantId === 'all' || plantId === '' || plantId === null || plantId === undefined) ? null : Number(plantId);
    if (password && password.trim()) {
      const passwordHash = await bcrypt.hash(password.trim(), 10);
      db.run(`
        UPDATE users 
        SET name = ?, email = ?, role = ?, plant_id = ?, phone = ?, password_hash = ?
        WHERE id = ?
      `, [
        name ? name.trim() : existing.name,
        email ? email.trim().toLowerCase() : existing.email,
        normalizedRole,
        finalPlantId,
        phone !== undefined ? phone : existing.phone,
        passwordHash,
        userId
      ]);
    } else {
      db.run(`
        UPDATE users 
        SET name = ?, email = ?, role = ?, plant_id = ?, phone = ?
        WHERE id = ?
      `, [
        name ? name.trim() : existing.name,
        email ? email.trim().toLowerCase() : existing.email,
        normalizedRole,
        finalPlantId,
        phone !== undefined ? phone : existing.phone,
        userId
      ]);
    }

    auditLogFromReq(req, 'USER_UPDATED', 'USER', existing.employee_id, { role: normalizedRole, plant_id: finalPlantId });
    res.json({ success: true, message: 'User updated successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/users/:id/toggle-status', (req, res) => {
  const userId = req.params.id;
  const user = db.get('SELECT id, is_active, employee_id FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const newStatus = user.is_active ? 0 : 1;
  db.run('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, userId]);

  auditLogFromReq(req, 'USER_STATUS_TOGGLED', 'USER', user.employee_id, { newStatus });
  res.json({ success: true, is_active: newStatus, message: `User status changed to ${newStatus ? 'ACTIVE' : 'INACTIVE'}` });
});

router.delete('/users/:id', (req, res) => {
  const userId = req.params.id;
  const user = db.get('SELECT id, employee_id, name, role FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Prevent self deletion
  if (req.user && req.user.id === Number(userId)) {
    return res.status(400).json({ success: false, error: 'You cannot delete your own logged-in user account' });
  }

  try {
    // Delete related assignments
    db.run('DELETE FROM assignments WHERE user_id = ?', [userId]);
    // Delete user
    db.run('DELETE FROM users WHERE id = ?', [userId]);

    auditLogFromReq(req, 'USER_DELETED', 'USER', user.employee_id, { name: user.name, role: user.role });
    res.json({ success: true, message: `User "${user.name}" (${user.employee_id}) deleted successfully` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------- HIERARCHY: BUILDINGS, FLOORS, AREAS -----------------
router.get('/buildings', (req, res) => {
  const { plantId } = req.query;
  let query = 'SELECT b.*, p.name as plant_name FROM buildings b JOIN plants p ON b.plant_id = p.id WHERE 1=1';
  const params = [];
  if (plantId && plantId !== 'all') {
    query += ' AND b.plant_id = ?';
    params.push(Number(plantId));
  }
  query += ' ORDER BY b.name ASC';
  const buildings = db.all(query, params);
  res.json({ success: true, buildings });
});

router.post('/buildings', (req, res) => {
  const { plantId, code, name } = req.body;
  if (!plantId || !code || !name) {
    return res.status(400).json({ success: false, error: 'plantId, code, and name are required' });
  }
  try {
    const r = db.run('INSERT INTO buildings (plant_id, code, name) VALUES (?, ?, ?)', [plantId, code.toUpperCase().trim(), name.trim()]);
    res.json({ success: true, buildingId: r.lastInsertRowid, message: 'Building created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/blocks', (req, res) => {
  const { buildingId } = req.query;
  let query = 'SELECT bl.*, b.name as building_name FROM blocks bl JOIN buildings b ON bl.building_id = b.id WHERE 1=1';
  const params = [];
  if (buildingId) {
    query += ' AND bl.building_id = ?';
    params.push(Number(buildingId));
  }
  query += ' ORDER BY bl.name ASC';
  res.json({ success: true, blocks: db.all(query, params) });
});

router.post('/blocks', (req, res) => {
  const { buildingId, code, name } = req.body;
  if (!buildingId || !code || !name) {
    return res.status(400).json({ success: false, error: 'buildingId, code, and name are required' });
  }
  try {
    const r = db.run('INSERT INTO blocks (building_id, code, name) VALUES (?, ?, ?)', [Number(buildingId), code.toUpperCase().trim(), name.trim()]);
    auditLogFromReq(req, 'BLOCK_CREATED', 'BLOCK', code, { building_id: buildingId, name });
    res.json({ success: true, blockId: r.lastInsertRowid, message: 'Block created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message.includes('UNIQUE') ? 'A block with this code already exists in this building.' : err.message });
  }
});

router.get('/floors', (req, res) => {
  const { buildingId, blockId } = req.query;
  let query = `SELECT f.*, b.name as building_name, b.plant_id, p.name as plant_name, bl.name as block_name
               FROM floors f JOIN buildings b ON f.building_id = b.id JOIN plants p ON b.plant_id = p.id
               LEFT JOIN blocks bl ON f.block_id = bl.id WHERE 1=1`;
  const params = [];
  if (buildingId) {
    query += ' AND f.building_id = ?';
    params.push(Number(buildingId));
  }
  if (blockId) {
    query += ' AND f.block_id = ?';
    params.push(Number(blockId));
  }
  query += ' ORDER BY f.floor_number ASC, f.name ASC';
  const floors = db.all(query, params);
  res.json({ success: true, floors });
});

router.post('/floors', (req, res) => {
  const { buildingId, blockId, code, name, floorNumber = 0 } = req.body;
  if (!buildingId || !code || !name) {
    return res.status(400).json({ success: false, error: 'buildingId, code, and name are required' });
  }
  try {
    let finalCode = code.toUpperCase().trim();
    const block = blockId ? db.get('SELECT code FROM blocks WHERE id = ? AND building_id = ?', [Number(blockId), Number(buildingId)]) : null;
    if (blockId && !block) return res.status(400).json({ success: false, error: 'Selected block does not belong to this building' });
    // Floor codes are unique per building, so the same floor in two blocks gets the block code as prefix
    if (block && db.get('SELECT id FROM floors WHERE building_id = ? AND code = ?', [Number(buildingId), finalCode])) {
      finalCode = `${block.code}-${finalCode}`;
    }
    const r = db.run('INSERT INTO floors (building_id, block_id, code, name, floor_number) VALUES (?, ?, ?, ?, ?)',
      [buildingId, block ? Number(blockId) : null, finalCode, name.trim(), floorNumber]);
    res.json({ success: true, floorId: r.lastInsertRowid, message: 'Floor created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.get('/areas', (req, res) => {
  const { floorId } = req.query;
  let query = 'SELECT a.*, f.name as floor_name, b.name as building_name, b.plant_id, p.name as plant_name FROM areas a JOIN floors f ON a.floor_id = f.id JOIN buildings b ON f.building_id = b.id JOIN plants p ON b.plant_id = p.id WHERE 1=1';
  const params = [];
  if (floorId) {
    query += ' AND a.floor_id = ?';
    params.push(Number(floorId));
  }
  query += ' ORDER BY a.name ASC';
  const areas = db.all(query, params);
  res.json({ success: true, areas });
});

router.post('/areas', (req, res) => {
  const { floorId, code, name, assignedUserId } = req.body;
  if (!floorId || !code || !name) {
    return res.status(400).json({ success: false, error: 'floorId, code, and name are required' });
  }
  try {
    const r = db.run(
      'INSERT INTO areas (floor_id, code, name, assigned_user_id) VALUES (?, ?, ?, ?)',
      [floorId, code.toUpperCase().trim(), name.trim(), assignedUserId ? Number(assignedUserId) : null]
    );
    res.json({ success: true, areaId: r.lastInsertRowid, message: 'Area created successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ----------------- QR MASTER -----------------
router.get('/qr-master', (req, res) => {
  let query = `
    SELECT t.id, t.code, t.name, t.gender, t.status, t.qr_token, t.is_active, t.assigned_user_id,
           t.toilet_uid, t.urinal_count, t.wc_count, t.basin_count, t.drinking_water_nearby, t.supervisor_id, t.cleaning_frequency,
           p.id as plant_id, p.name as plant_name, p.code as plant_code,
           b.id as building_id, b.name as building_name,
           bl.id as block_id, bl.name as block_name,
           f.id as floor_id, f.name as floor_name,
           a.id as area_id, a.name as area_name,
           u_asn.name as assigned_user_name, u_asn.employee_id as assigned_user_emp_id,
           u_sup.name as supervisor_name, u_sup.employee_id as supervisor_emp_id,
           q.generated_at, q.regenerated_at
    FROM toilets t
    JOIN plants p ON t.plant_id = p.id
    JOIN areas a ON t.area_id = a.id
    JOIN floors f ON a.floor_id = f.id
    JOIN buildings b ON f.building_id = b.id
    LEFT JOIN blocks bl ON f.block_id = bl.id
    LEFT JOIN users u_asn ON t.assigned_user_id = u_asn.id
    LEFT JOIN users u_sup ON t.supervisor_id = u_sup.id
    LEFT JOIN qr_codes q ON t.id = q.toilet_id AND q.is_active = 1
    WHERE 1=1
  `;
  const params = [];
  if (req.user.plant_id && req.user.role === 'PLANT_ADMIN') {
    query += ' AND t.plant_id = ?';
    params.push(req.user.plant_id);
  }
  query += ' ORDER BY p.name, b.name, f.floor_number, t.code ASC';
  const qrMasterList = db.all(query, params);
  res.json({ success: true, qrList: qrMasterList });
});

router.post('/qr-master/generate-qr', (req, res) => {
  const { toiletId } = req.body;
  if (!toiletId) return res.status(400).json({ success: false, error: 'toiletId is required' });

  const toilet = db.get('SELECT * FROM toilets WHERE id = ?', [toiletId]);
  if (!toilet) return res.status(404).json({ success: false, error: 'Toilet not found' });

  // Invalidate previous active QR
  db.run('UPDATE qr_codes SET is_active = 0, disabled_at = CURRENT_TIMESTAMP WHERE toilet_id = ?', [toiletId]);

  // Generate cryptographically unique opaque token
  const newToken = 'H360-QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  db.run('UPDATE toilets SET qr_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newToken, toiletId]);
  db.run('INSERT INTO qr_codes (toilet_id, token, is_active, regenerated_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP)', [toiletId, newToken]);

  auditLogFromReq(req, 'QR_REASSIGNED', 'TOILET', toilet.code, {
    old_token_prefix: toilet.qr_token.slice(0, 10),
    new_token_prefix: newToken.slice(0, 10)
  });

  res.json({
    success: true,
    message: `Secure QR token regenerated and assigned to ${toilet.code}.`,
    token: newToken
  });
});

const CLEANING_FREQUENCIES = ['HOURLY', 'EVERY_2_HOURS', 'EVERY_4_HOURS', 'TWICE_A_SHIFT', 'ONCE_A_SHIFT', 'TWICE_A_DAY', 'ONCE_A_DAY'];

function toCount(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 0;
}

// Master fields shared by create and edit; returns { values, error }
function readToiletMaster(body) {
  const frequency = body.cleaningFrequency ? String(body.cleaningFrequency).toUpperCase() : null;
  if (frequency && !CLEANING_FREQUENCIES.includes(frequency)) {
    return { error: 'Invalid cleaning frequency' };
  }
  let supervisorId = null;
  if (body.supervisorId) {
    const sup = db.get('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [Number(body.supervisorId)]);
    if (!sup || !['SUPERVISOR', 'PLANT_ADMIN', 'SUPER_ADMIN', 'IT_ADMIN'].includes(sup.role)) {
      return { error: 'Selected supervisor is not an active supervisor or admin' };
    }
    supervisorId = sup.id;
  }
  return {
    values: {
      urinalCount: toCount(body.urinalCount),
      wcCount: toCount(body.wcCount),
      basinCount: toCount(body.basinCount),
      drinkingWaterNearby: body.drinkingWaterNearby === true || body.drinkingWaterNearby === 1 || body.drinkingWaterNearby === '1' || body.drinkingWaterNearby === 'true' ? 1 : 0,
      supervisorId,
      cleaningFrequency: frequency
    }
  };
}

function autoToiletUid(areaId, toiletCode, excludeId = null) {
  const loc = db.get(`
    SELECT p.code as plant_code, bl.code as block_code, b.code as building_code
    FROM areas a JOIN floors f ON a.floor_id = f.id JOIN buildings b ON f.building_id = b.id JOIN plants p ON b.plant_id = p.id
    LEFT JOIN blocks bl ON f.block_id = bl.id
    WHERE a.id = ?
  `, [areaId]);
  const base = db.buildToiletUid(loc ? loc.plant_code : '', loc ? (loc.block_code || loc.building_code) : '', toiletCode);
  return db.uniqueToiletUid(base, excludeId);
}

function normalizeToiletUid(raw) {
  const uid = String(raw || '').toUpperCase().trim().replace(/[^A-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return uid.startsWith('TOILET-') ? uid : (uid ? `TOILET-${uid}` : '');
}

router.post('/qr-master/create-facility', (req, res) => {
  const { plantId, areaId, code, name, gender = 'MALE', assignedUserId, toiletUid } = req.body;
  if (!plantId || !areaId || !code || !name) {
    return res.status(400).json({ success: false, error: 'Plant, Area, Toilet Code, and Toilet Name are required' });
  }
  if (!['MALE', 'FEMALE'].includes(String(gender).toUpperCase())) {
    return res.status(400).json({ success: false, error: 'Toilet type must be MALE or FEMALE' });
  }
  const master = readToiletMaster(req.body);
  if (master.error) return res.status(400).json({ success: false, error: master.error });

  const qrToken = 'H360-QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();

  try {
    const finalAssignedUserId = assignedUserId ? Number(assignedUserId) : null;
    const requestedUid = normalizeToiletUid(toiletUid);
    if (requestedUid && db.get('SELECT id FROM toilets WHERE toilet_uid = ?', [requestedUid])) {
      return res.status(400).json({ success: false, error: `Toilet ID ${requestedUid} is already used by another toilet` });
    }
    const finalUid = requestedUid || autoToiletUid(areaId, code);
    const m = master.values;
    const resToilet = db.run(`
      INSERT INTO toilets (plant_id, area_id, code, name, gender, qr_token, status, assigned_user_id, toilet_uid,
                           urinal_count, wc_count, basin_count, drinking_water_nearby, supervisor_id, cleaning_frequency)
      VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?)
    `, [plantId, areaId, code.toUpperCase().trim(), name.trim(), String(gender).toUpperCase(), qrToken, finalAssignedUserId, finalUid,
        m.urinalCount, m.wcCount, m.basinCount, m.drinkingWaterNearby, m.supervisorId, m.cleaningFrequency]);

    const toiletId = resToilet.lastInsertRowid;
    db.run('INSERT INTO qr_codes (toilet_id, token, is_active) VALUES (?, ?, 1)', [toiletId, qrToken]);

    if (finalAssignedUserId) {
      try {
        db.run(`
          INSERT OR REPLACE INTO assignments (user_id, toilet_id, assigned_date)
          VALUES (?, ?, DATE('now'))
        `, [finalAssignedUserId, toiletId]);
      } catch (e) {
        console.warn('Assignment notice:', e.message);
      }
    }

    auditLogFromReq(req, 'FACILITY_AND_QR_CREATED', 'TOILET', code, { toilet_id: toiletId, name, plant_id: plantId, assigned_user_id: finalAssignedUserId, toilet_uid: finalUid });

    res.json({
      success: true,
      toiletId,
      qrToken,
      toiletUid: finalUid,
      message: `Toilet ${finalUid} created. Print its QR placard from the list.`
    });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Failed to create facility: ' + err.message });
  }
});

// Edit toilet master information (Toilet ID, fixtures, drinking water, responsible person, supervisor, frequency)
router.put('/qr-master/:id/master', (req, res) => {
  const toiletId = Number(req.params.id);
  const toilet = db.get('SELECT * FROM toilets WHERE id = ?', [toiletId]);
  if (!toilet) return res.status(404).json({ success: false, error: 'Toilet not found' });
  if (req.user.role === 'PLANT_ADMIN' && req.user.plant_id && req.user.plant_id !== toilet.plant_id) {
    return res.status(403).json({ success: false, error: 'You can only edit toilets of your plant' });
  }

  const master = readToiletMaster(req.body);
  if (master.error) return res.status(400).json({ success: false, error: master.error });

  const name = req.body.name ? String(req.body.name).trim() : toilet.name;
  const gender = req.body.gender ? String(req.body.gender).toUpperCase() : toilet.gender;
  if (!['MALE', 'FEMALE', 'UNISEX', 'EXECUTIVE'].includes(gender)) {
    return res.status(400).json({ success: false, error: 'Invalid toilet type' });
  }

  let uid = toilet.toilet_uid;
  if (req.body.toiletUid !== undefined) {
    const requested = normalizeToiletUid(req.body.toiletUid);
    uid = requested || autoToiletUid(toilet.area_id, toilet.code, toiletId);
    if (db.get('SELECT id FROM toilets WHERE toilet_uid = ? AND id != ?', [uid, toiletId])) {
      return res.status(400).json({ success: false, error: `Toilet ID ${uid} is already used by another toilet` });
    }
  }

  let assignedUserId = toilet.assigned_user_id;
  if (req.body.assignedUserId !== undefined) {
    assignedUserId = null;
    if (req.body.assignedUserId) {
      const staff = db.get('SELECT id, role FROM users WHERE id = ? AND is_active = 1', [Number(req.body.assignedUserId)]);
      if (!staff || !['HOUSEKEEPING', 'HOUSEKEEPING_AGENT'].includes(staff.role)) {
        return res.status(400).json({ success: false, error: 'Responsible person must be an active housekeeping staff member' });
      }
      assignedUserId = staff.id;
    }
  }

  const m = master.values;
  db.run(`
    UPDATE toilets SET name = ?, gender = ?, toilet_uid = ?, assigned_user_id = ?, urinal_count = ?, wc_count = ?, basin_count = ?,
                       drinking_water_nearby = ?, supervisor_id = ?, cleaning_frequency = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, gender, uid, assignedUserId, m.urinalCount, m.wcCount, m.basinCount, m.drinkingWaterNearby, m.supervisorId, m.cleaningFrequency, toiletId]);

  if (assignedUserId !== toilet.assigned_user_id) {
    db.run("DELETE FROM assignments WHERE toilet_id = ? AND assigned_date = DATE('now')", [toiletId]);
    if (assignedUserId) {
      db.run("INSERT OR IGNORE INTO assignments (user_id, toilet_id, assigned_date) VALUES (?, ?, DATE('now'))", [assignedUserId, toiletId]);
    }
  }

  auditLogFromReq(req, 'TOILET_MASTER_UPDATED', 'TOILET', toilet.code, {
    toilet_id: toiletId,
    toilet_uid: uid,
    assigned_user_id: assignedUserId,
    ...m
  });

  res.json({ success: true, toiletUid: uid, message: `Master details of ${uid} saved.` });
});

// Change the housekeeper responsible for a toilet (one housekeeper can own many toilets)
router.patch('/qr-master/:id/assign', (req, res) => {
  const toiletId = Number(req.params.id);
  const { assignedUserId } = req.body;

  const toilet = db.get('SELECT * FROM toilets WHERE id = ?', [toiletId]);
  if (!toilet) return res.status(404).json({ success: false, error: 'Toilet not found' });

  let newUserId = null;
  let staff = null;
  if (assignedUserId) {
    staff = db.get("SELECT id, name, employee_id, role FROM users WHERE id = ? AND is_active = 1", [Number(assignedUserId)]);
    if (!staff || !['HOUSEKEEPING', 'HOUSEKEEPING_AGENT'].includes(staff.role)) {
      return res.status(400).json({ success: false, error: 'Selected user is not an active housekeeping staff member' });
    }
    newUserId = staff.id;
  }

  db.run('UPDATE toilets SET assigned_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newUserId, toiletId]);
  db.run("DELETE FROM assignments WHERE toilet_id = ? AND assigned_date = DATE('now')", [toiletId]);
  if (newUserId) {
    db.run("INSERT OR IGNORE INTO assignments (user_id, toilet_id, assigned_date) VALUES (?, ?, DATE('now'))", [newUserId, toiletId]);
  }

  auditLogFromReq(req, 'TOILET_STAFF_ASSIGNED', 'TOILET', toilet.code, {
    toilet_id: toiletId,
    from_user_id: toilet.assigned_user_id,
    to_user_id: newUserId
  });

  res.json({
    success: true,
    message: staff ? `${toilet.code} assigned to ${staff.name} (${staff.employee_id}).` : `${toilet.code} is now unassigned.`
  });
});

// ----------------- SHIFTS -----------------
router.get('/shifts', (req, res) => {
  const shifts = db.all('SELECT s.*, p.name as plant_name FROM shifts s JOIN plants p ON s.plant_id = p.id ORDER BY s.start_time ASC');
  res.json({ success: true, shifts });
});

// ----------------- SYSTEM SETTINGS -----------------
router.get('/settings', (req, res) => {
  const settings = db.all('SELECT * FROM system_settings');
  res.json({ success: true, settings });
});

router.post('/settings', requireRole('SUPER_ADMIN'), (req, res) => {
  const { key, value } = req.body;
  db.run(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `, [key, value]);
  auditLogFromReq(req, 'SETTING_UPDATED', 'SYSTEM', key, { value });
  res.json({ success: true, message: 'Setting updated successfully' });
});

// ----------------- WHATSAPP ALERTS -----------------
const WHATSAPP_KEYS = ['whatsapp_alert_missed', 'whatsapp_alert_late', 'whatsapp_alert_summary', 'whatsapp_summary_time'];

router.get('/whatsapp', (req, res) => {
  const whatsapp = require('../utils/whatsappService');
  const settings = {};
  db.all(`SELECT key, value FROM system_settings WHERE key IN (${WHATSAPP_KEYS.map(() => '?').join(',')})`, WHATSAPP_KEYS)
    .forEach(r => { settings[r.key] = r.value; });
  const plantId = req.user.plant_id || null;
  const recipients = db.all(`
    SELECT id, name, role, phone, plant_id FROM users
    WHERE is_active = 1 AND role IN ('SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN', 'PLANT_HEAD')
      ${plantId ? 'AND (plant_id = ? OR plant_id IS NULL)' : ''}
    ORDER BY role, name
  `, plantId ? [plantId] : []);
  const logs = db.all('SELECT id, user_id, phone, kind, message, status, error, created_at FROM whatsapp_log ORDER BY id DESC LIMIT 100');
  res.json({ success: true, provider: whatsapp.providerName(), settings, recipients, logs });
});

router.put('/whatsapp', requireRole('SUPER_ADMIN', 'PLANT_ADMIN'), (req, res) => {
  for (const key of WHATSAPP_KEYS) {
    if (req.body[key] === undefined) continue;
    let value = String(req.body[key]);
    if (key === 'whatsapp_summary_time') {
      if (!/^\d{2}:\d{2}$/.test(value)) return res.status(400).json({ success: false, error: 'Summary time must be HH:MM' });
    } else {
      value = value === '1' || value === 'true' ? '1' : '0';
    }
    db.run('UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?', [value, key]);
  }
  auditLogFromReq(req, 'WHATSAPP_SETTINGS_UPDATED', 'SETTINGS', 'whatsapp', req.body);
  res.json({ success: true });
});

router.post('/whatsapp/test', requireRole('SUPER_ADMIN', 'PLANT_ADMIN'), (req, res) => {
  const whatsapp = require('../utils/whatsappService');
  const plantId = req.body.plantId || req.user.plant_id;
  if (!plantId) return res.status(400).json({ success: false, error: 'Select a plant to send the test alert for.' });
  whatsapp.sendAlert(Number(plantId), 'TEST', `HYGIENE 360 — Test alert sent by ${req.user.name}. WhatsApp alerts are working.`);
  res.json({ success: true, message: 'Test alert queued. Check the log below in a few seconds.' });
});

module.exports = router;
