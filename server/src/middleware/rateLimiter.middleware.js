/**
 * @file rateLimiter.middleware.js
 * @description Tiered rate limiters for different endpoint sensitivity levels.
 *
 * Tiers:
 *   globalLimiter  — 100 req / 15min  (all routes)
 *   authLimiter    — 10 req  / 15min  (login, register, token refresh)
 *   triageLimiter  — 30 req  / 15min  (AI triage — heavier compute)
 */

const rateLimit = require('express-rate-limit');
const env       = require('../config/env');

const limiterBase = {
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders  : false,
  handler: (_req, res) =>
    res.status(429).json({
      success   : false,
      statusCode: 429,
      message   : 'Too many requests. Please slow down.',
    }),
};

/** Applied globally to all routes */
const globalLimiter = rateLimit({
  ...limiterBase,
  windowMs : env.RATE_LIMIT_WINDOW,
  max      : env.RATE_LIMIT_MAX,
});

/** Applied only to auth endpoints — stricter to prevent brute-force */
const authLimiter = rateLimit({
  ...limiterBase,
  windowMs : 15 * 60 * 1000,
  max      : process.env.NODE_ENV === 'development' ? 1000 : 10,
  message  : 'Too many auth attempts. Try again later.',
});

/** Applied to triage/ML endpoints — prevent model abuse */
const triageLimiter = rateLimit({
  ...limiterBase,
  windowMs : 15 * 60 * 1000,
  max      : 30,
});

module.exports = { globalLimiter, authLimiter, triageLimiter };
