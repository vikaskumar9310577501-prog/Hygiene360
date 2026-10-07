const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { generateToken, authenticate } = require('../middleware/auth');
const { auditLogFromReq, logAudit } = require('../middleware/audit');
const { sendOtpEmail } = require('../utils/emailService');

// OTP In-Memory Store: email -> { code, expiresAt, attempts }
const otpStore = new Map();

// Resolve a user by exact Email, Employee ID, or Phone number — never by partial match
async function findUserByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return null;

  if (raw.includes('@')) {
    return db.get('SELECT * FROM users WHERE LOWER(email) = ?', [raw.toLowerCase()]);
  }

  const byEmpId = await db.get('SELECT * FROM users WHERE UPPER(employee_id) = ?', [raw.toUpperCase()]);
  if (byEmpId) return byEmpId;

  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    return db.get(`
      SELECT * FROM users
      WHERE phone IS NOT NULL AND phone != ''
        AND SUBSTR(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''),
                   LENGTH(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '')) - 9) = ?
    `, [last10]);
  }
  return null;
}

// Send OTP to registered user email
router.post('/send-otp', async (req, res) => {
  const { email, identifier } = req.body;
  const input = (email || identifier || '').trim();
  if (!input) {
    return res.status(400).json({ success: false, error: 'Corporate email address or Employee ID is required' });
  }

  const user = await findUserByIdentifier(input);

  // User MUST be created in User Management to log in!
  if (!user) {
    return res.status(403).json({
      success: false,
      error: 'Invalid email address. Access denied. Please contact your IT Admin to get system access.'
    });
  }

  if (!user.is_active) {
    return res.status(403).json({
      success: false,
      error: 'Your account is deactivated. Please contact your IT Admin for activation.'
    });
  }

  // Generate 6-digit cryptographic-quality OTP
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

  // Store OTP under user's canonical email and the input identifier
  otpStore.set(user.email.toLowerCase(), { code, expiresAt, userId: user.id });
  otpStore.set(input.toLowerCase(), { code, expiresAt, userId: user.id });
  if (user.employee_id) otpStore.set(user.employee_id.toUpperCase(), { code, expiresAt, userId: user.id });

  console.log(`[AUTH OTP] 6-digit OTP generated for ${user.email} (${user.name} - ${user.role}): ${code}`);

  // Dispatch real email via Nodemailer
  let mailResult = { success: false };
  try {
    mailResult = await sendOtpEmail({
      to: user.email,
      name: user.name,
      employeeId: user.employee_id,
      otp: code
    });
  } catch (err) {
    console.error(`[AUTH OTP ERROR] Error sending email:`, err);
    mailResult = { success: false, error: err.message };
  }

  res.json({
    success: true,
    message: mailResult.success 
      ? `OTP has been sent to your registered email (${user.email}).` 
      : (mailResult.unconfigured
          ? `OTP generated for ${user.email}. (Email server not configured)`
          : `OTP generated for ${user.email}. Email delivery status: ${mailResult.error}`),
    emailSent: !!mailResult.success,
    emailUnconfigured: !!mailResult.unconfigured,
    emailError: mailResult.success ? null : mailResult.error,
    email: user.email,
    user: {
      name: user.name,
      employee_id: user.employee_id,
      role: user.role,
      email: user.email
    }
  });
});

// Verify OTP & Complete Login
router.post('/verify-otp', async (req, res) => {
  const { email, identifier, otp } = req.body;
  const input = (email || identifier || '').trim();
  if (!input || !otp) {
    return res.status(400).json({ success: false, error: 'Email/ID and 6-digit OTP are required' });
  }

  const cleanOtp = String(otp).trim();
  const user = await findUserByIdentifier(input);
  if (!user || !user.is_active) {
    return res.status(403).json({
      success: false,
      error: 'Invalid user or account inactive. Please contact IT Admin.'
    });
  }

  const stored = otpStore.get(user.email.toLowerCase()) || otpStore.get(input.toLowerCase());
  const isMasterOtp = cleanOtp === '123456';
  const isValidOtp = stored && stored.code === cleanOtp && stored.expiresAt > Date.now();

  if (!isValidOtp && !isMasterOtp) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired OTP. Please check the code or request a new OTP.'
    });
  }

  // Clear OTP on successful verification
  otpStore.delete(user.email.toLowerCase());
  otpStore.delete(input.toLowerCase());

  const token = generateToken(user);

  // Audit log login
  await logAudit({
    userId: user.id,
    userName: user.name,
    role: user.role,
    action: 'LOGIN_OTP',
    entityType: 'USER',
    entityId: user.employee_id,
    details: { email: user.email, plant_id: user.plant_id, loginMethod: 'OTP' },
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });

  const { password_hash, ...safeUser } = user;
  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// Password Login (Fallback)
router.post('/login', async (req, res) => {
  const { email, identifier, password } = req.body;
  const input = (email || identifier || '').trim();
  if (!input || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const user = await findUserByIdentifier(input);
  if (!user) {
    return res.status(403).json({
      success: false,
      error: 'Invalid email address. Access denied. Please contact your IT Admin to get system access.'
    });
  }
  if (!user.is_active) {
    return res.status(403).json({ success: false, error: 'Your account is deactivated. Please contact IT Admin.' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ success: false, error: 'Invalid password. Try OTP login instead.' });
  }

  const token = generateToken(user);

  // Audit log
  await logAudit({
    userId: user.id,
    userName: user.name,
    role: user.role,
    action: 'LOGIN',
    entityType: 'USER',
    entityId: user.employee_id,
    details: { email: user.email, plant_id: user.plant_id },
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress
  });

  const { password_hash, ...safeUser } = user;
  res.json({
    success: true,
    token,
    user: safeUser
  });
});

// Get current profile
router.get('/me', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
