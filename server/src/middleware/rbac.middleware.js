/**
 * @file rbac.middleware.js
 * @description Role-Based Access Control (RBAC) middleware factory.
 * Usage: router.get('/admin', verifyToken, authorize('admin'), handler)
 * Multiple roles can be passed: authorize('admin', 'doctor')
 */

const ApiError = require('../utils/ApiError');

/**
 * Returns an Express middleware that restricts access to the specified roles.
 * Must be used AFTER verifyToken (requires req.user).
 * @param  {...string} roles - Allowed roles (e.g. 'admin', 'doctor', 'patient')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());

  if (!roles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(`Role "${req.user.role}" is not permitted to access this resource`)
    );
  }
  next();
};

module.exports = { authorize };
