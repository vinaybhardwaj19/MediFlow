/**
 * @file sanitize.middleware.js
 * @description Composite input sanitization pipeline.
 * Layers:
 *   1. express-mongo-sanitize — strips MongoDB operator keys ($, .) from req.body/query/params
 *   2. xss-clean             — strips HTML/script tags from all string fields
 *   3. Custom key blacklist  — rejects requests with explicitly dangerous keys
 */

const mongoSanitize = require('express-mongo-sanitize');
const xssClean      = require('xss-clean');
const ApiError      = require('../utils/ApiError');

/** Keys that must never appear in user-supplied data */
const BLACKLISTED_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Recursively checks an object for blacklisted keys (prototype pollution guard).
 */
function hasBlacklistedKey(obj) {
  if (typeof obj !== 'object' || obj === null) return false;
  return Object.keys(obj).some(
    (k) => BLACKLISTED_KEYS.includes(k) || hasBlacklistedKey(obj[k])
  );
}

const protoGuard = (req, _res, next) => {
  if (hasBlacklistedKey(req.body) || hasBlacklistedKey(req.query)) {
    return next(ApiError.badRequest('Malformed request: forbidden keys detected'));
  }
  next();
};

/**
 * Ordered sanitization middleware array.
 * Apply as: app.use(sanitizePipeline)
 */
const sanitizePipeline = [
  mongoSanitize({ replaceWith: '_', onSanitize: ({ req, key }) => {
    // Silent sanitize — log only in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[Sanitize] Removed dangerous key "${key}" from ${req.path}`);
    }
  }}),
  xssClean(),
  protoGuard,
];

module.exports = sanitizePipeline;
