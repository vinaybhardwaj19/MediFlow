/**
 * @file errorHandler.middleware.js
 * @description Centralised Express error handler. Must be registered LAST.
 * - Operational errors (ApiError): return structured JSON with the correct status.
 * - Mongoose validation/cast errors: normalised to 400.
 * - JWT errors: mapped to 401.
 * - Unhandled programming errors: log full stack, return opaque 500.
 */

const ApiError  = require('../utils/ApiError');
const logger    = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  // ── Mongoose Validation Error ────────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field  : e.path,
      message: e.message,
    }));
    error = new ApiError(400, 'Validation failed', errors);
  }

  // ── Mongoose CastError (invalid ObjectId) ────────────────────────────────────
  if (err.name === 'CastError') {
    error = new ApiError(400, `Invalid ${err.path}: ${err.value}`);
  }

  // ── MongoDB Duplicate Key ────────────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = new ApiError(409, `Duplicate value for "${field}". Please use another.`);
  }

  // ── JWT Errors ───────────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') error = ApiError.unauthorized('Invalid token');
  if (err.name === 'TokenExpiredError')  error = ApiError.unauthorized('Token expired');

  // ── CORS Error ───────────────────────────────────────────────────────────────
  if (err.message?.startsWith('CORS')) error = new ApiError(403, err.message);

  // ── Non-operational / programming errors ─────────────────────────────────────
  if (!error.isOperational) {
    logger.error('UNHANDLED ERROR', { message: err.message, stack: err.stack, url: req.originalUrl });
    return res.status(500).json({
      success   : false,
      statusCode: 500,
      message   : 'An unexpected error occurred. Our team has been notified.',
      timestamp : new Date().toISOString(),
    });
  }

  logger.warn(`[${error.statusCode}] ${error.message}`, { path: req.originalUrl });

  return res.status(error.statusCode).json({
    success   : false,
    statusCode: error.statusCode,
    message   : error.message,
    errors    : error.errors?.length ? error.errors : undefined,
    timestamp : new Date().toISOString(),
  });
};

module.exports = errorHandler;
