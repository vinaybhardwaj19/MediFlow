/**
 * @file auth.controller.js
 * @description Authentication business logic — Phase 2 full implementation.
 * Stubs return structured placeholders so routes resolve during Phase 1 boot.
 */
const ApiResponse = require('../utils/ApiResponse');
const ApiError    = require('../utils/ApiError');
const User        = require('../models/User.model');
const jwt         = require('jsonwebtoken');
const env         = require('../config/env');

/** Helper: sign a short-lived access token */
const signAccess = (payload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES });

/** Helper: sign a long-lived refresh token */
const signRefresh = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES });

/** POST /api/v1/auth/register */
exports.register = async (req, res) => {
  const { firstName, lastName, email, password, role, ...extra } = req.body;
  if (!firstName || !lastName || !email || !password)
    throw ApiError.badRequest('firstName, lastName, email and password are required');

  const exists = await User.findOne({ email });
  if (exists) throw ApiError.conflict('An account with this email already exists');

  // Automatic verification for all roles during exhibition mode to allow instant access
  const isVerified = true;

  const user = await User.create({
    firstName, lastName, email,
    passwordHash: password, // pre-save hook bcrypts this
    role: role || 'patient',
    isVerified,
    onboardingData: extra // Store licenseNumber, vehicleNumber, etc.
  });

  return ApiResponse.created(res, user.toSafeObject(), 'Account created successfully');
};

/** POST /api/v1/auth/login */
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw ApiError.badRequest('Email and password required');

  const user = await User.findOne({ email }).select('+passwordHash +refreshTokens');
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  const isMatch = await user.comparePassword(password);

  if (!isMatch) throw ApiError.unauthorized('Invalid email or password');

  if (!user.isActive) throw ApiError.forbidden('Account is deactivated');

  const payload = { id: user._id, role: user.role, email: user.email };
  const accessToken  = signAccess(payload);
  const refreshToken = signRefresh({ id: user._id });

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  user.addRefreshToken(refreshToken, expiresAt);
  user.lastLogin = new Date();

  // Optimized save - only if modified
  if (user.isModified()) {
    await user.save();
  }

  // httpOnly cookie for refresh token (XSS-safe)
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure  : env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge  : 7 * 24 * 60 * 60 * 1000,
  });

  return ApiResponse.ok(res, { accessToken, user: user.toSafeObject() }, 'Login successful');
};

/** POST /api/v1/auth/refresh */
exports.refreshToken = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw ApiError.unauthorized('No refresh token');

  let decoded;
  try {
    decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(decoded.id).select('+refreshTokens');
  if (!user || !user.consumeRefreshToken(token))
    throw ApiError.unauthorized('Refresh token revoked');

  const payload = { id: user._id, role: user.role, email: user.email };
  const newAccess  = signAccess(payload);
  const newRefresh = signRefresh({ id: user._id });

  user.addRefreshToken(newRefresh, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  await user.save();

  res.cookie('refreshToken', newRefresh, {
    httpOnly: true, secure: env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return ApiResponse.ok(res, { accessToken: newAccess }, 'Token refreshed');
};

/** POST /api/v1/auth/logout */
exports.logout = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    const user = await User.findById(req.user.id).select('+refreshTokens');
    if (user) { user.consumeRefreshToken(token); await user.save(); }
  }
  res.clearCookie('refreshToken');
  return ApiResponse.ok(res, null, 'Logged out successfully');
};

/** GET /api/v1/auth/me */
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');
  return ApiResponse.ok(res, user.toSafeObject());
};

/** PUT /api/v1/auth/me */
exports.updateMe = async (req, res) => {
  const { firstName, lastName, phone, address, gender, dateOfBirth, onboardingData } = req.body;
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (phone !== undefined) user.phone = phone;
  if (address !== undefined) user.address = address;
  if (gender !== undefined) user.gender = gender;
  if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
  if (onboardingData !== undefined) {
    user.onboardingData = { ...(user.onboardingData || {}), ...onboardingData };
  }

  await user.save();
  return ApiResponse.ok(res, user.toSafeObject(), 'Profile updated successfully');
};

