/**
 * @file auth.middleware.js
 * @description JWT access-token verification middleware.
 * Extracts the Bearer token from Authorization header, verifies signature,
 * and attaches the decoded payload to req.user.
 * Does NOT check refresh tokens — that is handled in auth.controller.js.
 */

const jwt    = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');
const env    = require('../config/env');

/**
 * Middleware: verifyToken
 * Protects routes requiring a valid JWT access token.
 */
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('No token provided'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    // Attach safe payload — never the full token
    req.user = {
      id   : decoded.id,
      role : decoded.role,
      email: decoded.email,
    };

    // ASHA / Helper context override
    const actingFor = req.headers['x-acting-for'];
    if (actingFor && (decoded.role === 'worker' || decoded.isHelper)) {
      // In a real app, we would verify the link between helper and patient in DB
      // For the exhibition, we allow the override if the user has a helper role.
      req.user.id = actingFor;
      req.user.isActingAsHelper = true;
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Token expired'));
    }
    return next(ApiError.unauthorized('Invalid token'));
  }
};

module.exports = { verifyToken };
