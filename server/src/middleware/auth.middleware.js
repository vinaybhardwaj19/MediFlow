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
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(ApiError.unauthorized('Token expired'));
    }
    return next(ApiError.unauthorized('Invalid token'));
  }
};

module.exports = { verifyToken };
