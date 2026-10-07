const db = require('../database');

const IST_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

// Slot timings are plant-local (IST) regardless of the server machine's timezone
function istNow(d = new Date()) {
  const p = Object.fromEntries(IST_FORMAT.formatToParts(d).map(x => [x.type, x.value]));
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: hour * 60 + Number(p.minute) };
}

function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function formatTime12(hhmm) {
  const mins = toMinutes(hhmm);
  if (mins === null) return hhmm || '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function slotRange(slot) {
  return `${formatTime12(slot.start_time)} – ${formatTime12(slot.end_time)}`;
}

// Timings are managed location-wise and copied to every plant of that location
async function getPlantSlots(plantId) {
  if (!plantId) return [];
  return db.all(
    'SELECT * FROM cleaning_slots WHERE plant_id = ? AND area_id IS NULL AND is_active = 1 ORDER BY start_time ASC',
    [plantId]
  );
}

async function getToiletSlots(toilet) {
  if (!toilet) return [];
  let plantId = toilet.plant_id;
  if (!plantId && toilet.id) {
    plantId = (await db.get('SELECT plant_id FROM toilets WHERE id = ?', [toilet.id]))?.plant_id;
  }
  return getPlantSlots(plantId);
}

function findCurrentSlot(slots, minutes) {
  return slots.find(s => {
    const st = toMinutes(s.start_time);
    const en = toMinutes(s.end_time);
    return st !== null && en !== null && minutes >= st && minutes < en;
  }) || null;
}

function findNextSlot(slots, minutes) {
  return slots.find(s => toMinutes(s.start_time) > minutes) || null;
}

// A slot counts as done once a submission is pending or approved; a rejected one must be redone
async function getSlotDoneSession(toiletId, slotId, slotDate) {
  return db.get(`
    SELECT cs.*, u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.toilet_id = ? AND cs.slot_id = ? AND cs.slot_date = ?
      AND cs.status = 'COMPLETED' AND COALESCE(cs.approval_status, 'APPROVED') IN ('PENDING', 'APPROVED')
    ORDER BY cs.id DESC LIMIT 1
  `, [toiletId, slotId, slotDate]);
}

async function getLatestSlotSession(toiletId, slotId, slotDate) {
  return db.get(`
    SELECT cs.*, u.name as agent_name, u.employee_id as agent_emp_id
    FROM cleaning_sessions cs
    LEFT JOIN users u ON cs.user_id = u.id
    WHERE cs.toilet_id = ? AND cs.slot_id = ? AND cs.slot_date = ?
    ORDER BY CASE WHEN cs.status = 'COMPLETED' AND COALESCE(cs.approval_status, 'APPROVED') IN ('PENDING', 'APPROVED') THEN 0
                  WHEN cs.status IN ('COMPLETED', 'REJECTED') THEN 1 ELSE 2 END, cs.id DESC
    LIMIT 1
  `, [toiletId, slotId, slotDate]);
}

/**
 * Status of one toilet for one slot on a given date:
 * APPROVED | PENDING | REJECTED | IN_PROGRESS | DUE | UPCOMING | MISSED
 */
function computeCellStatus(slot, session, slotDate, now = istNow()) {
  if (session) {
    if (session.status === 'COMPLETED') {
      const a = session.approval_status || 'APPROVED';
      if (a === 'APPROVED') return 'APPROVED';
      if (a === 'PENDING') return 'PENDING';
    }
    if (session.status === 'REJECTED' || session.approval_status === 'REJECTED') return 'REJECTED';
  }
  const st = toMinutes(slot.start_time);
  const en = toMinutes(slot.end_time);
  if (slotDate < now.date) return 'MISSED';
  if (slotDate > now.date) return 'UPCOMING';
  if (now.minutes >= en) return 'MISSED';
  if (now.minutes >= st) return session && session.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'DUE';
  return 'UPCOMING';
}

/**
 * Decide whether a housekeeper may start cleaning this toilet right now.
 * Returns { allowed, slot, code, error, nextSlot } — toilets with no slots configured are unrestricted.
 */
async function checkSlotWindow(toilet, now = istNow()) {
  const slots = await getToiletSlots(toilet);
  if (slots.length === 0) return { allowed: true, slot: null, slotsConfigured: false };

  const current = findCurrentSlot(slots, now.minutes);
  const next = findNextSlot(slots, now.minutes);

  if (!current) {
    return {
      allowed: false,
      code: 'OUTSIDE_SLOT',
      slotsConfigured: true,
      nextSlot: next,
      error: next
        ? `It is not cleaning time right now. The next cleaning slot "${next.label}" is at ${slotRange(next)}.`
        : 'All cleaning slots for today are over. The next slot starts tomorrow morning.'
    };
  }

  const done = await getSlotDoneSession(toilet.id, current.id, now.date);
  if (done) {
    const afterCurrent = findNextSlot(slots, toMinutes(current.end_time) - 1);
    return {
      allowed: false,
      code: 'SLOT_ALREADY_DONE',
      slotsConfigured: true,
      slot: current,
      nextSlot: afterCurrent,
      error: `Cleaning of ${toilet.code} for the "${current.label}" (${slotRange(current)}) slot has already been submitted by ${done.agent_name || 'a housekeeper'}.` +
        (afterCurrent ? ` The next cleaning "${afterCurrent.label}" is due at ${slotRange(afterCurrent)}.` : ' There are no more slots for today.')
    };
  }

  return { allowed: true, slot: current, nextSlot: next, slotsConfigured: true };
}

/**
 * Slot a new cleaning belongs to. Cleaning is never blocked by time:
 * the running slot if not yet done, else the latest missed slot of today (submitted late),
 * else the next upcoming slot, else no slot (extra cleaning).
 */
async function resolveSlotForCleaning(toilet, now = istNow()) {
  const slots = await getToiletSlots(toilet);
  if (slots.length === 0) return { slot: null, late: false };
  const doneIds = new Set();
  for (const s of slots) {
    if (await getSlotDoneSession(toilet.id, s.id, now.date)) doneIds.add(s.id);
  }
  const notDone = s => !doneIds.has(s.id);

  const current = findCurrentSlot(slots, now.minutes);
  if (current && notDone(current)) return { slot: current, late: false };

  const missed = slots
    .filter(s => toMinutes(s.end_time) <= now.minutes && notDone(s))
    .sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
  if (missed) return { slot: missed, late: true };

  const upcoming = slots.find(s => toMinutes(s.start_time) > now.minutes && notDone(s));
  if (upcoming) return { slot: upcoming, late: false };

  return { slot: null, late: false };
}

/**
 * Only a running or already-ended (missed) slot can be filled; a future slot never.
 * Returns { blocked, code, filledSlot, filledBy, filledAt, nextSlot } — toilets without slots are never blocked.
 */
async function getSlotAvailability(toilet, now = istNow()) {
  const slots = await getToiletSlots(toilet);
  if (slots.length === 0) return { blocked: false };

  const resolved = (await resolveSlotForCleaning(toilet, now)).slot;
  if (resolved && toMinutes(resolved.start_time) <= now.minutes) return { blocked: false };

  const withRange = s => (s ? { id: s.id, label: s.label, start_time: s.start_time, end_time: s.end_time, range: slotRange(s) } : null);
  let filled = null;
  const started = slots
    .filter(s => toMinutes(s.start_time) <= now.minutes)
    .sort((a, b) => b.start_time.localeCompare(a.start_time));
  for (const s of started) {
    const done = await getSlotDoneSession(toilet.id, s.id, now.date);
    if (done) { filled = { slot: s, done }; break; }
  }

  if (!filled) {
    return {
      blocked: true,
      code: 'SLOT_NOT_STARTED',
      filledSlot: null,
      nextSlot: withRange(resolved),
      error: resolved
        ? `Cleaning time has not started yet. The "${resolved.label}" slot opens at ${slotRange(resolved)}.`
        : 'No cleaning slot is open right now.'
    };
  }

  return {
    blocked: true,
    code: 'SLOT_ALREADY_FILLED',
    filledSlot: withRange(filled.slot),
    filledBy: filled.done.agent_name || null,
    filledAt: filled.done.submit_time || null,
    nextSlot: withRange(resolved),
    error: `Cleaning for the "${filled.slot.label}" (${slotRange(filled.slot)}) slot is already submitted.` +
      (resolved ? ` Next slot "${resolved.label}" is at ${slotRange(resolved)}.` : ' All slots for today are filled.')
  };
}

const URINAL_PATTERN = /urinal/i;

async function getChecklistItemsForToilet(toilet) {
  const items = await db.all('SELECT * FROM checklist_items WHERE is_active = 1 ORDER BY order_num ASC');
  const gender = String(toilet?.gender || '').toUpperCase();
  if (gender === 'FEMALE') return items.filter(i => !URINAL_PATTERN.test(i.label));
  return items;
}

async function getPlantAdminRecipients(plantId) {
  return db.all(`
    SELECT id FROM users
    WHERE is_active = 1 AND (
      role IN ('SUPER_ADMIN', 'IT_ADMIN')
      OR (role = 'PLANT_ADMIN' AND (plant_id = ? OR plant_id IS NULL))
    )
  `, [plantId]);
}

async function notify(userId, title, message, type, metadata = {}) {
  await db.run(
    'INSERT INTO notifications (user_id, title, message, type, metadata_json) VALUES (?, ?, ?, ?, ?)',
    [userId, title, message, type, JSON.stringify(metadata)]
  );
}

module.exports = {
  istNow,
  toMinutes,
  formatTime12,
  slotRange,
  getPlantSlots,
  getToiletSlots,
  findCurrentSlot,
  findNextSlot,
  getSlotDoneSession,
  getLatestSlotSession,
  computeCellStatus,
  checkSlotWindow,
  resolveSlotForCleaning,
  getSlotAvailability,
  getChecklistItemsForToilet,
  getPlantAdminRecipients,
  notify
};
