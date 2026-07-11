/**
 * @file audit.middleware.js
 * @description Automatically writes an AuditLog record after every
 * state-mutating request (POST, PUT, PATCH, DELETE).
 * Non-blocking — failures are logged but do NOT interrupt the response.
 * PHI fields are intentionally excluded from the changes snapshot.
 */

const AuditLog = require('../models/AuditLog.model');
const logger   = require('../utils/logger');

/** Fields that must NEVER appear in the audit trail */
const REDACTED_FIELDS = new Set([
  'password', 'passwordHash', 'token', 'refreshToken',
  'twoFactorSecret', 'policyNumber', 'groupNumber',
  'diagnosis', 'notes', 'signalingToken',
]);

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      REDACTED_FIELDS.has(k) ? '[REDACTED]' : redact(v),
    ])
  );
}

const auditLogger = (req, res, next) => {
  const MUTATING = ['POST','PUT','PATCH','DELETE'];
  if (!MUTATING.includes(req.method)) return next();

  // Capture response finish event — log after response sent
  res.on('finish', () => {
    AuditLog.create({
      userId    : req.user?.id || null,
      action    : `${req.method}:${req.baseUrl}${req.path}`,
      resource  : req.baseUrl.split('/')[2] || 'unknown',
      ipAddress : req.ip,
      userAgent : req.get('User-Agent'),
      method    : req.method,
      endpoint  : `${req.baseUrl}${req.path}`,
      statusCode: res.statusCode,
      changes   : { before: null, after: redact(req.body) },
    }).catch((e) => logger.error('[AuditLog] Failed to write audit record', { error: e.message }));
  });

  next();
};

module.exports = auditLogger;
