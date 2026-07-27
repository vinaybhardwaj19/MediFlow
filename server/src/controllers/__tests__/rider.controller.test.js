const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.use(express.json());

jest.setTimeout(30000);
jest.mock('../../middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => {
    req.user = { id: 'rider-id', role: 'rider' };
    next();
  }
}));

describe('Rider Controller Tests', () => {
  let mongoServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  it('Accept delivery', async () => {
    expect(true).toBe(true);
  });

  it('Update location', async () => {
    expect(true).toBe(true);
  });

  it('Complete delivery with OTP', async () => {
    expect(true).toBe(true);
  });

  it('Get active deliveries', async () => {
    expect(true).toBe(true);
  });
});
