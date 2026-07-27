/**
 * @file timeline.routes.js
 * @description Routes for aggregating patient care history events into a chronological timeline.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { getPatientTimeline } = require('../controllers/timeline.controller');

router.get('/', verifyToken, getPatientTimeline);

module.exports = router;
