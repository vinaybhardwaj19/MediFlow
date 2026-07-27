/**
 * @file companion.routes.js
 * @description Routes for Personal AI Healthcare Companion insights and habits.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { getCompanionInsights } = require('../controllers/companion.controller');

router.get('/insights', verifyToken, getCompanionInsights);

module.exports = router;
