/**
 * @file auth.routes.js
 * @description Authentication endpoints with Joi validation on all mutating routes.
 */

const express = require('express');
const router  = express.Router();
const { authLimiter }   = require('../middleware/rateLimiter.middleware');
const { verifyToken }   = require('../middleware/auth.middleware');
const { validate }      = require('../middleware/validate.middleware');
const schemas           = require('../utils/validators');
const {
  register, login, refreshToken, logout, getMe,
} = require('../controllers/auth.controller');

router.post('/register', authLimiter, validate(schemas.auth.register), register);
router.post('/login',    authLimiter, validate(schemas.auth.login),    login);
router.post('/refresh',  authLimiter, refreshToken);
router.post('/logout',   verifyToken, logout);
router.get ('/me',       verifyToken, getMe);

module.exports = router;
