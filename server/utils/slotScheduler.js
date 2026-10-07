const db = require('../database');
const slotUtils = require('./slots');
const whatsapp = require('./whatsappService');

const START_WINDOW_MIN = 10;
const DUE_SOON_BEFORE_MIN = 15;
const MISSED_WINDOW_MIN = 30;

// Returns true only the first time a (slot, date, toilet, kind) event is recorded
function markOnce(slotId, slotDate, toiletId, kind) {
  const r = db.run(
    'INSERT OR IGNORE INTO slot_notification_log (slot_id, slot_date, toilet_id, kind) VALUES (?, ?, ?, ?)',
    [slotId, slotDate, toiletId, kind]
  );
  return r.changes > 0;
}

// Each slot with the toilets it applies to
function slotGroupsForPlant(plantId) {
  const toilets = db.all(`
    SELECT t.id, t.code, t.name, t.plant_id, t.area_id, t.assigned_user_id, u.name as assigned_user_name
    FROM toilets t LEFT JOIN users u ON t.assigned_user_id = u.id
    WHERE t.plant_id = ? AND t.is_active = 1
    ORDER BY t.code
  `, [plantId]);
  const groups = new Map();
  for (const t of toilets) {
    for (const slot of slotUtils.getToiletSlots(t)) {
      if (!groups.has(slot.id)) groups.set(slot.id, { slot, toilets: [] });
      groups.get(slot.id).toilets.push(t);
    }
  }
  return [...groups.values()];
}

function pendingOf(toilets, slot, date) {
  return toilets.filter(t => !slotUtils.getSlotDoneSession(t.id, slot.id, date));
}

function housekeepersFor(toilet, plantId) {
  if (toilet.assigned_user_id) return [{ id: toilet.assigned_user_id }];
  return db.all(
    "SELECT id FROM users WHERE is_active = 1 AND role IN ('HOUSEKEEPING_AGENT', 'HOUSEKEEPING') AND plant_id = ?",
    [plantId]
  );
}

function runSlotChecks() {
  const now = slotUtils.istNow();
  const plants = db.all('SELECT DISTINCT plant_id FROM cleaning_slots WHERE is_active = 1');

  for (const { plant_id: plantId } of plants) {
    for (const { slot, toilets } of slotGroupsForPlant(plantId)) {
      const st = slotUtils.toMinutes(slot.start_time);
      const en = slotUtils.toMinutes(slot.end_time);
      const range = slotUtils.slotRange(slot);

      if (now.minutes >= st && now.minutes < Math.min(st + START_WINDOW_MIN, en)) {
        for (const t of pendingOf(toilets, slot, now.date)) {
          if (!markOnce(slot.id, now.date, t.id, 'START')) continue;
          for (const hk of housekeepersFor(t, plantId)) {
            slotUtils.notify(hk.id, `Cleaning Time: ${slot.label}`,
              `Cleaning time has started for ${t.code} (${t.name}) (${range}). Scan the QR code and fill in the checklist.`,
              'SLOT_REMINDER', { toilet_code: t.code, toilet_name: t.name, slot_id: slot.id });
          }
        }
      }

      if (en - st > DUE_SOON_BEFORE_MIN && now.minutes >= en - DUE_SOON_BEFORE_MIN && now.minutes < en) {
        const pending = pendingOf(toilets, slot, now.date);
        for (const t of pending) {
          if (!markOnce(slot.id, now.date, t.id, 'DUE_SOON')) continue;
          for (const hk of housekeepersFor(t, plantId)) {
            slotUtils.notify(hk.id, `Hurry Up: ${slot.label} is about to end`,
              `Cleaning of ${t.code} (${t.name}) is still pending. The slot ends at ${slotUtils.formatTime12(slot.end_time)}.`,
              'SLOT_REMINDER', { toilet_code: t.code, toilet_name: t.name, slot_id: slot.id });
          }
        }
        if (pending.length && markOnce(slot.id, now.date, 0, 'DUE_SOON')) {
          for (const admin of slotUtils.getPlantAdminRecipients(plantId)) {
            slotUtils.notify(admin.id, `${pending.length} toilet pending — ${slot.label}`,
              `Less than ${DUE_SOON_BEFORE_MIN} min left in ${slot.label} (${range}). Pending: ${pending.map(p => p.code).join(', ')}.`,
              'SLOT_DUE_SOON', { slot_id: slot.id });
          }
        }
      }

      if (now.minutes >= en && now.minutes < en + MISSED_WINDOW_MIN) {
        const missed = pendingOf(toilets, slot, now.date);
        for (const t of missed) {
          if (!markOnce(slot.id, now.date, t.id, 'MISSED')) continue;
          for (const hk of housekeepersFor(t, plantId)) {
            slotUtils.notify(hk.id, `Slot Missed: ${slot.label}`,
              `The ${range} cleaning of ${t.code} (${t.name}) was not done on time. This has been reported to the Admin.`,
              'SLOT_MISSED', { toilet_code: t.code, toilet_name: t.name, slot_id: slot.id });
          }
          db.run(
            'INSERT INTO audit_logs (user_id, user_name, role, action, entity_type, entity_id, details_json) VALUES (NULL, ?, ?, ?, ?, ?, ?)',
            ['SYSTEM', 'SYSTEM', 'SLOT_MISSED', 'TOILET', t.code,
              JSON.stringify({ slot: slot.label, range, date: now.date, assigned_to: t.assigned_user_name || null })]
          );
        }
        if (missed.length && markOnce(slot.id, now.date, 0, 'MISSED')) {
          for (const admin of slotUtils.getPlantAdminRecipients(plantId)) {
            slotUtils.notify(admin.id, `Missed Cleaning — ${slot.label}`,
              `The ${range} cleaning was missed for ${missed.length} toilet(s): ${missed.map(m => `${m.code}${m.assigned_user_name ? ` (${m.assigned_user_name})` : ''}`).join(', ')}.`,
              'SLOT_MISSED', { slot_id: slot.id });
          }
          const plantName = db.get('SELECT name FROM plants WHERE id = ?', [plantId])?.name || '';
          whatsapp.sendAlert(plantId, 'MISSED',
            `HYGIENE 360 ALERT — Missed cleaning. Plant: ${plantName}. Slot: ${slot.label} (${range}). ` +
            `Toilets: ${missed.map(m => `${m.code} ${m.name}`).join(', ')}. Date: ${now.date}.`);
        }
      }
    }
  }
  sendDailySummaries(now, plants);
}

function sendDailySummaries(now, plants) {
  const setting = db.get("SELECT value FROM system_settings WHERE key = 'whatsapp_summary_time'");
  const summaryAt = slotUtils.toMinutes(setting?.value || '20:00');
  if (summaryAt === null || now.minutes < summaryAt || now.minutes >= summaryAt + 30) return;

  for (const { plant_id: plantId } of plants) {
    if (!markOnce(0, now.date, plantId, 'WA_SUMMARY')) continue;
    let total = 0, onTime = 0, late = 0, missed = 0;
    for (const { slot, toilets } of slotGroupsForPlant(plantId)) {
      if (slotUtils.toMinutes(slot.start_time) > now.minutes) continue;
      for (const t of toilets) {
        total++;
        const done = slotUtils.getSlotDoneSession(t.id, slot.id, now.date);
        if (done) { if (done.submitted_late) late++; else onTime++; }
        else if (slotUtils.toMinutes(slot.end_time) <= now.minutes) missed++;
      }
    }
    if (total === 0) continue;
    const plantName = db.get('SELECT name FROM plants WHERE id = ?', [plantId])?.name || '';
    whatsapp.sendAlert(plantId, 'SUMMARY',
      `HYGIENE 360 — Daily cleaning summary. Plant: ${plantName}. Date: ${now.date}. ` +
      `Total slots: ${total} | On time: ${onTime} | Late: ${late} | Missed: ${missed}.`);
  }
}

function startSlotScheduler() {
  const tick = () => {
    try { runSlotChecks(); } catch (err) { console.error('Slot scheduler error:', err.message); }
  };
  tick();
  return setInterval(tick, 60 * 1000);
}

module.exports = { startSlotScheduler, runSlotChecks };
