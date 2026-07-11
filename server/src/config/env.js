/**
 * @file env.js
 * @description Validates and exports required environment variables at startup.
 * The process exits immediately if any critical variable is missing,
 * preventing the server from starting in a misconfigured state.
 */

const REQUIRED = [
  'NODE_ENV',
  'PORT',
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
  'CLIENT_URL',
];

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`[ENV] Fatal: missing required environment variables:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

module.exports = {
  NODE_ENV         : process.env.NODE_ENV,
  PORT             : parseInt(process.env.PORT, 10) || 5000,
  MONGO_URI        : process.env.MONGO_URI,
  CLIENT_URL       : process.env.CLIENT_URL,

  JWT_ACCESS_SECRET  : process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET : process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES : process.env.JWT_ACCESS_EXPIRES_IN  || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  ENCRYPTION_KEY   : process.env.ENCRYPTION_KEY,   // 32-char hex for AES-256

  SMTP_HOST  : process.env.SMTP_HOST,
  SMTP_PORT  : parseInt(process.env.SMTP_PORT, 10) || 587,
  SMTP_USER  : process.env.SMTP_USER,
  SMTP_PASS  : process.env.SMTP_PASS,
  EMAIL_FROM : process.env.EMAIL_FROM || 'MediFlow <noreply@mediflow.com>',

  ML_ENGINE_URL      : process.env.ML_ENGINE_URL || 'http://localhost:8000',
  RATE_LIMIT_WINDOW  : parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  RATE_LIMIT_MAX     : parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  LOG_LEVEL          : process.env.LOG_LEVEL || 'info',
};
