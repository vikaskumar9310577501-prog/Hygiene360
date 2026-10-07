const db = require('../database');

/**
 * WhatsApp alerts to Admins and Plant Heads.
 * Provider is chosen in .env:
 *   WHATSAPP_PROVIDER=meta   WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, optional WHATSAPP_TEMPLATE (+ WHATSAPP_TEMPLATE_LANG)
 *   WHATSAPP_PROVIDER=twilio TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM (e.g. +14155238886)
 * Without configuration every alert is only written to whatsapp_log with status SKIPPED.
 */

const ALERT_SETTING = { MISSED: 'whatsapp_alert_missed', LATE: 'whatsapp_alert_late', SUMMARY: 'whatsapp_alert_summary' };

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  return digits.length >= 10 ? `+${digits}` : null;
}

function providerName() {
  const p = String(process.env.WHATSAPP_PROVIDER || '').toLowerCase();
  if (p === 'meta' && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) return 'meta';
  if (p === 'twilio' && process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM) return 'twilio';
  return null;
}

function isAlertEnabled(kind) {
  const key = ALERT_SETTING[kind];
  if (!key) return true;
  const row = db.get('SELECT value FROM system_settings WHERE key = ?', [key]);
  return !row || row.value !== '0';
}

function getAlertRecipients(plantId) {
  return db.all(`
    SELECT id, name, phone, role FROM users
    WHERE is_active = 1 AND phone IS NOT NULL AND TRIM(phone) != '' AND (
      role IN ('SUPER_ADMIN', 'IT_ADMIN')
      OR (role = 'PLANT_ADMIN' AND (plant_id = ? OR plant_id IS NULL))
      OR (role = 'PLANT_HEAD' AND plant_id = ?)
    )
  `, [plantId, plantId]);
}

async function sendMeta(to, message) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
  const template = process.env.WHATSAPP_TEMPLATE;
  const body = template
    ? {
        messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message.slice(0, 1000) }] }]
        }
      }
    : { messaging_product: 'whatsapp', to: to.replace('+', ''), type: 'text', text: { body: message } };
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Meta ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function sendTwilio(to, message) {
  const sid = process.env.TWILIO_SID;
  const from = String(process.env.TWILIO_FROM).replace(/^whatsapp:/, '');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ From: `whatsapp:${from}`, To: `whatsapp:${to}`, Body: message }).toString()
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

function log(userId, phone, kind, message, status, error = null) {
  try {
    db.run('INSERT INTO whatsapp_log (user_id, phone, kind, message, status, error) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, phone, kind, message, status, error]);
  } catch (e) {}
}

async function sendToUser(user, kind, message) {
  const phone = normalizePhone(user.phone);
  if (!phone) return log(user.id, user.phone, kind, message, 'FAILED', 'Invalid phone number');
  const provider = providerName();
  if (!provider) return log(user.id, phone, kind, message, 'SKIPPED', 'WhatsApp provider not configured');
  try {
    if (provider === 'meta') await sendMeta(phone, message);
    else await sendTwilio(phone, message);
    log(user.id, phone, kind, message, 'SENT');
  } catch (err) {
    log(user.id, phone, kind, message, 'FAILED', err.message);
  }
}

/** Fire-and-forget: never throws, never blocks the request that triggered it. */
function sendAlert(plantId, kind, message) {
  try {
    if (!isAlertEnabled(kind)) return;
    const recipients = getAlertRecipients(plantId);
    if (recipients.length === 0) {
      log(null, null, kind, message, 'SKIPPED', 'No Admin / Plant Head with a phone number');
      return;
    }
    recipients.forEach(u => { sendToUser(u, kind, message).catch(() => {}); });
  } catch (e) {
    console.error('[WHATSAPP] alert failed:', e.message);
  }
}

module.exports = { sendAlert, normalizePhone, providerName, getAlertRecipients, isAlertEnabled };
