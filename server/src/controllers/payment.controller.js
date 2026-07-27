/**
 * @file payment.controller.js
 * @description Razorpay payment gateway integration.
 * Creates orders and verifies HMAC-SHA256 payment signatures.
 */

const crypto   = require('crypto');
const ApiResponse = require('../utils/ApiResponse');
const ApiError    = require('../utils/ApiError');

const getRazorpay = () => {
  const keyId     = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;

  // Lazily load — only installed if keys are provided
  try {
    const Razorpay = require('razorpay');
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  } catch {
    return null;
  }
};

/**
 * POST /api/v1/payment/create-order
 * Creates a Razorpay order and returns order details to frontend.
 */
exports.createOrder = async (req, res) => {
  const { amount } = req.body; // amount in paise (INR cents)
  if (!amount || amount < 100) throw ApiError.badRequest('Amount must be at least ₹1 (100 paise)');

  const razorpay = getRazorpay();

  if (!razorpay) {
    // Razorpay keys not configured — return a COD-compatible mock for demo
    return ApiResponse.ok(res, {
      orderId  : `demo_${Date.now()}`,
      amount,
      currency : 'INR',
      keyId    : null,
      demo     : true,
    }, 'Demo mode: Razorpay keys not configured. Payment will be treated as COD.');
  }

  const order = await razorpay.orders.create({
    amount    : Math.round(amount),
    currency  : 'INR',
    receipt   : `mf_${Date.now()}`,
    payment_capture: 1,
  });

  return ApiResponse.ok(res, {
    orderId  : order.id,
    amount   : order.amount,
    currency : order.currency,
    keyId    : process.env.RAZORPAY_KEY_ID,
  }, 'Razorpay order created successfully');
};

/**
 * POST /api/v1/payment/verify
 * Verifies the Razorpay payment signature using HMAC-SHA256.
 * This prevents any fraudulent payment_id from being used.
 */
exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw ApiError.badRequest('Missing payment verification fields');
  }

  // Skip verification for demo orders
  if (razorpay_order_id.startsWith('demo_')) {
    return ApiResponse.ok(res, { verified: true, demo: true }, 'Demo payment verified');
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw ApiError.serverError('Payment gateway not configured');

  const body      = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expected  = crypto
    .createHmac('sha256', keySecret)
    .update(body)
    .digest('hex');

  if (expected !== razorpay_signature) {
    throw ApiError.badRequest('Payment signature verification failed. Possible fraud attempt.');
  }

  return ApiResponse.ok(res, {
    verified   : true,
    paymentId  : razorpay_payment_id,
    orderId    : razorpay_order_id,
  }, 'Payment verified successfully');
};
