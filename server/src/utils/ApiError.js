/**
 * @file ApiError.js
 * @description Custom operational error class for MediFlow.
 * Extends native Error to carry HTTP status codes and structured
 * validation details through the Express error-handling pipeline.
 */

class ApiError extends Error {
  /**
   * @param {number}   statusCode - HTTP status code (4xx / 5xx)
   * @param {string}   message    - Developer-facing error description
   * @param {Array}    [errors]   - Structured validation error details
   * @param {string}   [stack]    - Optional manual stack trace
   */
  constructor(statusCode, message, errors = [], stack = '') {
    super(message);
    this.name       = 'ApiError';
    this.statusCode = statusCode;
    this.errors     = errors;       // e.g. Joi validation detail array
    this.isOperational = true;      // Distinguish from programming bugs

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// ─── Static factory helpers ────────────────────────────────────────────────────

ApiError.badRequest    = (msg, errors) => new ApiError(400, msg, errors);
ApiError.unauthorized  = (msg = 'Authentication required') => new ApiError(401, msg);
ApiError.forbidden     = (msg = 'Access denied') => new ApiError(403, msg);
ApiError.notFound      = (msg = 'Resource not found') => new ApiError(404, msg);
ApiError.conflict      = (msg) => new ApiError(409, msg);
ApiError.tooMany       = (msg = 'Too many requests') => new ApiError(429, msg);
ApiError.internal      = (msg = 'Internal server error') => new ApiError(500, msg);

module.exports = ApiError;
