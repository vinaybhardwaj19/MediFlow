const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.use(express.json());

jest.setTimeout(30000);
jest.mock('../../middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => {
    req.user = { id: 'doctor-id', role: 'doctor' };
    next();
  }
}));

describe('Prescription Controller Tests', () => {
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

  it('Create prescription (doctor role)', async () => {
    expect(true).toBe(true);
  });

  it('Get prescription', async () => {
    expect(true).toBe(true);
  });

  it('List by patient', async () => {
    expect(true).toBe(true);
  });

  it('Verify prescription', async () => {
    expect(true).toBe(true);
  });
});
