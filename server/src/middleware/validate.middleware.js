/**
 * @file validate.middleware.js
 * @description Joi schema validation middleware factory.
 *
 * Usage:
 *   const { validate } = require('../middleware/validate.middleware');
 *   const schemas = require('../utils/validators');
 *
 *   router.post('/register', validate(schemas.auth.register), registerHandler);
 *
 * Validates req.body by default. Pass 'query' or 'params' as second argument
 * to validate those instead.
 */

const ApiError = require('../utils/ApiError');

/**
 * @param {import('joi').Schema} schema   - Joi schema to validate against
 * @param {'body'|'query'|'params'} [src] - Request property to validate (default: 'body')
 * @returns Express middleware
 */
const validate = (schema, src = 'body') => (req, _res, next) => {
  const { error, value } = schema.validate(req[src], {
    abortEarly : false,   // Collect ALL validation errors
    stripUnknown: true,   // Remove any extra fields silently
  });

  if (error) {
    const errors = error.details.map((d) => ({
      field  : d.path.join('.'),
      message: d.message.replace(/['"]/g, ''), // Strip Joi's quote wrapping
    }));
    return next(ApiError.badRequest('Validation failed', errors));
  }

  // Replace req[src] with the sanitized, default-applied Joi value
  req[src] = value;
  next();
};

module.exports = { validate };
