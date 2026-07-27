/**
 * @file api.test.js
 * @description Integration tests for custom endpoints using supertest.
 */

require('dotenv').config();
const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(30000);

// Create test app instance
const app = express();
app.use(express.json());

// Mock auth middleware for testing before importing routes
jest.mock('../../middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => {
    req.user = { id: '60d5ecb867c4a12345678901', role: 'patient' };
    next();
  }
}));

// Import routes
const providerRoutes = require('../../routes/provider.routes');
const companionRoutes = require('../../routes/companion.routes');

app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/companion', companionRoutes);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  // Create the 2dsphere index required for $geoNear queries
  const Provider = require('../../models/Provider.model');
  await Provider.createIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('MediFlow Affordability & Multi-Sensor Endpoints', () => {
  it('GET /api/v1/providers/nearby - should return nearest providers', async () => {
    // Seed a provider
    const Provider = require('../../models/Provider.model');
    await Provider.create({
      name: 'City Care Hospital',
      type: 'hospital',
      phone: '1234567890',
      address: {
        street: '123 Main St',
        city: 'Bengaluru',
        coordinates: {
          type: 'Point',
          coordinates: [77.5946, 12.9716] // [lng, lat]
        }
      }
    });

    const res = await request(app)
      .get('/api/v1/providers/nearby?lat=12.9716&lng=77.5946&radius=10')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].name).toBe('City Care Hospital');
  });

  it('GET /api/v1/companion/insights - should generate reminders and logs', async () => {
    const res = await request(app)
      .get('/api/v1/companion/insights')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('reminders');
    expect(res.body.data).toHaveProperty('insights');
    expect(res.body.data).toHaveProperty('habits');
  });
});
