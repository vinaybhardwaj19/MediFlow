/**
 * @file app.js
 * @description Express application factory.
 * Assembles all middleware, routes, and error handlers in the correct order.
 * Does NOT start the HTTP server — that is handled by server.js.
 */

require('dotenv').config();
require('./config/env'); // Validate required env vars before anything else

const express      = require('express');
const path         = require('path');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const compression  = require('compression');
require('express-async-errors'); // Patches async route handlers — no try/catch needed
const cookieParser = require('cookie-parser');

const corsOptions       = require('./config/corsOptions');
const sanitizePipeline  = require('./middleware/sanitize.middleware');
const { globalLimiter } = require('./middleware/rateLimiter.middleware');
const auditLogger       = require('./middleware/audit.middleware');
const errorHandler      = require('./middleware/errorHandler.middleware');
const logger            = require('./utils/logger');
const { metricsMiddleware, metricsEndpoint } = require('./middleware/metrics.middleware');

// ─── Route imports ─────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const patientRoutes      = require('./routes/patient.routes');
const doctorRoutes       = require('./routes/doctor.routes');
const appointmentRoutes  = require('./routes/appointment.routes');
const triageRoutes       = require('./routes/triage.routes');
const pharmacyRoutes     = require('./routes/pharmacy.routes');
const adminRoutes        = require('./routes/admin.routes');
const prescriptionRoutes = require('./routes/prescription.routes');
const chatRoutes         = require('./routes/chat.routes');
const providerRoutes     = require('./routes/provider.routes');
const riderRoutes        = require('./routes/rider.routes');
const labRoutes          = require('./routes/lab.routes');
const timelineRoutes     = require('./routes/timeline.routes');
const companionRoutes    = require('./routes/companion.routes');
const paymentRoutes      = require('./routes/payment.routes');
const dataRightsRoutes   = require('./routes/data-rights.routes');

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Required for WebRTC
  contentSecurityPolicy: {
    directives: {
      defaultSrc  : ["'self'"],
      scriptSrc   : ["'self'", "'unsafe-inline'", "https://cdn.socket.io", "https://fonts.googleapis.com", "https://maps.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc    : ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc     : ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc  : ["'self'", "ws:", "wss:",
                      "http://localhost:*", "https://api.openweathermap.org",
                      "https://*.googleapis.com", "https://*.razorpay.com"],
      mediaSrc    : ["*"],
      imgSrc      : ["'self'", "data:", "https://images.unsplash.com", "https://*.googleapis.com", "https://*.gstatic.com", "*"],
      workerSrc   : ["'self'", "blob:"],
    },
  },
}));

// ─── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight for all routes

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));        // Prevent JSON payload bombs
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser()); // Parse httpOnly refresh token cookies

// ─── Compression ───────────────────────────────────────────────────────────────
app.use(compression());

// ─── HTTP Request Logging ──────────────────────────────────────────────────────
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip  : (_req, res) => res.statusCode < 400 && process.env.NODE_ENV === 'production',
}));

// ─── Prometheus Metrics ────────────────────────────────────────────────────────
app.use(metricsMiddleware);

// ─── Input Sanitization ────────────────────────────────────────────────────────
app.use(sanitizePipeline);

// ─── Global Rate Limiter ───────────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ─── Audit Logging ─────────────────────────────────────────────────────────────
app.use('/api', auditLogger);

// ─── Health Check (no auth required) ──────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'mediflow-api', ts: new Date().toISOString() })
);

app.get('/metrics', metricsEndpoint);

// ─── Client Config (Expose safe environment variables) ────────────────────────
app.get('/api/v1/config', (_req, res) => {
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/v1/auth',         authRoutes);
app.use('/api/v1/patients',     patientRoutes);
app.use('/api/v1/doctors',      doctorRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/triage',       triageRoutes);
app.use('/api/v1/pharmacy',     pharmacyRoutes);
app.use('/api/v1/admin',         adminRoutes);
app.use('/api/v1/prescriptions', prescriptionRoutes);
app.use('/api/v1/chat',          chatRoutes);
app.use('/api/v1/providers',     providerRoutes);
app.use('/api/v1/riders',        riderRoutes);
app.use('/api/v1/labs',          labRoutes);
app.use('/api/v1/timeline',      timelineRoutes);
app.use('/api/v1/companion',     companionRoutes);
app.use('/api/v1/payment',       paymentRoutes);
app.use('/api/v1/data-rights',   dataRightsRoutes);

// ─── Serve Client SPA (must be AFTER all API routes) ─────────────────────────
// This lets the frontend load from http://localhost:5000 without file:// issues.
const clientPath = path.join(__dirname, '../../client');
app.use(express.static(clientPath));

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api\/|\/health).*/, (_req, res) =>
  res.sendFile(path.join(clientPath, 'index.html'))
);

// ─── 404 Handler (API routes only) ────────────────────────────────────────────
app.use('/api', (_req, res) =>
  res.status(404).json({ success: false, statusCode: 404, message: 'Route not found' })
);

// ─── Centralised Error Handler (must be last) ──────────────────────────────────
app.use(errorHandler);

module.exports = app;
