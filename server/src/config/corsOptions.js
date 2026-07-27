/**
 * @file corsOptions.js
 * @description CORS policy: whitelists only the configured client origin.
 * Credentials (cookies) are enabled for httpOnly refresh-token flow.
 */

const env = require('./env');

const allowedOrigins = [
  env.CLIENT_URL,
  'http://localhost:5000',
  'http://127.0.0.1:5000',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5050',
  'http://127.0.0.1:5050',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8085',
  'http://127.0.0.1:8085',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin "${origin}" is not allowed`));
    }
  },

  credentials   : true,             // Required for httpOnly cookie refresh tokens
  methods        : ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders : ['Content-Type','Authorization','X-Request-ID'],
  exposedHeaders : ['X-Total-Count','X-Page'],
  maxAge         : 86400,           // 24h preflight cache
};

module.exports = corsOptions;
