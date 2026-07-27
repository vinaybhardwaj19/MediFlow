const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');

// Minimal app
const app = express();
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 2, 
  message: 'Too many requests'
});
app.use('/api', limiter);
app.get('/api/test', (req, res) => res.json({ ok: true }));

describe('Rate Limiter Middleware Tests', () => {
  it('Request within limit succeeds', async () => {
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
  });

  it('Request exceeding limit returns 429', async () => {
    await request(app).get('/api/test'); // Request 2
    const res = await request(app).get('/api/test'); // Request 3 (should fail)
    expect(res.status).toBe(429);
  });
});
