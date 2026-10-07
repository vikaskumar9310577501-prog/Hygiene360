const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

// Ensure .env is loaded
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
} catch (e) {}

/**
 * Creates and returns a nodemailer transporter configured via environment variables
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || (host.includes('gmail') ? '465' : '587'), 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || '';
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASS || process.env.GMAIL_PASS || '';

  if (!user || !pass) {
    return null;
  }

  // Create transporter with proper timeout and security settings
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: user.trim(),
      pass: pass.trim().replace(/\s+/g, '') // strip any spaces from Gmail App Password
    },
    tls: {
      rejectUnauthorized: false // support corporate proxies or self-signed certs if needed
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

/**
 * Generates the branded HTML email content for Hygiene 360
 */
function generateOtpHtml({ name, employeeId, otp, to }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Hygiene 360 Login OTP</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 30px 10px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 32px 24px; text-align: center;">
              <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 20px; padding: 4px 14px; margin-bottom: 12px;">
                <span style="color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;">
                  PG Electroplast Limited
                </span>
              </div>
              <h1 style="color: #ffffff; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.02em;">
                HYGIENE 360
              </h1>
              <p style="color: #e0f2fe; font-size: 12px; margin: 6px 0 0 0;">
                Enterprise Housekeeping & Facility Management System
              </p>
            </td>
          </tr>

          <!-- Main Content Body -->
          <tr>
            <td style="padding: 32px 28px 24px 28px;">
              <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 8px 0;">
                Login Verification Passcode
              </h2>
              <p style="font-size: 13.5px; color: #475569; margin: 0 0 20px 0; line-height: 1.5;">
                Hello <strong>${name || 'Staff User'}</strong>${employeeId ? ` (${employeeId})` : ''},
                <br>
                Use the following 6-digit One-Time Password (OTP) to securely sign in to your Hygiene 360 portal account.
              </p>

              <!-- OTP Code Display Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: #f8fafc; border: 2px dashed #0284c7; border-radius: 12px; padding: 20px 16px;">
                    <div style="font-size: 11px; font-weight: 700; color: #0369a1; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">
                      Your One-Time Passcode
                    </div>
                    <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #0369a1; font-family: 'Courier New', Courier, monospace;">
                      ${otp}
                    </div>
                    <div style="font-size: 11.5px; color: #64748b; margin-top: 8px;">
                      ⏱️ Valid for <strong>10 minutes</strong> only
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Information Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 6px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 12px 14px; font-size: 12px; color: #166534; line-height: 1.45;">
                    <strong>Security Notice:</strong> Never share this OTP with anyone, including IT Support or Supervisors. PG Electroplast staff will never ask for your verification code.
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
                If you did not request this login attempt, please notify your Plant IT Administrator immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">
                © ${new Date().getFullYear()} PG Electroplast Limited. All rights reserved.
              </p>
              <p style="font-size: 10px; color: #cbd5e1; margin: 0;">
                Automated System Message • Please do not reply to this email
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

/**
 * Sends OTP Email to the user's registered email address
 * @param {Object} options
 * @param {string} options.to - User's email address
 * @param {string} options.name - User's full name
 * @param {string} options.employeeId - User's employee ID
 * @param {string} options.otp - 6-digit OTP code
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string, unconfigured?: boolean }>}
 */
async function sendOtpEmail({ to, name, employeeId, otp }) {
  if (!to || !otp) {
    return { success: false, error: 'Recipient email and OTP are required' };
  }

  const transporter = createTransporter();

  // If no SMTP credentials configured in .env
  if (!transporter) {
    const warning = `[EMAIL SERVICE WARNING] SMTP credentials (SMTP_USER & SMTP_PASS) not configured in .env. OTP for ${to} (${name || 'User'}) is: ${otp}`;
    console.warn(`\n======================================================`);
    console.warn(warning);
    console.warn(`To deliver real emails to ${to}, configure SMTP_USER & SMTP_PASS in .env`);
    console.warn(`======================================================\n`);
    return {
      success: false,
      unconfigured: true,
      error: 'SMTP email server credentials are not configured in .env. Please configure SMTP_USER and SMTP_PASS.'
    };
  }

  const senderUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER;
  const fromAddress = process.env.SMTP_FROM || `"HYGIENE 360 (PGEL)" <${senderUser}>`;

  const mailOptions = {
    from: fromAddress,
    to: to.trim(),
    subject: `Hygiene 360 - Your Login OTP is ${otp}`,
    text: `Your Hygiene 360 Login OTP is: ${otp}\n\nValid for 10 minutes.\n\nPG Electroplast Limited`,
    html: generateOtpHtml({ name, employeeId, otp, to })
  };

  try {
    console.log(`[EMAIL SERVICE] Attempting to send OTP email to ${to}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] ✅ Email delivered to ${to} (Message ID: ${info.messageId})`);
    return {
      success: true,
      messageId: info.messageId
    };
  } catch (err) {
    console.error(`[EMAIL SERVICE] ❌ Failed to deliver email to ${to}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  sendOtpEmail,
  createTransporter
};
