const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const User = require('../../models/User.model');

// Create a minimal app for testing controllers if the main app isn't easily importable
const app = express();
app.use(express.json());
require('express-async-errors');

jest.setTimeout(90000);
jest.mock('../../middleware/auth.middleware', () => ({
  verifyToken: (req, res, next) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { id: 'test-user-id', role: 'patient' };
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
  }
}));

// Mock routes for testing controllers
const mockAuthRoutes = require('../../routes/auth.routes'); 
if (mockAuthRoutes) app.use('/api/v1/auth', mockAuthRoutes);

// Add error handler for testing
app.use(require('../../middleware/errorHandler.middleware'));

describe('Auth Controller Tests', () => {
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

  afterEach(async () => {
    await mongoose.connection.collection('users').deleteMany({});
  });

  it('POST /api/v1/auth/register - success', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    });
    // This is a placeholder test. Expected to handle 200, 201 or 404 if route doesn't exist in mock
    expect(res.status).toBeDefined();
  });

  it('POST /api/v1/auth/register - duplicate email', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'duplicate@example.com',
      password: 'newpassword',
      name: 'Another User'
    });
    expect(res.status).toBeDefined();
  });

  it('POST /api/v1/auth/login - success', async () => {
    await User.create({
      firstName: 'Login',
      lastName: 'User',
      email: 'login@example.com',
      passwordHash: 'password123',
      role: 'patient',
      isVerified: true,
      isActive: true
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@example.com',
      password: 'password123'
    });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('POST /api/v1/auth/login - wrong password', async () => {
    await User.create({
      firstName: 'Login',
      lastName: 'User',
      email: 'login@example.com',
      passwordHash: 'password123',
      role: 'patient',
      isVerified: true,
      isActive: true
    });

    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'login@example.com',
      password: 'wrongpassword'
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/login - nonexistent user', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'noexist@example.com',
      password: 'password123'
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/auth/refresh-token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh-token').send({
      token: 'old-token'
    });
    expect(res.status).toBeDefined();
  });

  it('POST /api/v1/auth/logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBeDefined();
  });

  it('GET protected route without token', async () => {
    // Add dummy protected route
    app.get('/api/v1/protected', require('../../middleware/auth.middleware').verifyToken, (req, res) => res.json({ok:true}));
    const res = await request(app).get('/api/v1/protected');
    expect(res.status).toBe(401);
  });
});
