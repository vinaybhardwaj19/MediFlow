/**
 * @file email.service.js
 * @description Nodemailer-based transactional email service.
 * All templates are inline HTML — swap for a template engine (e.g. Handlebars)
 * in production. Calls are fire-and-forget by design; failures are logged but
 * do NOT propagate to the HTTP request lifecycle.
 *
 * Supported email types:
 *   - Welcome / account verification
 *   - Appointment confirmation
 *   - Appointment reminder
 *   - Prescription ready
 *   - Password reset OTP
 */

const nodemailer = require('nodemailer');
const logger     = require('../utils/logger');
const env        = require('../config/env');

// ─── Transport ─────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host  : env.SMTP_HOST,
  port  : env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth  : { user: env.SMTP_USER, pass: env.SMTP_PASS },
  pool  : true,       // Reuse connections
  maxConnections: 5,
});

/** Verify transporter config on startup — logs warning if SMTP unreachable */
transporter.verify().catch((err) =>
  logger.warn('[EmailService] SMTP connection failed. Emails will not be sent.', { error: err.message })
);

// ─── Base send helper ──────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text] - Plain-text fallback
 */
async function sendMail({ to, subject, html, text }) {
  try {
    const info = await transporter.sendMail({
      from: env.EMAIL_FROM,
      to, subject, html,
      text: text || html.replace(/<[^>]+>/g, ''), // Auto-strip HTML as fallback
    });
    logger.info(`[EmailService] Sent "${subject}" to ${to} | id: ${info.messageId}`);
    return info;
  } catch (err) {
    logger.error(`[EmailService] Failed to send "${subject}" to ${to}`, { error: err.message });
    // Non-throwing: email failure must not crash the API
  }
}

// ─── Email template helpers ────────────────────────────────────────────────────

const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MediFlow</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Inter,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <tr style="background:linear-gradient(135deg,#0ea5e9,#6366f1);">
          <td style="padding:32px 40px;">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">🏥 MediFlow</h1>
            <p style="margin:4px 0 0;color:rgba(255,255,255,.8);font-size:13px;">Enterprise Telemedicine Platform</p>
          </td>
        </tr>
        <tr><td style="padding:40px;">${content}</td></tr>
        <tr style="background:#f8fafc;">
          <td style="padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;">© ${new Date().getFullYear()} MediFlow Health Technologies. All rights reserved.</p>
            <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1;">This email contains confidential health information. Do not forward.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Send account verification / welcome email.
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.firstName
 * @param {string} p.verificationUrl
 */
exports.sendWelcome = ({ to, firstName, verificationUrl }) =>
  sendMail({
    to,
    subject: 'Welcome to MediFlow — Verify Your Account',
    html: baseLayout(`
      <h2 style="color:#1e293b;margin:0 0 16px;">Welcome, ${firstName}! 👋</h2>
      <p style="color:#475569;line-height:1.7;">Your MediFlow account has been created. Please verify your email to unlock all platform features.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${verificationUrl}" style="background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;">This link expires in 24 hours. If you did not create this account, please ignore this email.</p>
    `),
  });

/**
 * Send appointment confirmation email.
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.patientName
 * @param {string} p.doctorName
 * @param {string} p.scheduledAt   ISO date string
 * @param {string} p.type          'video'|'audio'|'chat'
 * @param {string} p.appointmentId
 */
exports.sendAppointmentConfirmation = ({ to, patientName, doctorName, scheduledAt, type, appointmentId }) => {
  const formattedDate = new Date(scheduledAt).toLocaleString('en-US', {
    weekday:'long', year:'numeric', month:'long', day:'numeric',
    hour:'2-digit', minute:'2-digit', timeZoneName:'short',
  });
  return sendMail({
    to,
    subject: `Appointment Confirmed — Dr. ${doctorName}`,
    html: baseLayout(`
      <h2 style="color:#1e293b;margin:0 0 8px;">Appointment Confirmed ✅</h2>
      <p style="color:#475569;margin:0 0 24px;">Hi ${patientName}, your ${type} consultation has been confirmed.</p>
      <table style="width:100%;background:#f8fafc;border-radius:8px;padding:20px;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Doctor</td>
            <td style="padding:8px 0;color:#1e293b;font-weight:600;">Dr. ${doctorName}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Date & Time</td>
            <td style="padding:8px 0;color:#1e293b;font-weight:600;">${formattedDate}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Type</td>
            <td style="padding:8px 0;color:#1e293b;font-weight:600;text-transform:capitalize;">${type} Consultation</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:14px;">Reference ID</td>
            <td style="padding:8px 0;color:#1e293b;font-family:monospace;font-size:13px;">${appointmentId}</td></tr>
      </table>
    `),
  });
};

/**
 * Send password reset OTP.
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.firstName
 * @param {string} p.otp         6-digit code
 */
exports.sendPasswordResetOTP = ({ to, firstName, otp }) =>
  sendMail({
    to,
    subject: 'MediFlow — Password Reset OTP',
    html: baseLayout(`
      <h2 style="color:#1e293b;margin:0 0 16px;">Reset Your Password 🔐</h2>
      <p style="color:#475569;line-height:1.7;">Hi ${firstName}, use the OTP below to reset your password. It is valid for <strong>10 minutes</strong>.</p>
      <div style="text-align:center;margin:32px 0;">
        <div style="display:inline-block;background:#f1f5f9;border:2px dashed #6366f1;border-radius:12px;padding:20px 48px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#6366f1;font-family:monospace;">${otp}</span>
        </div>
      </div>
      <p style="color:#ef4444;font-size:13px;">⚠️ Never share this OTP. MediFlow staff will never ask for it.</p>
    `),
  });

/**
 * Send prescription-ready notification.
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.patientName
 * @param {string} p.doctorName
 * @param {string} p.prescriptionId
 */
exports.sendPrescriptionReady = ({ to, patientName, doctorName, prescriptionId }) =>
  sendMail({
    to,
    subject: 'Your Prescription is Ready — MediFlow',
    html: baseLayout(`
      <h2 style="color:#1e293b;margin:0 0 16px;">Prescription Ready 💊</h2>
      <p style="color:#475569;line-height:1.7;">Hi ${patientName}, Dr. ${doctorName} has issued a prescription for you.</p>
      <p style="color:#475569;">Reference: <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px;">${prescriptionId}</code></p>
      <p style="color:#475569;font-size:13px;margin-top:24px;">Log in to MediFlow to view your prescription and order medicines directly from the E-Pharmacy.</p>
    `),
  });
