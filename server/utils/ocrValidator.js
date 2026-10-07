const db = require('../database');
const { createWorker } = require('tesseract.js');
const { Jimp } = require('jimp');
const { istNow } = require('./slots');

let tesseractWorker = null;

async function getWorker() {
  if (!tesseractWorker) {
    try {
      tesseractWorker = await createWorker('eng');
    } catch (e) {
      console.warn('Tesseract worker init skipped, using pattern-based date verification:', e.message);
      return null;
    }
  }
  return tesseractWorker;
}

/**
 * Normalizes different date representations to DD-MM-YYYY
 */
function normalizeDate(dStr) {
  if (!dStr) return null;
  dStr = dStr.trim();

  // Match DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const m1 = dStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m1) {
    let day = m1[1].padStart(2, '0');
    let month = m1[2].padStart(2, '0');
    let year = m1[3].length === 2 ? '20' + m1[3] : m1[3];
    return `${day}-${month}-${year}`;
  }

  // Match YYYY-MM-DD
  const m2 = dStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m2) {
    let year = m2[1];
    let month = m2[2].padStart(2, '0');
    let day = m2[3].padStart(2, '0');
    return `${day}-${month}-${year}`;
  }

  return null;
}

function getTodayFormatted() {
  return istToday();
}

/**
 * Check if the image hash was previously submitted to prevent duplicate/reused evidence
 */
function checkDuplicateEvidence(imageHash, currentSessionId = null, currentPhotoType = null) {
  if (!imageHash) return { isDuplicate: false };

  let query = 'SELECT ep.id, ep.session_id, ep.photo_type, ep.captured_at, cs.session_code FROM evidence_photos ep LEFT JOIN cleaning_sessions cs ON ep.session_id = cs.id WHERE ep.image_hash = ? AND ep.is_rejected = 0';
  const params = [imageHash];

  if (currentSessionId && currentPhotoType) {
    // If in the same session, reject if used for a DIFFERENT photo type; allow replacing own photo
    query += ' AND NOT (ep.session_id = ? AND ep.photo_type = ?)';
    params.push(currentSessionId, currentPhotoType);
  } else if (currentSessionId) {
    query += ' AND ep.session_id != ?';
    params.push(currentSessionId);
  }

  const existing = db.get(query, params);
  if (existing) {
    return {
      isDuplicate: true,
      message: `Duplicate evidence detected: This photo has already been submitted in ${existing.session_code ? 'session ' + existing.session_code : 'another slot (' + existing.photo_type.replace(/_/g, ' ') + ')'}.`,
      existingRecord: existing
    };
  }

  return { isDuplicate: false };
}

function isValidImageBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true;
  // WebP: RIFF...WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.length > 12 && buffer.toString('ascii', 8, 12) === 'WEBP') return true;
  return false;
}

const DATE_RE = /\b(\d{1,2})\s?[-/.]\s?(\d{1,2})\s?[-/.]\s?(\d{4}|\d{2})\b/g;
const ISO_DATE_RE = /\b(\d{4})\s?[-/.]\s?(\d{1,2})\s?[-/.]\s?(\d{1,2})\b/g;
const TIME_RE = /\b([01]?\d|2[0-3])\s?([:.])\s?([0-5]\d)\s?(a\.?m\.?|p\.?m\.?)?/gi;
const OCR_ROTATIONS = [0, 90, 270, 180];
const OCR_STEP_TIMEOUT_MS = 9000;
const OCR_TOTAL_BUDGET_MS = 30000;
const FUTURE_TIME_TOLERANCE_MIN = 30;

function istToday() {
  const d = istNow().date; // YYYY-MM-DD
  return `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;
}

function validDayMonth(day, month) {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

// All dates written on the sheet (DD-MM-YYYY, DD/MM/YY, YYYY-MM-DD ...), normalized to DD-MM-YYYY
function findDates(text) {
  const found = [];
  for (const m of text.matchAll(DATE_RE)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (!validDayMonth(day, month)) continue;
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    found.push(`${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`);
  }
  for (const m of text.matchAll(ISO_DATE_RE)) {
    const day = Number(m[3]);
    const month = Number(m[2]);
    if (!validDayMonth(day, month)) continue;
    found.push(`${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${m[1]}`);
  }
  return found;
}

// Times like 10:30, 3:15 PM, 10.30 am; dates are removed first so "30.09" is not read as a time
function findTimes(text) {
  const withoutDates = text.replace(DATE_RE, ' ').replace(ISO_DATE_RE, ' ');
  const found = [];
  for (const m of withoutDates.matchAll(TIME_RE)) {
    const suffix = (m[4] || '').replace(/\./g, '').toLowerCase();
    if (m[2] === '.' && !suffix) continue;
    let hour = Number(m[1]);
    const minute = Number(m[3]);
    if (suffix && (hour < 1 || hour > 12)) continue;
    if (suffix === 'pm' && hour < 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    found.push({ hour, minute, ambiguous: !suffix && hour >= 1 && hour <= 12, text: m[0].trim() });
  }
  return found;
}

function timeLabel(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// A time written on today's sheet cannot be later than now; without AM/PM both readings are tried
function pickSheetTime(times, nowMinutes) {
  let best = null;
  for (const t of times) {
    const options = [t.hour * 60 + t.minute];
    if (t.ambiguous && t.hour < 12) options.push((t.hour + 12) * 60 + t.minute);
    for (const mins of options) {
      const ahead = mins - nowMinutes;
      const candidate = { minutes: mins, ahead, label: timeLabel(mins) };
      if (!best) { best = candidate; continue; }
      const bestOk = best.ahead <= FUTURE_TIME_TOLERANCE_MIN;
      const candOk = ahead <= FUTURE_TIME_TOLERANCE_MIN;
      if (candOk && (!bestOk || ahead > best.ahead)) best = candidate;
    }
  }
  return best;
}

async function recognizeText(worker, buffer) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('OCR timeout')), OCR_STEP_TIMEOUT_MS); });
  try {
    const ret = await Promise.race([worker.recognize(buffer), timeout]);
    return ret?.data?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

// Reads the sheet upright and turned 90/270/180 degrees, since the date/time may be written in either direction
async function readSheetText(imageBuffer) {
  const worker = await getWorker();
  if (!worker) return [];
  const base = await Jimp.read(imageBuffer);
  const { width, height } = base.bitmap;
  if (Math.max(width, height) > 1600) {
    if (width >= height) base.resize({ w: 1600 });
    else base.resize({ h: 1600 });
  }
  base.greyscale().normalize();

  const started = Date.now();
  const results = [];
  for (const deg of OCR_ROTATIONS) {
    if (Date.now() - started > OCR_TOTAL_BUDGET_MS) break;
    const img = deg ? base.clone().rotate(deg) : base;
    const text = await recognizeText(worker, await img.getBuffer('image/jpeg'));
    const dates = findDates(text);
    results.push({ deg, text, dates, times: findTimes(text) });
    if (dates.length) break;
  }
  return results;
}

/**
 * Reads the date and time written on the check-sheet photo.
 * A readable date must be today's date and a readable time cannot be in the future;
 * if nothing is readable the photo is accepted and flagged for the admin to check by eye.
 */
async function validateCheckSheetDate(imageBuffer) {
  const todayFormatted = istToday();
  const nowMinutes = istNow().minutes;
  let results = [];

  if (imageBuffer && isValidImageBuffer(imageBuffer)) {
    try {
      results = await readSheetText(imageBuffer);
    } catch (ocrErr) {
      console.warn('Check-sheet OCR skipped:', ocrErr.message);
      try { if (tesseractWorker) tesseractWorker.terminate().catch(() => {}); } catch (e) {}
      tesseractWorker = null;
    }
  }

  const dates = results.flatMap(r => r.dates);
  const times = results.flatMap(r => r.times);
  const rotation = (results.find(r => r.dates.length) || {}).deg ?? null;
  const detectedDate = dates.includes(todayFormatted) ? todayFormatted : (dates[0] || null);
  const sheetTime = pickSheetTime(times, nowMinutes);

  if (detectedDate && detectedDate !== todayFormatted) {
    return {
      valid: false,
      detectedDate,
      detectedTime: sheetTime ? sheetTime.label : null,
      expectedDate: todayFormatted,
      message: `Today's check sheet is required. The date on this check sheet (${detectedDate}) is not today's date (${todayFormatted}).`
    };
  }
  if (detectedDate && sheetTime && sheetTime.ahead > FUTURE_TIME_TOLERANCE_MIN) {
    return {
      valid: false,
      detectedDate,
      detectedTime: sheetTime.label,
      expectedDate: todayFormatted,
      message: `The time written on the check sheet (${sheetTime.label}) is later than the current time (${timeLabel(nowMinutes)}). Please write the correct time and take the photo again.`
    };
  }

  return {
    valid: true,
    dateVerified: !!detectedDate,
    detectedDate,
    detectedTime: sheetTime ? sheetTime.label : null,
    rotation,
    expectedDate: todayFormatted
  };
}

async function ocrImage(buffer) {
  const worker = await getWorker();
  if (!worker) return '';
  try {
    return await recognizeText(worker, buffer);
  } catch (e) {
    return '';
  }
}

module.exports = {
  ocrImage,
  checkDuplicateEvidence,
  validateCheckSheetDate,
  normalizeDate,
  getTodayFormatted
};
