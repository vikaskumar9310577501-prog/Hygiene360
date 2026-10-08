const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const db = require('../database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditLogFromReq } = require('../middleware/audit');
const { applyWatermark } = require('../utils/watermark');
const { checkDuplicateEvidence, validateCheckSheetDate, getTodayFormatted } = require('../utils/ocrValidator');
const slotUtils = require('../utils/slots');
const location = require('../utils/location');
const whatsapp = require('../utils/whatsappService');
const { checkAgainstRefs, getToiletRefs } = require('../utils/cleanCheck');
const { validateSheetTicks } = require('../utils/sheetValidator');
const storage = require('../utils/storage');

async function sheetTickVerifyEnabled() {
  const row = await db.get("SELECT value FROM system_settings WHERE key = 'check_sheet_tick_verify'");
  return !row || row.value !== '0';
}

// Multer in-memory storage for watermark processing
const upload = multer({
  storage: multer.memoryStorage(),
  // imageBase64 arrives as a text field; multer's default 1MB fieldSize cut off larger photos mid-upload
  limits: { fileSize: 10 * 1024 * 1024, fieldSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are permitted for evidence.'));
    }
    cb(null, true);
  }
});

// A rejected cleaning stays open until a newer submission exists for the same toilet slot, or a redo of it
const OPEN_REJECTED_SQL = `
  cs.approval_status = 'REJECTED' AND NOT EXISTS (
    SELECT 1 FROM cleaning_sessions n
    WHERE n.id > cs.id AND n.status IN ('COMPLETED', 'REJECTED') AND (
      n.redo_of = cs.id OR
      (cs.slot_id IS NOT NULL AND n.toilet_id = cs.toilet_id AND n.slot_id = cs.slot_id AND n.slot_date = cs.slot_date)
    )
  )`;

// 1. Get Checklist Master Items
router.get('/checklist-items', async (req, res) => {
  const toilet = req.query.toiletId
    ? await db.get('SELECT id, gender FROM toilets WHERE id = ?', [req.query.toiletId])
    : null;
  const items = await slotUtils.getChecklistItemsForToilet(toilet);
  const grouped = {
    CLEANLINESS: items.filter(i => i.category === 'CLEANLINESS'),
    CONSUMABLES: items.filter(i => i.category === 'CONSUMABLES'),
    EQUIPMENT: items.filter(i => i.category === 'EQUIPMENT')
  };
  res.json({ success: true, items, grouped });
});

// Housekeeper marks the start of duty; recorded once per day in the audit trail
router.post('/shift-start', authenticate, async (req, res) => {
  const ist = slotUtils.istNow();
  const existing = await db.get(`
    SELECT created_at FROM audit_logs WHERE user_id = ? AND action = 'SHIFT_STARTED' AND entity_id = ?
    ORDER BY id DESC LIMIT 1
  `, [req.user.id, ist.date]);
  if (!existing) {
    await auditLogFromReq(req, 'SHIFT_STARTED', 'SHIFT', ist.date, { toilet_id: req.body.toiletId || null });
  }
  const row = existing || await db.get(`
    SELECT created_at FROM audit_logs WHERE user_id = ? AND action = 'SHIFT_STARTED' AND entity_id = ? ORDER BY id DESC LIMIT 1
  `, [req.user.id, ist.date]);
  res.json({ success: true, date: ist.date, startedAt: row ? row.created_at : null, alreadyStarted: !!existing });
});

router.get('/shift-status', authenticate, async (req, res) => {
  const ist = slotUtils.istNow();
  const row = await db.get(`
    SELECT created_at FROM audit_logs WHERE user_id = ? AND action = 'SHIFT_STARTED' AND entity_id = ? ORDER BY id DESC LIMIT 1
  `, [req.user.id, ist.date]);
  res.json({ success: true, date: ist.date, started: !!row, startedAt: row ? row.created_at : null });
});

// 2. Start / Initialize Cleaning Session
router.get('/slot-status/:toiletId', authenticate, async (req, res) => {
  const toiletIdNum = Number(req.params.toiletId);
  const toilet = Number.isInteger(toiletIdNum)
    ? await db.get('SELECT * FROM toilets WHERE id = ? AND is_active = 1', [toiletIdNum])
    : null;
  if (!toilet) return res.status(404).json({ success: false, error: 'Toilet not found or inactive' });
  const ist = slotUtils.istNow();
  const availability = await slotUtils.getSlotAvailability(toilet, ist);
  let slot = null;
  if (!availability.blocked) {
    const resolved = await slotUtils.resolveSlotForCleaning(toilet, ist);
    if (resolved.slot) {
      slot = { ...resolved.slot, range: slotUtils.slotRange(resolved.slot), late: resolved.late };
    }
  }
  res.json({ success: true, ...availability, slot });
});

router.post('/start', authenticate, requireRole('HOUSEKEEPING_AGENT', 'SUPER_ADMIN', 'PLANT_ADMIN'), async (req, res) => {
  const { toiletId } = req.body;
  if (!toiletId) {
    return res.status(400).json({ success: false, error: 'toiletId is required' });
  }

  const toilet = await db.get(`
    SELECT t.*, p.name as plant_name 
    FROM toilets t 
    JOIN plants p ON t.plant_id = p.id 
    WHERE t.id = ? AND t.is_active = 1
  `, [toiletId]);

  if (!toilet) {
    return res.status(404).json({ success: false, error: 'Toilet not found or inactive' });
  }

  const isHousekeeper = req.user.role === 'HOUSEKEEPING_AGENT' || req.user.role === 'HOUSEKEEPING';

  // Redo of a rejected entry: keeps the original slot and time, so it is allowed outside the slot window
  let redoSource = null;
  if (req.body.redoOf) {
    redoSource = await db.get(`SELECT cs.* FROM cleaning_sessions cs WHERE cs.id = ? AND cs.toilet_id = ? AND ${OPEN_REJECTED_SQL}`, [Number(req.body.redoOf) || 0, toilet.id]);
    if (!redoSource) {
      return res.status(400).json({ success: false, code: 'REDO_CLOSED', error: 'This rejected cleaning has already been resubmitted.' });
    }
    if (isHousekeeper && redoSource.user_id !== req.user.id) {
      return res.status(403).json({ success: false, code: 'NOT_ASSIGNED', error: 'You can only redo your own rejected cleanings.' });
    }
  }

  const ist = slotUtils.istNow();
  let activeSlot = null;
  if (redoSource) {
    activeSlot = redoSource.slot_id
      ? { id: redoSource.slot_id, label: redoSource.slot_label, start_time: redoSource.slot_start, end_time: redoSource.slot_end }
      : null;
  } else {
    const availability = await slotUtils.getSlotAvailability(toilet, ist);
    if (availability.blocked) {
      return res.status(409).json({ success: false, ...availability });
    }
    activeSlot = (await slotUtils.resolveSlotForCleaning(toilet, ist)).slot;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // Every QR scan starts a brand new fresh cleaning round
  const randomSuffix = String(Math.floor(10000 + Math.random() * 90000));
  const sessionCode = `H360-${todayStr.replace(/-/g, '')}-${randomSuffix}`;
  const startTime = now.toISOString().replace('T', ' ').slice(0, 19);

  const insertRes = await db.run(`
    INSERT INTO cleaning_sessions (session_code, toilet_id, user_id, date, start_time, status,
                                   slot_id, slot_date, slot_label, slot_start, slot_end, redo_of)
    VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?, ?, ?, ?)
  `, [
    sessionCode, toiletId, req.user.id, todayStr, startTime,
    activeSlot ? activeSlot.id : null,
    redoSource ? (redoSource.slot_date || ist.date) : ist.date,
    activeSlot ? activeSlot.label : null,
    activeSlot ? activeSlot.start_time : null,
    activeSlot ? activeSlot.end_time : null,
    redoSource ? redoSource.id : null
  ]);

  const newSessionId = insertRes.lastInsertRowid;

  await auditLogFromReq(req, 'CLEANING_STARTED', 'TOILET', toilet.code, {
    session_id: newSessionId,
    session_code: sessionCode,
    start_time: startTime,
    slot: activeSlot ? `${activeSlot.label} (${activeSlot.start_time}-${activeSlot.end_time})` : null,
    redo_of: redoSource ? redoSource.id : null
  });

  const session = await db.get('SELECT * FROM cleaning_sessions WHERE id = ?', [newSessionId]);
  const slotLate = !redoSource && !!activeSlot && ist.minutes >= slotUtils.toMinutes(activeSlot.end_time);

  res.json({
    success: true,
    alreadyCompleted: false,
    session,
    slot: activeSlot ? { ...activeSlot, range: slotUtils.slotRange(activeSlot), late: slotLate } : null,
    message: `Cleaning session started for ${toilet.name}.`
  });
});

// 3. Upload & Validate Live Evidence Photo (Camera enforcement + Duplicate check + OCR check-sheet date check + Watermark)
router.post('/upload-evidence', authenticate, upload.single('photo'), async (req, res) => {
  try {
    const { sessionId, photoType, isLiveCamera } = req.body;

    if (!sessionId || !photoType) {
      return res.status(400).json({ success: false, error: 'sessionId and photoType are required' });
    }

    const isItemPhoto = photoType.startsWith('ITEM_');
    const validStandardTypes = ['CLEANING_EVIDENCE', 'TOILET_CONDITION', 'CHECK_SHEET', 'ISSUE_EVIDENCE', 'RESOLUTION_EVIDENCE'];
    if (!validStandardTypes.includes(photoType) && !isItemPhoto) {
      return res.status(400).json({ success: false, error: 'Invalid photoType' });
    }

    // MANDATORY SECURITY RULE: Disallow gallery upload for official cleaning evidence
    const isLive = isLiveCamera === 'true' || isLiveCamera === true || isLiveCamera === '1';
    if (!isLive) {
      await auditLogFromReq(req, 'EVIDENCE_REJECTED', 'CLEANING_SESSION', sessionId, {
        reason: 'Gallery upload attempted for official cleaning evidence',
        photoType
      });
      return res.status(403).json({
        success: false,
        error: 'GALLERY UPLOAD REJECTED: Mandatory cleaning evidence must be captured directly using the live camera.'
      });
    }

    let imageBuffer = null;
    let originalFilename = 'live_capture.jpg';

    if (req.file) {
      imageBuffer = req.file.buffer;
      originalFilename = req.file.originalname;
    } else if (req.body.imageBase64) {
      const base64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({ success: false, error: 'No image data received' });
    }

    // Fetch session and toilet details
    const session = await db.get(`
      SELECT cs.*, t.code as toilet_code, t.name as toilet_name, t.plant_id as plant_id, p.name as plant_name
      FROM cleaning_sessions cs
      JOIN toilets t ON cs.toilet_id = t.id
      JOIN plants p ON t.plant_id = p.id
      WHERE cs.id = ?
    `, [sessionId]);

    if (!session) {
      return res.status(404).json({ success: false, error: 'Cleaning session not found' });
    }

    // ANTI-FRAUD RULE 1: Duplicate evidence check via SHA-256 hash
    const rawHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const duplicateCheck = await checkDuplicateEvidence(rawHash, session.id, photoType);
    if (duplicateCheck.isDuplicate) {
      await auditLogFromReq(req, 'EVIDENCE_REJECTED', 'CLEANING_SESSION', sessionId, {
        reason: 'Duplicate image hash detected',
        photoType,
        hash: rawHash
      });
      return res.status(400).json({
        success: false,
        error: duplicateCheck.message
      });
    }

    let cleanCheck = null;
    if (photoType === 'CLEANING_EVIDENCE') {
      const refs = await getToiletRefs(session.toilet_id, 'TOILET');
      if (refs.length > 0) {
        const startedAt = Date.now();
        cleanCheck = await checkAgainstRefs(imageBuffer, refs.map(r => r.image_url));
        console.log(`[clean-check] session ${sessionId}: ${cleanCheck.passed ? 'PASS' : cleanCheck.code} scene=${cleanCheck.sceneScore} clean=${cleanCheck.cleanScore} in ${Date.now() - startedAt}ms`);
        if (!cleanCheck.passed) {
          // Low scores are saved and flagged for supervisor review instead of forcing a retake;
          // only a photo of a completely different place is refused
          const floorRow = await db.get("SELECT value FROM system_settings WHERE key = 'clean_check_hard_min_scene'");
          const hardMinScene = floorRow && Number.isFinite(Number(floorRow.value)) ? Number(floorRow.value) : 10;
          const details = { code: cleanCheck.code, cleanScore: cleanCheck.cleanScore, sceneScore: cleanCheck.sceneScore };
          if (cleanCheck.sceneScore != null && cleanCheck.sceneScore < hardMinScene) {
            await auditLogFromReq(req, 'CLEAN_CHECK_REJECTED', 'CLEANING_SESSION', sessionId, details);
            return res.status(422).json({ success: false, code: cleanCheck.code, error: cleanCheck.message, cleanCheck });
          }
          await auditLogFromReq(req, 'CLEAN_CHECK_FLAGGED', 'CLEANING_SESSION', sessionId, details);
          cleanCheck = { ...cleanCheck, passed: true, flagged: true, message: 'Photo saved. Marked for supervisor review (low match with the reference).' };
        }
      }
    }

    let ocrDetectedDate = null;
    let sheetCheck = null;
    const tickVerify = photoType === 'CHECK_SHEET' && await sheetTickVerifyEnabled();
    if (tickVerify) {
      const startedAt = Date.now();
      let result;
      try {
        result = await validateSheetTicks(imageBuffer, { slotStart: session.slot_start });
      } catch (e) {
        console.error('Check sheet reader error:', e);
        result = { valid: false, code: 'SHEET_NOT_READ', message: 'Check sheet could not be read. Please retake the photo.' };
      }
      console.log(`[sheet-ticks] session ${sessionId}: ${result.valid ? 'VALID' : result.code} ${result.date || ''} ${result.slot || ''} items=${result.itemsTicked ?? '-'}/${result.itemsTotal ?? '-'} in ${Date.now() - startedAt}ms`);
      if (!result.valid) {
        await auditLogFromReq(req, 'CHECK_SHEET_REJECTED', 'CLEANING_SESSION', sessionId, { code: result.code, reason: result.message });
        return res.status(422).json({ success: false, code: result.code, error: result.message, sheetCheck: result });
      }
      ocrDetectedDate = `${result.date} ${result.slot}`;
      sheetCheck = {
        dateVerified: true,
        detectedDate: result.date,
        detectedTime: result.slot,
        itemsTicked: result.itemsTicked,
        itemsTotal: result.itemsTotal,
        message: result.message
      };
    }

    // ANTI-FRAUD RULE 2: Old Check-sheet Protection with Date OCR
    if (photoType === 'CHECK_SHEET' && !tickVerify) {
      const ocrResult = await validateCheckSheetDate(imageBuffer);
      if (!ocrResult.valid) {
        await auditLogFromReq(req, 'CHECK_SHEET_REJECTED', 'CLEANING_SESSION', sessionId, {
          reason: ocrResult.message,
          detectedDate: ocrResult.detectedDate,
          detectedTime: ocrResult.detectedTime,
          expectedDate: ocrResult.expectedDate
        });
        return res.status(400).json({
          success: false,
          error: ocrResult.message,
          detectedDate: ocrResult.detectedDate,
          detectedTime: ocrResult.detectedTime,
          expectedDate: ocrResult.expectedDate
        });
      }
      ocrDetectedDate = ocrResult.detectedDate
        ? `${ocrResult.detectedDate}${ocrResult.detectedTime ? ` ${ocrResult.detectedTime}` : ''}`
        : null;
      sheetCheck = {
        dateVerified: ocrResult.dateVerified,
        detectedDate: ocrResult.detectedDate,
        detectedTime: ocrResult.detectedTime
      };
    }

    // Apply Server Watermark with official server-controlled time
    const PHOTO_TYPE_LABELS = { CLEANING_EVIDENCE: 'LIVE TOILET PHOTO', CHECK_SHEET: 'CHECKSHEET' };
    const wmMeta = location.watermarkMeta(await location.getToiletContext(session.toilet_id), {
      photoType: PHOTO_TYPE_LABELS[photoType] || photoType.replace(/_/g, ' '),
      reference: session.session_code,
      user: req.user
    });
    const serverTimestampStr = wmMeta.serverTimestampStr;
    const watermarked = await applyWatermark(imageBuffer, wmMeta);

    const fileName = `H360_${session.session_code}_${photoType}_${Date.now()}.jpg`;
    const storagePath = `/uploads/evidence/${fileName}`;
    await storage.save(storagePath, watermarked.buffer, 'image/jpeg');
    const capturedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Remove any previous photo for this session and photoType
    await db.run('DELETE FROM evidence_photos WHERE session_id = ? AND photo_type = ?', [sessionId, photoType]);

    // Insert into evidence_photos table
    const photoRes = await db.run(`
      INSERT INTO evidence_photos (
        session_id, photo_type, storage_path, original_filename, image_hash,
        captured_at, is_rejected, ocr_detected_date, is_live_camera, uploaded_by, clean_score, scene_score
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `, [
      sessionId,
      photoType,
      storagePath,
      originalFilename,
      rawHash,
      capturedAt,
      ocrDetectedDate,
      isLive ? 1 : 0,
      req.user.id,
      cleanCheck && cleanCheck.checked && cleanCheck.cleanScore != null ? cleanCheck.cleanScore : null,
      cleanCheck && cleanCheck.checked ? cleanCheck.sceneScore : null
    ]);

    await auditLogFromReq(req, 'EVIDENCE_UPLOADED', 'CLEANING_SESSION', sessionId, {
      photo_id: photoRes.lastInsertRowid,
      photo_type: photoType,
      hash: watermarked.finalHash.slice(0, 16)
    });

    res.json({
      success: true,
      photoId: photoRes.lastInsertRowid,
      photoType,
      storagePath,
      capturedAt,
      serverTimestampStr,
      hash: watermarked.finalHash,
      ocrDetectedDate,
      sheetCheck,
      cleanCheck,
      message: `${photoType.replace(/_/g, ' ')} successfully captured, watermarked and verified.`
    });
  } catch (err) {
    console.error('Evidence upload error:', err);
    res.status(500).json({ success: false, error: 'Internal server error during evidence processing: ' + err.message });
  }
});

// 4. Submit Completed Cleaning Session
router.post('/submit', authenticate, requireRole('HOUSEKEEPING_AGENT', 'SUPER_ADMIN', 'PLANT_ADMIN'), async (req, res) => {
  const { sessionId, checklistResponses = [], remarks = '' } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'sessionId is required' });
  }

  const session = await db.get(`
    SELECT cs.*, t.code as toilet_code, t.name as toilet_name, t.plant_id, t.gender as toilet_gender,
           (SELECT name FROM plants WHERE id = t.plant_id) as plant_name
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    WHERE cs.id = ?
  `, [sessionId]);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }

  if (session.status === 'COMPLETED') {
    return res.status(400).json({ success: false, error: 'Session has already been submitted and completed' });
  }

  // Someone submitted this slot meanwhile: move this cleaning to the next open slot instead of blocking it
  if (session.slot_id && !session.redo_of) {
    const alreadyDone = await slotUtils.getSlotDoneSession(session.toilet_id, session.slot_id, session.slot_date);
    if (alreadyDone && alreadyDone.id !== session.id) {
      const moved = (await slotUtils.resolveSlotForCleaning({ id: session.toilet_id, plant_id: session.plant_id })).slot;
      await db.run('UPDATE cleaning_sessions SET slot_id = ?, slot_label = ?, slot_start = ?, slot_end = ? WHERE id = ?',
        [moved ? moved.id : null, moved ? moved.label : null, moved ? moved.start_time : null, moved ? moved.end_time : null, sessionId]);
      Object.assign(session, {
        slot_id: moved ? moved.id : null,
        slot_label: moved ? moved.label : null,
        slot_start: moved ? moved.start_time : null,
        slot_end: moved ? moved.end_time : null
      });
    }
  }

  // VALIDATION 1: Check mandatory 3 live photos
  const uploadedPhotos = await db.all(`
    SELECT photo_type FROM evidence_photos 
    WHERE session_id = ? AND is_rejected = 0
  `, [sessionId]);

  const photoTypes = new Set(uploadedPhotos.map(p => p.photo_type));
  if (!photoTypes.has('CLEANING_EVIDENCE')) {
    return res.status(400).json({
      success: false,
      error: 'Missing mandatory evidence: Live photo with date and time. Please capture it before submitting.'
    });
  }
  if (!photoTypes.has('CHECK_SHEET')) {
    return res.status(400).json({
      success: false,
      error: 'Missing mandatory evidence: Physical Check-Sheet Photo. Software requires a clear live photo of the check-sheet with verified date and time before submitting.'
    });
  }

  // The physical check sheet photo is the checklist; in-app point responses are optional
  const allMasterItems = await slotUtils.getChecklistItemsForToilet({ gender: session.toilet_gender });
  const responseMap = {};
  for (const r of Array.isArray(checklistResponses) ? checklistResponses : []) {
    responseMap[r.itemId] = r;
  }
  const answeredItems = allMasterItems.filter(item => responseMap[item.id]);

  let passedCount = 0;
  let failedCount = 0;

  await db.run('DELETE FROM checklist_responses WHERE session_id = ?', [sessionId]);

  for (const item of answeredItems) {
    const resp = responseMap[item.id];
    const status = resp.status === 'FAIL' ? 'FAIL' : 'PASS';
    const failReason = status === 'FAIL' ? (resp.failReason || 'Inspection standard not met') : null;
    if (status === 'PASS') passedCount++;
    else failedCount++;

    await db.run(`
      INSERT INTO checklist_responses (session_id, item_id, item_label, category, status, fail_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [sessionId, item.id, item.label, item.category, status, failReason]);
  }

  const totalItems = answeredItems.length;
  const score = totalItems > 0 ? Number(((passedCount / totalItems) * 100).toFixed(1)) : null;
  const submitTime = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const ist = slotUtils.istNow();
  const redoSource = session.redo_of ? await db.get('SELECT submitted_late FROM cleaning_sessions WHERE id = ?', [session.redo_of]) : null;
  // A redo keeps the timing of the rejected entry it replaces
  const submittedLate = redoSource ? (redoSource.submitted_late ? 1 : 0) : (session.slot_end && (
    ist.date > session.slot_date ||
    (ist.date === session.slot_date && ist.minutes >= slotUtils.toMinutes(session.slot_end))
  ) ? 1 : 0);

  // A submitted cleaning is final — no admin approval step
  await db.run(`
    UPDATE cleaning_sessions
    SET status = 'COMPLETED',
        approval_status = 'APPROVED',
        approved_by_name = 'AUTO',
        approved_at = CURRENT_TIMESTAMP,
        submitted_late = ?,
        submit_time = ?,
        server_received_at = CURRENT_TIMESTAMP,
        checklist_score = ?,
        total_items = ?,
        passed_items = ?,
        failed_items = ?,
        remarks = ?
    WHERE id = ?
  `, [submittedLate, submitTime, score, totalItems, passedCount, failedCount, remarks, sessionId]);

  if (submittedLate && !session.redo_of) {
    const slotRangeText = slotUtils.slotRange({ start_time: session.slot_start, end_time: session.slot_end });
    const minutesLate = ist.date === session.slot_date ? Math.max(0, ist.minutes - slotUtils.toMinutes(session.slot_end)) : null;
    const lateText = `Late cleaning: ${session.toilet_code} ${session.toilet_name}, slot ${session.slot_label} (${slotRangeText}), submitted ${slotUtils.formatTime12(`${String(Math.floor(ist.minutes / 60)).padStart(2, '0')}:${String(ist.minutes % 60).padStart(2, '0')}`)} by ${req.user.name} (${req.user.employee_id || '-'})${minutesLate !== null ? ` — ${minutesLate} min late` : ''}.`;
    for (const admin of await slotUtils.getPlantAdminRecipients(session.plant_id)) {
      await slotUtils.notify(admin.id, 'Late Cleaning Submitted', lateText, 'LATE_SUBMIT',
        { session_id: Number(sessionId), toilet_code: session.toilet_code, slot_label: session.slot_label || null });
    }
    await whatsapp.sendAlert(session.plant_id, 'LATE', `HYGIENE 360 ALERT — ${lateText} Plant: ${session.plant_name || ''}.`);
  }

  // A redo answers the admin's issue on the original entry: the issue now waits for the admin's review
  let redoIssue = null;
  if (session.redo_of) {
    redoIssue = await db.get(`
      SELECT id, ticket_no, status FROM issues
      WHERE source_session_id = ? AND complaint_type = 'CLEANING_AUDIT' AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED')
      ORDER BY id DESC LIMIT 1
    `, [session.redo_of]);
    if (redoIssue) {
      const livePhoto = await db.get("SELECT storage_path FROM evidence_photos WHERE session_id = ? AND photo_type = 'CLEANING_EVIDENCE' ORDER BY id DESC LIMIT 1", [sessionId]);
      await db.run(`
        UPDATE issues SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP, resolution_photo_path = ?,
               resolution_remarks = ?, source_session_id = ?
        WHERE id = ?
      `, [livePhoto ? livePhoto.storage_path : null, `Cleaning re-done (${session.session_code}). Waiting for admin review.`, Number(sessionId), redoIssue.id]);
      await db.run(`
        INSERT INTO issue_updates (issue_id, user_id, from_status, to_status, remarks, evidence_photo_path)
        VALUES (?, ?, ?, 'RESOLVED', ?, ?)
      `, [redoIssue.id, req.user.id, redoIssue.status, `Cleaning re-done with a new live photo and check sheet (${session.session_code}).`, livePhoto ? livePhoto.storage_path : null]);
      await db.run('UPDATE cleaning_sessions SET issue_id = ? WHERE id = ?', [redoIssue.id, sessionId]);
    }
  }

  await auditLogFromReq(req, 'CLEANING_SUBMITTED', 'CLEANING_SESSION', sessionId, {
    toilet_code: session.toilet_code,
    score,
    passed_items: passedCount,
    failed_items: failedCount
  });

  const plantSlots = await slotUtils.getToiletSlots({ id: session.toilet_id, plant_id: session.plant_id });
  const nextSlot = session.slot_end
    ? slotUtils.findNextSlot(plantSlots, Math.max(ist.minutes, slotUtils.toMinutes(session.slot_end) - 1))
    : slotUtils.findNextSlot(plantSlots, ist.minutes);

  res.json({
    success: true,
    message: `Cleaning done for ${session.toilet_name}.`,
    session: {
      id: sessionId,
      sessionCode: session.session_code,
      status: 'COMPLETED',
      approvalStatus: 'APPROVED',
      score,
      totalItems,
      passedItems: passedCount,
      failedItems: failedCount,
      submitTime,
      submittedLate: !!submittedLate,
      slotLabel: session.slot_label || null,
      slotRange: session.slot_start ? slotUtils.slotRange({ start_time: session.slot_start, end_time: session.slot_end }) : null,
      redoOf: session.redo_of || null
    },
    redoIssue: redoIssue ? { id: redoIssue.id, ticketNo: redoIssue.ticket_no } : null,
    nextSlot: nextSlot ? { id: nextSlot.id, label: nextSlot.label, start_time: nextSlot.start_time, end_time: nextSlot.end_time, range: slotUtils.slotRange(nextSlot) } : null
  });
});

// Housekeeper view: today's slots (area-wise, falling back to plant defaults) for each of my assigned toilets
router.get('/my-slots', authenticate, async (req, res) => {
  const ist = slotUtils.istNow();
  const isHousekeeper = req.user.role === 'HOUSEKEEPING_AGENT' || req.user.role === 'HOUSEKEEPING';

  let toilets;
  if (isHousekeeper) {
    toilets = await db.all(`
      SELECT t.id, t.code, t.name, t.gender, t.plant_id, t.area_id, a.name as area_name FROM toilets t
      LEFT JOIN areas a ON t.area_id = a.id
      WHERE t.is_active = 1 AND t.plant_id = ?
      ORDER BY t.code
    `, [req.user.plant_id || -1]);
  } else {
    toilets = req.user.plant_id
      ? await db.all(`
          SELECT t.id, t.code, t.name, t.gender, t.plant_id, t.area_id, a.name as area_name FROM toilets t
          LEFT JOIN areas a ON t.area_id = a.id
          WHERE t.is_active = 1 AND t.plant_id = ? ORDER BY t.code
        `, [req.user.plant_id])
      : [];
  }

  const fmt = s => s ? { ...s, range: slotUtils.slotRange(s), minutes_left: slotUtils.toMinutes(s.end_time) - ist.minutes, starts_in: slotUtils.toMinutes(s.start_time) - ist.minutes } : null;

  const allSlots = new Map();
  const rows = [];
  for (const t of toilets) {
    const slots = await slotUtils.getToiletSlots(t);
    slots.forEach(s => allSlots.set(s.id, s));
    const current = slotUtils.findCurrentSlot(slots, ist.minutes);
    const cells = [];
    for (const s of slots) {
      const sess = await slotUtils.getLatestSlotSession(t.id, s.id, ist.date);
      cells.push({
        slot_id: s.id,
        status: slotUtils.computeCellStatus(s, sess, ist.date, ist),
        submit_time: sess && sess.status === 'COMPLETED' ? sess.submit_time : null,
        approved_at: sess ? sess.approved_at : null,
        approval_remarks: sess ? sess.approval_remarks : null
      });
    }
    rows.push({
      ...t,
      current_slot_id: current ? current.id : null,
      cells
    });
  }

  const slots = [...allSlots.values()].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const currents = slots.filter(s => rows.some(r => r.current_slot_id === s.id));
  const current = currents.sort((a, b) => a.end_time.localeCompare(b.end_time))[0] || null;
  const next = slotUtils.findNextSlot(slots, ist.minutes);

  res.json({
    success: true,
    date: ist.date,
    nowMinutes: ist.minutes,
    slots: slots.map(fmt),
    currentSlot: fmt(current),
    nextSlot: fmt(next),
    toilets: rows
  });
});

// Housekeeper: rejected cleanings that still need to be fixed and resubmitted
router.get('/my-rejected', authenticate, async (req, res) => {
  const list = await db.all(`
    SELECT cs.id, cs.session_code, cs.toilet_id, cs.slot_id, cs.slot_date, cs.slot_label, cs.slot_start, cs.slot_end,
           cs.submit_time, cs.checklist_score, cs.approval_remarks, cs.approved_by_name, cs.approved_at,
           t.code as toilet_code, t.name as toilet_name, t.gender as toilet_gender, t.plant_id,
           p.name as plant_name, a.name as area_name, f.name as floor_name, b.name as building_name,
           (SELECT COUNT(*) FROM evidence_photos ep WHERE ep.session_id = cs.id AND ep.is_rejected = 0) as photo_count
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN areas a ON t.area_id = a.id
    LEFT JOIN floors f ON a.floor_id = f.id
    LEFT JOIN buildings b ON f.building_id = b.id
    WHERE cs.user_id = ? AND ${OPEN_REJECTED_SQL}
    ORDER BY cs.approved_at DESC, cs.id DESC
    LIMIT 100
  `, [req.user.id]);
  res.json({ success: true, rejected: list });
});

// Housekeeper: my submitted cleanings with their approval result
router.get('/my-history', authenticate, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 60);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const list = await db.all(`
    SELECT cs.id, cs.session_code, COALESCE(cs.slot_date, cs.date) as day, cs.slot_label, cs.slot_start, cs.slot_end,
           cs.submit_time, cs.status, cs.approval_status, cs.approved_by_name, cs.approved_at, cs.approval_remarks,
           cs.checklist_score, cs.submitted_late, cs.redo_of, cs.start_time, cs.is_fake_audit_flagged,
           t.code as toilet_code, t.name as toilet_name, t.toilet_uid, a.name as area_name
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    LEFT JOIN areas a ON t.area_id = a.id
    WHERE cs.user_id = ? AND cs.status IN ('COMPLETED', 'REJECTED') AND COALESCE(cs.slot_date, cs.date) >= ?
    ORDER BY day DESC, cs.slot_start DESC, cs.submit_time DESC, cs.id DESC
    LIMIT 200
  `, [req.user.id, since]);
  res.json({ success: true, history: list });
});

// 5. Get Today's Cleaning Overview / List
router.get('/today', authenticate, async (req, res) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  let query = `
    SELECT cs.*, t.code as toilet_code, t.name as toilet_name, t.gender as toilet_gender,
           p.name as plant_name, p.code as plant_code, u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.date = ?
  `;
  const params = [todayStr];

  if (req.user.plant_id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'MANAGEMENT') {
    query += ' AND t.plant_id = ?';
    params.push(req.user.plant_id);
  }

  if (req.user.role === 'HOUSEKEEPING_AGENT') {
    query += ' AND cs.user_id = ?';
    params.push(req.user.id);
  }

  query += ' ORDER BY cs.submit_time DESC, cs.id DESC';

  const sessions = await db.all(query, params);
  res.json({ success: true, sessions });
});

// 6. Get Single Session Details with Responses and Evidence
router.get('/session/:id', authenticate, async (req, res) => {
  const sessionId = req.params.id;
  const session = await db.get(`
    SELECT cs.*, t.code as toilet_code, t.name as toilet_name, t.gender as toilet_gender, t.toilet_uid,
           p.name as plant_name, p.code as plant_code, a.name as area_name,
           u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    JOIN toilets t ON cs.toilet_id = t.id
    JOIN plants p ON t.plant_id = p.id
    LEFT JOIN areas a ON t.area_id = a.id
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.id = ?
  `, [sessionId]);

  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  const isHousekeeper = req.user.role === 'HOUSEKEEPING_AGENT' || req.user.role === 'HOUSEKEEPING';
  if (isHousekeeper && session.user_id !== req.user.id) {
    return res.status(403).json({ success: false, error: 'You can only view your own cleanings.' });
  }
  session.issue = session.issue_id
    ? (await db.get('SELECT id, ticket_no, status FROM issues WHERE id = ?', [session.issue_id])) || null
    : null;

  const responses = await db.all(`
    SELECT cr.*, ci.order_num 
    FROM checklist_responses cr
    LEFT JOIN checklist_items ci ON cr.item_id = ci.id
    WHERE cr.session_id = ?
    ORDER BY ci.order_num ASC
  `, [sessionId]);

  const photos = await db.all(`
    SELECT id, photo_type, storage_path, image_hash, captured_at, server_received_at, ocr_detected_date, is_live_camera
    FROM evidence_photos
    WHERE session_id = ?
  `, [sessionId]);

  res.json({
    success: true,
    session,
    responses,
    photos
  });
});

module.exports = router;
