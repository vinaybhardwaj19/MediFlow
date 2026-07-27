const jwt = require('jsonwebtoken');
const { verifyToken } = require('../auth.middleware');

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
    process.env.JWT_SECRET = 'test_secret';
  });

  it('Valid token passes', () => {
    const token = jwt.sign({ id: 'user_123', role: 'patient' }, process.env.JWT_SECRET);
    mockReq.headers.authorization = `Bearer ${token}`;

    verifyToken(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.id).toBe('user_123');
  });

  it('Expired token returns 401', () => {
    const token = jwt.sign({ id: 'user_123' }, process.env.JWT_SECRET, { expiresIn: '-1h' });
    mockReq.headers.authorization = `Bearer ${token}`;

    verifyToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('Missing Authorization header returns 401', () => {
    verifyToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('Malformed token returns 401', () => {
    mockReq.headers.authorization = 'Bearer invalid.token.here';

    verifyToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
  });
});
