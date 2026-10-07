// Verifies the ticks on the daily check sheet against today's date and the cleaning slot being submitted.
const { Jimp } = require('jimp');
const db = require('../database');
const { readSheet } = require('./sheetReader');
const { ocrImage } = require('./ocrValidator');
const { istNow, toMinutes } = require('./slots');

const DEFAULT_LAYOUT = {
  items: ['Floor', 'Wall', 'Mirror', 'Wash Basin', 'Handwash', 'Urinal', 'WC', 'Dustbin'],
  timings: ['08:00', '11:00', '13:00', '15:00', '17:00'],
  requireAllItems: true
};
// Share of a box covered by ink: blank boxes read ~0, light pencil ticks ~0.02, pen ticks 0.05+
const TICK_INK = 0.012;
// Stray marks on future dates/times must be clearly visible before the sheet is refused
const FUTURE_INK = 0.025;
const FUTURE_TIME_GRACE_MIN = 30;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function layout() {
  try {
    const row = db.get("SELECT value FROM system_settings WHERE key = 'check_sheet_layout'");
    if (row && row.value) return { ...DEFAULT_LAYOUT, ...JSON.parse(row.value) };
  } catch (e) {}
  return DEFAULT_LAYOUT;
}

function timeLabel(hhmm) {
  const m = toMinutes(hhmm);
  const h = Math.floor(m / 60), min = m % 60;
  return `${((h + 11) % 12) + 1}:${String(min).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dayLabel(dateStr, day) {
  const [y, mo] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1, day));
  return `${String(day).padStart(2, '0')}-${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`;
}

function daysInMonth(dateStr) {
  const [y, mo] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// Reads the printed label of a date row (e.g. "30-Sep-26"); null when unreadable
async function readRowLabel(flat, row, colLines) {
  try {
    const x0 = Math.max(0, Math.round(colLines[0])), x1 = Math.round(colLines[1]);
    const y0 = Math.max(0, Math.round(row.top)), y1 = Math.min(flat.rows, Math.round(row.bottom));
    const w = x1 - x0, h = y1 - y0;
    if (w < 10 || h < 6) return null;
    const data = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const start = ((y0 + y) * flat.cols + x0) * 4;
      flat.data.copy ? flat.data.copy(data, y * w * 4, start, start + w * 4) : data.set(flat.data.subarray(start, start + w * 4), y * w * 4);
    }
    const img = new Jimp({ width: w, height: h, data });
    img.resize({ w: w * 3, h: h * 3 }).greyscale().normalize();
    const text = await ocrImage(await img.getBuffer('image/png'));
    const m = text.replace(/\s+/g, '').match(/(\d{2})[-./]?([A-Za-z]{3})/);
    if (!m) return null;
    const month = MONTHS.indexOf(m[2].toLowerCase());
    return { day: Number(m[1]), month: month >= 0 ? month + 1 : null, text: text.replace(/[^\w-]/g, '') };
  } catch (e) {
    return null;
  }
}

function fail(code, message, details = {}) {
  return { valid: false, code, message, ...details };
}

/**
 * @param {Buffer} imageBuffer live photo of the check sheet
 * @param {{ slotStart?: string }} opts slot the cleaning belongs to (HH:MM)
 */
async function validateSheetTicks(imageBuffer, { slotStart, now = istNow() } = {}) {
  const cfg = layout();
  const today = Number(now.date.slice(8, 10));
  const month = Number(now.date.slice(5, 7));
  const todayLabel = dayLabel(now.date, today);

  const sheet = await readSheet(imageBuffer);
  if (!sheet.found) {
    return fail('SHEET_NOT_READ', 'Check sheet could not be read. Keep the full sheet flat inside the photo, in good light, and retake.');
  }
  const flat = sheet.flat;
  try {
    const needCols = 1 + cfg.items.length + cfg.timings.length;
    const nDays = daysInMonth(now.date);
    if (sheet.colLines.length - 1 < needCols || sheet.rows.length < nDays) {
      return fail('SHEET_NOT_READ', 'Check sheet table is not fully visible. Keep all rows and columns inside the photo and retake.');
    }

    const dateRows = sheet.rows.slice(-nDays);
    const cells = sheet.cells.slice(-nDays);
    const itemCol = i => 1 + i;
    const timingCol = j => 1 + cfg.items.length + j;

    const label = await readRowLabel(flat, dateRows[today - 1], sheet.colLines);
    if (label && label.month && label.month !== month) {
      return fail('WRONG_MONTH', `This check sheet is not for this month (row reads "${label.text}"). Use this month's sheet.`, { label });
    }
    if (label && label.day && label.day !== today && label.day <= 31) {
      return fail('ROW_MISMATCH', `Could not line up today's row on the sheet (read "${label.text}" instead of ${todayLabel}). Keep the sheet straight and retake.`, { label });
    }

    const refMinutes = slotStart ? toMinutes(slotStart) : now.minutes;
    let slotIdx = 0;
    cfg.timings.forEach((t, j) => {
      if (Math.abs(toMinutes(t) - refMinutes) < Math.abs(toMinutes(cfg.timings[slotIdx]) - refMinutes)) slotIdx = j;
    });
    const slotLabel = timeLabel(cfg.timings[slotIdx]);
    const row = cells[today - 1];

    for (let d = today + 1; d <= nDays; d++) {
      const marks = cells[d - 1].slice(1, 1 + cfg.items.length + cfg.timings.length);
      if (marks.some(v => v >= FUTURE_INK)) {
        return fail('FUTURE_DATE_TICK', `Tick found on a future date (${dayLabel(now.date, d)}). Ticks must be only in today's row (${todayLabel}).`);
      }
    }
    for (let j = 0; j < cfg.timings.length; j++) {
      if (toMinutes(cfg.timings[j]) > now.minutes + FUTURE_TIME_GRACE_MIN && row[timingCol(j)] >= FUTURE_INK) {
        return fail('FUTURE_TIME_TICK', `Tick found in a future time box (${timeLabel(cfg.timings[j])}) for today. Tick only the ${slotLabel} box.`);
      }
    }

    const ticked = cfg.items.filter((_, i) => row[itemCol(i)] >= TICK_INK);
    const missing = cfg.items.filter((_, i) => row[itemCol(i)] < TICK_INK);
    const slotTicked = row[timingCol(slotIdx)] >= TICK_INK;
    const details = {
      date: todayLabel,
      slot: slotLabel,
      itemsTicked: ticked.length,
      itemsTotal: cfg.items.length,
      missingItems: missing,
      slotTicked,
      rowLabel: label ? label.text : null
    };

    if (!slotTicked) {
      return fail('SLOT_NOT_TICKED', `No tick in today's (${todayLabel}) ${slotLabel} box. Tick the correct date and time and retake.`, details);
    }
    if (cfg.requireAllItems && missing.length) {
      return fail('ITEMS_NOT_TICKED', `Only ${ticked.length} of ${cfg.items.length} items are ticked for ${todayLabel}. Missing: ${missing.join(', ')}.`, details);
    }
    return { valid: true, message: `Check sheet verified: ${todayLabel}, ${slotLabel}, ${ticked.length}/${cfg.items.length} items ticked.`, ...details };
  } finally {
    flat.delete();
  }
}

module.exports = { validateSheetTicks, DEFAULT_LAYOUT };
