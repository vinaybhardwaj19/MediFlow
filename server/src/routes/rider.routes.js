/**
 * @file rider.routes.js
 * @description Delivery rider API routes.
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/rbac.middleware');
const {
  getAvailableDeliveries,
  acceptDelivery,
  updateDeliveryStatus,
  confirmDeliveryOTP,
  getRiderStats,
  getDeliveryRoute
} = require('../controllers/rider.controller');

// Require token & rider role for all endpoints
router.use(verifyToken);
router.use(authorize('rider', 'admin'));

router.get('/queue', getAvailableDeliveries);
router.post('/accept', acceptDelivery);
router.post('/update-status', updateDeliveryStatus);
router.post('/confirm-otp', confirmDeliveryOTP);
router.get('/stats', getRiderStats);
router.get('/route/:deliveryId', getDeliveryRoute);

module.exports = router;
