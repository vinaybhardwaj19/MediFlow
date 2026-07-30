const jwt = require('jsonwebtoken');
const { verifyToken } = require('../auth.middleware');
const env = require('../../config/env');

describe('Auth Middleware Tests', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  it('Valid token passes', () => {
    const token = jwt.sign({ id: 'user_123', role: 'patient', email: 'test@example.com' }, env.JWT_ACCESS_SECRET);
    mockReq.headers.authorization = `Bearer ${token}`;

    verifyToken(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.id).toBe('user_123');
  });

  it('Expired token returns 401', () => {
    const token = jwt.sign({ id: 'user_123' }, env.JWT_ACCESS_SECRET, { expiresIn: '-1h' });
    mockReq.headers.authorization = `Bearer ${token}`;

    const next = jest.fn();
    verifyToken(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('Missing Authorization header returns 401', () => {
    const next = jest.fn();
    verifyToken(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it('Malformed token returns 401', () => {
    mockReq.headers.authorization = 'Bearer invalid.token.here';

    const next = jest.fn();
    verifyToken(mockReq, mockRes, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });
});
