const db = require('../database');
const slotUtils = require('./slots');
const whatsapp = require('./whatsappService');

const START_WINDOW_MIN = 10;
const DUE_SOON_BEFORE_MIN = 15;
const MISSED_WINDOW_MIN = 30;

// Returns true only the first time a (slot, date, toilet, kind) event is recorded
async function markOnce(slotId, slotDate, toiletId, kind) {
  const r = await db.run(
    'INSERT OR IGNORE INTO slot_notification_log (slot_id, slot_date, toilet_id, kind) VALUES (?, ?, ?, ?)',
    [slotId, slotDate, toiletId, kind]
  );
  return r.changes > 0;
}

// Each slot with the toilets it applies to
async function slotGroupsForPlant(plantId) {
  const toilets = await db.all(`
    SELECT t.id, t.code, t.name, t.plant_id, t.area_id, t.assigned_user_id, u.name as assigned_user_name
    FROM toilets t LEFT JOIN users u ON t.assigned_user_id = u.id
    WHERE t.plant_id = ? AND t.is_active = 1
    ORDER BY t.code
  `, [plantId]);
  const slots = await slotUtils.getPlantSlots(plantId);
  return slots.map(slot => ({ slot, toilets }));
}

async function pendingOf(toilets, slot, date) {
  const out = [];
  for (const t of toilets) {
    if (!(await slotUtils.getSlotDoneSession(t.id, slot.id, date))) out.push(t);
  }
  return out;
}

async function housekeepersFor(toilet, plantId) {
  if (toilet.assigned_user_id) return [{ id: toilet.assigned_user_id }];
  return db.all(
    "SELECT id FROM users WHERE is_active = 1 AND role IN ('HOUSEKEEPING_AGENT', 'HOUSEKEEPING') AND plant_id = ?",
    [plantId]
  );
}

async function runSlotChecks() {
  const now = slotUtils.istNow();
  const plants = await db.all('SELECT DISTINCT plant_id FROM cleaning_slots WHERE is_active = 1');

  for (const { plant_id: plantId } of plants) {
    for (const { slot, toilets } of await slotGroupsForPlant(plantId)) {
      const st = slotUtils.toMinutes(slot.start_time);
      const en = slotUtils.toMinutes(slot.end_time);
      const range = slotUtils.slotRange(slot);

      if (now.minutes >= st && now.minutes < Math.min(st + START_WINDOW_MIN, en)) {
        for (const t of await pendingOf(toilets, slot, now.date)) {
          if (!(await markOnce(slot.id, now.date, t.id, 'START'))) continue;
          for (const hk of await housekeepersFor(t, plantId)) {
            await slotUtils.notify(hk.id, `Cleaning Time: ${slot.label}`,
              `Cleaning time has started for ${t.code} (${t.name}) (${range}). Scan the QR code and fill in the checklist.`,
              'SLOT_REMINDER', { toilet_code: t.code, toilet_name: t.name, slot_id: slot.id });
          }
        }
      }

      if (en - st > DUE_SOON_BEFORE_MIN && now.minutes >= en - DUE_SOON_BEFORE_MIN && now.minutes < en) {
        const pending = await pendingOf(toilets, slot, now.date);
        for (const t of pending) {
          if (!(await markOnce(slot.id, now.date, t.id, 'DUE_SOON'))) continue;
          for (const hk of await housekeepersFor(t, plantId)) {
            await slotUtils.notify(hk.id, `Hurry Up: ${slot.label} is about to end`,
              `Cleaning of ${t.code} (${t.name}) is still pending. The slot ends at ${slotUtils.formatTime12(slot.end_time)}.`,
              'SLOT_REMINDER', { toilet_code: t.code, toilet_name: t.name, slot_id: slot.id });
          }
        }
        if (pending.length && await markOnce(slot.id, now.date, 0, 'DUE_SOON')) {
          for (const admin of await slotUtils.getPlantAdminRecipients(plantId)) {
            await slotUtils.notify(admin.id, `${pending.length} toilet pending — ${slot.label}`,
              `Less than ${DUE_SOON_BEFORE_MIN} min left in ${slot.label} (${range}). Pending: ${pending.map(p => p.code).join(', ')}.`,
              'SLOT_DUE_SOON', { slot_id: slot.id });
          }
        }
      }

      if (now.minutes >= en && now.minutes < en + MISSED_WINDOW_MIN) {
        const missed = await pendingOf(toilets, slot, now.date);
        for (const t of missed) {
          if (!(await markOnce(slot.id, now.date, t.id, 'MISSED'))) continue;
          for (const hk of await housekeepersFor(t, plantId)) {
            await slotUtils.notify(hk.id, `Slot Missed: ${slot.label}`,
              `The ${range} cleaning of ${t.code} (${t.name}) was not done on time. This has been reported to the Admin.`,
              'SLOT_MISSED', { toilet_code: t.code, toilet_name: t.name, slot_id: slot.id });
          }
          await db.run(
            'INSERT INTO audit_logs (user_id, user_name, role, action, entity_type, entity_id, details_json) VALUES (NULL, ?, ?, ?, ?, ?, ?)',
            ['SYSTEM', 'SYSTEM', 'SLOT_MISSED', 'TOILET', t.code,
              JSON.stringify({ slot: slot.label, range, date: now.date, assigned_to: t.assigned_user_name || null })]
          );
        }
        if (missed.length && await markOnce(slot.id, now.date, 0, 'MISSED')) {
          for (const admin of await slotUtils.getPlantAdminRecipients(plantId)) {
            await slotUtils.notify(admin.id, `Missed Cleaning — ${slot.label}`,
              `The ${range} cleaning was missed for ${missed.length} toilet(s): ${missed.map(m => `${m.code}${m.assigned_user_name ? ` (${m.assigned_user_name})` : ''}`).join(', ')}.`,
              'SLOT_MISSED', { slot_id: slot.id });
          }
          const plantName = (await db.get('SELECT name FROM plants WHERE id = ?', [plantId]))?.name || '';
          await whatsapp.sendAlert(plantId, 'MISSED',
            `HYGIENE 360 ALERT — Missed cleaning. Plant: ${plantName}. Slot: ${slot.label} (${range}). ` +
            `Toilets: ${missed.map(m => `${m.code} ${m.name}`).join(', ')}. Date: ${now.date}.`);
        }
      }
    }
  }
  await sendDailySummaries(now, plants);
}

async function sendDailySummaries(now, plants) {
  const setting = await db.get("SELECT value FROM system_settings WHERE key = 'whatsapp_summary_time'");
  const summaryAt = slotUtils.toMinutes(setting?.value || '20:00');
  if (summaryAt === null || now.minutes < summaryAt || now.minutes >= summaryAt + 30) return;

  for (const { plant_id: plantId } of plants) {
    if (!(await markOnce(0, now.date, plantId, 'WA_SUMMARY'))) continue;
    let total = 0, onTime = 0, late = 0, missed = 0;
    for (const { slot, toilets } of await slotGroupsForPlant(plantId)) {
      if (slotUtils.toMinutes(slot.start_time) > now.minutes) continue;
      for (const t of toilets) {
        total++;
        const done = await slotUtils.getSlotDoneSession(t.id, slot.id, now.date);
        if (done) { if (done.submitted_late) late++; else onTime++; }
        else if (slotUtils.toMinutes(slot.end_time) <= now.minutes) missed++;
      }
    }
    if (total === 0) continue;
    const plantName = (await db.get('SELECT name FROM plants WHERE id = ?', [plantId]))?.name || '';
    await whatsapp.sendAlert(plantId, 'SUMMARY',
      `HYGIENE 360 — Daily cleaning summary. Plant: ${plantName}. Date: ${now.date}. ` +
      `Total slots: ${total} | On time: ${onTime} | Late: ${late} | Missed: ${missed}.`);
  }
}

let running = false;
async function safeRun() {
  if (running) return;
  running = true;
  try { await runSlotChecks(); } catch (err) { console.error('Slot scheduler error:', err.message); }
  finally { running = false; }
}

function startSlotScheduler() {
  safeRun();
  return setInterval(safeRun, 60 * 1000);
}

module.exports = { startSlotScheduler, runSlotChecks, safeRun };
