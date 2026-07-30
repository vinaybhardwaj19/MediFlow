/**
 * @file User.model.js
 * @description Central identity entity for all platform roles.
 * Security: passwordHash uses select:false; refresh tokens are hashed before storage.
 */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

const addressSchema = new mongoose.Schema({
  street  : String,
  city    : String,
  state   : String,
  zip     : String,
  country : String,
}, { _id: false });

const refreshTokenSchema = new mongoose.Schema({
  tokenHash  : { type: String, required: true },
  expiresAt  : { type: Date,   required: true },
  createdAt  : { type: Date,   default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  firstName  : { type: String, required: true, trim: true, maxlength: 60 },
  lastName   : { type: String, required: true, trim: true, maxlength: 60 },
  email      : { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false }, // NEVER returned in API responses
  role       : { type: String, enum: ['patient','doctor','pharmacist','admin','rider','worker'], required: true },
  phone      : { type: String, trim: true },        // E.164 format validated at route layer
  dateOfBirth: Date,
  gender     : { type: String, enum: ['male','female','other','prefer_not_to_say'] },
  address    : addressSchema,
  profileImage: String,                             // S3 key or URL
  isVerified : { type: Boolean, default: false },
  isHelper   : { type: Boolean, default: false },   // ASHA / Frontline health worker
  isActive   : { type: Boolean, default: true, index: true },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret : { type: String, select: false }, // AES-256 encrypted at rest
  lastLogin  : Date,
  onboardingData: { type: mongoose.Schema.Types.Mixed }, // Store license, vehicle info, etc.
  refreshTokens: {
    type: [refreshTokenSchema],
    select: false,
    validate: [arr => arr.length <= 5, 'Max 5 concurrent sessions'],
  },
}, { timestamps: true });

// ─── Indexes ───────────────────────────────────────────────────────────────────
userSchema.index({ role: 1 });

// ─── Hooks ────────────────────────────────────────────────────────────────────
/** Hash password before every save if modified */
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────
/** Compare a plain-text candidate against the stored bcrypt hash */
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

/** Hash a refresh token before storing it (SHA-256) */
userSchema.methods.addRefreshToken = function (rawToken, expiresAt) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  // Prune oldest if at capacity
  if (this.refreshTokens.length >= 5) this.refreshTokens.shift();
  this.refreshTokens.push({ tokenHash, expiresAt });
};

/** Verify and remove a refresh token */
userSchema.methods.consumeRefreshToken = function (rawToken) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const idx = this.refreshTokens.findIndex(t => t.tokenHash === tokenHash);
  if (idx === -1) return false;
  this.refreshTokens.splice(idx, 1);
  return true;
};

/** Strip sensitive fields for safe public representation */
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.twoFactorSecret;
  // Ensure virtuals or added fields like isHelper are included if they aren't by default
  return obj;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
