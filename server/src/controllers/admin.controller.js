/**
 * @file admin.controller.js — Admin dashboard and user management
 */
const ApiResponse = require('../utils/ApiResponse');
const User        = require('../models/User.model');
const Doctor      = require('../models/Doctor.model');
const Appointment = require('../models/Appointment.model');
const Order       = require('../models/Order.model');
const AuditLog    = require('../models/AuditLog.model');
const ApiError    = require('../utils/ApiError');

exports.getDashboardStats = async (req, res) => {
  const [users, appointments, orders] = await Promise.all([
    User.countDocuments({ isActive: true }),
    Appointment.countDocuments(),
    Order.countDocuments(),
  ]);
  return ApiResponse.ok(res, { users, appointments, orders });
};

exports.listUsers = async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;
  const filter = role ? { role } : {};
  const [users, total] = await Promise.all([
    User.find(filter).skip((page-1)*limit).limit(Number(limit)).select('-passwordHash'),
    User.countDocuments(filter),
  ]);
  return ApiResponse.ok(res, users, 'Users retrieved', { total, page: Number(page) });
};

exports.toggleUserStatus = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  user.isActive = !user.isActive;
  await user.save();
  return ApiResponse.ok(res, { id: user._id, isActive: user.isActive }, 'User status updated');
};

exports.getAuditLogs = async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const [logs, total] = await Promise.all([
    AuditLog.find().sort({ timestamp: -1 }).skip((page-1)*limit).limit(Number(limit)),
    AuditLog.countDocuments(),
  ]);
  return ApiResponse.ok(res, logs, 'Audit logs retrieved', { total, page: Number(page) });
};
