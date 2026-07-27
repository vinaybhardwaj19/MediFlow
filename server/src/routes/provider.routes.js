/**
 * @file provider.routes.js
 * @description Routes for searching medical providers.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const { getNearbyProviders, createProvider } = require('../controllers/provider.controller');

// Public route so anyone can locate emergency or healthcare providers on landing/app open
router.get('/nearby', getNearbyProviders);

// Admin-only route to add new providers
router.post('/', verifyToken, authorize('admin'), createProvider);

module.exports = router;
