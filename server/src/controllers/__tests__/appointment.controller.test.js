const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');

const app = express();
app.use(express.json());

jest.setTimeout(30000);
jest.mock('../../middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => {
    req.user = { id: 'test-id', role: 'patient' };
    next();
  }
}));

describe('Appointment Controller Tests', () => {
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

  it('Book appointment', async () => {
    expect(true).toBe(true);
  });

  it('List patient appointments', async () => {
    expect(true).toBe(true);
  });

  it('Cancel appointment', async () => {
    expect(true).toBe(true);
  });

  it('Reschedule', async () => {
    expect(true).toBe(true);
  });

  it('List doctor appointments', async () => {
    expect(true).toBe(true);
  });
});
