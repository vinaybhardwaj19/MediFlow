/**
 * @file family.controller.js
 * @description Collaborative health management for families.
 */

const Family = require('../models/Family.model');
const User = require('../models/User.model');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');

/** POST /api/v1/family/create */
exports.createCircle = async (req, res) => {
  const { name } = req.body;
  if (!name) throw ApiError.badRequest('Family circle name is required');

  const family = await Family.create({
    name,
    ownerId: req.user.id,
    members: [{ userId: req.user.id, role: 'guardian', status: 'active' }]
  });

  return ApiResponse.created(res, family, 'Family circle established.');
};

/** POST /api/v1/family/invite */
exports.inviteMember = async (req, res) => {
  const { email, role } = req.body;
  const { familyId } = req.params;

  const targetUser = await User.findOne({ email });
  if (!targetUser) throw ApiError.notFound('User not found with this email.');

  const family = await Family.findById(familyId);
  if (!family) throw ApiError.notFound('Family circle not found.');
  if (family.ownerId.toString() !== req.user.id) throw ApiError.forbidden('Only owners can invite.');

  // Check if already a member
  if (family.members.some(m => m.userId.toString() === targetUser._id.toString())) {
    throw ApiError.conflict('User is already a member or has a pending invite.');
  }

  family.members.push({ userId: targetUser._id, role: role || 'member', status: 'pending' });
  await family.save();

  return ApiResponse.ok(res, null, `Invitation sent to ${email}.`);
};

/** GET /api/v1/family/circle */
exports.getMyCircles = async (req, res) => {
  const circles = await Family.find({ 'members.userId': req.user.id })
    .populate('members.userId', 'firstName lastName email profileImage');
  return ApiResponse.ok(res, circles);
};

/** POST /api/v1/family/respond/:familyId */
exports.respondToInvite = async (req, res) => {
  const { accept } = req.body;
  const { familyId } = req.params;

  const family = await Family.findById(familyId);
  if (!family) throw ApiError.notFound('Family circle not found.');

  const member = family.members.find(m => m.userId.toString() === req.user.id);
  if (!member) throw ApiError.forbidden('You are not invited to this family.');

  member.status = accept ? 'active' : 'rejected';

  if (!accept) {
    family.members = family.members.filter(m => m.userId.toString() !== req.user.id);
  }

  await family.save();
  return ApiResponse.ok(res, null, accept ? 'Joined family circle.' : 'Invitation declined.');
};

/** GET /api/v1/family/vitals/:userId */
exports.getMemberVitals = async (req, res) => {
  const { userId } = req.params;

  // Verify permission: Must be in a shared family circle with active status
  const family = await Family.findOne({
    members: { $all: [
      { $elemMatch: { userId: req.user.id, status: 'active' } },
      { $elemMatch: { userId: userId, status: 'active' } }
    ] }
  });

  if (!family) throw ApiError.forbidden('You do not have permission to view this members vitals.');

  // In a real app, this would fetch from a Vitals model.
  // For the exhibition, we'll return a simulated stream.
  return ApiResponse.ok(res, {
    heartRate: 72 + Math.floor(Math.random() * 10),
    spo2: 98 - Math.floor(Math.random() * 2),
    timestamp: new Date()
  });
};
