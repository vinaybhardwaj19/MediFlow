/**
 * @file lab.routes.js
 * @description Routes for booking laboratory tests and uploading digital reports.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const {
  bookTest,
  getHistory,
  uploadReport,
  explainReport
} = require('../controllers/lab.controller');

// Patient routes
router.post('/book', verifyToken, authorize('patient', 'admin'), bookTest);
router.get('/history', verifyToken, authorize('patient', 'admin', 'worker'), getHistory);
router.post('/explain/:id', verifyToken, authorize('patient', 'admin'), explainReport);

// Admin/operator route to upload reports
router.post('/upload', verifyToken, authorize('admin', 'worker'), uploadReport);


module.exports = router;
