/**
 * @file payment.routes.js
 * @description Routes for Razorpay payment gateway integration.
 */

const express = require('express');
const router  = express.Router();
const { createOrder, verifyPayment } = require('../controllers/payment.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Create a Razorpay order (requires authentication)
router.post('/create-order', verifyToken, createOrder);

// Verify payment signature after checkout (requires authentication)
router.post('/verify', verifyToken, verifyPayment);

module.exports = router;
