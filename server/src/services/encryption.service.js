/**
 * @file encryption.service.js
 * @description AES-256-GCM symmetric encryption for PHI fields at rest.
 * Each encryption call produces a unique IV — ciphertexts are NOT deterministic.
 * Format stored: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 */

const crypto = require('crypto');
const env    = require('../config/env');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12;   // 96-bit IV recommended for GCM
const KEY_BUFFER = Buffer.from(env.ENCRYPTION_KEY, 'hex'); // Must be 32 bytes

if (KEY_BUFFER.length !== 32) {
  throw new Error('[EncryptionService] ENCRYPTION_KEY must be exactly 32 bytes (64 hex chars)');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * @param  {string} plaintext
 * @returns {string} "<iv>:<authTag>:<ciphertext>" — all hex-encoded
 */
function encrypt(plaintext, aad = '') {
  if (plaintext == null) return null;
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag   = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a value produced by encrypt().
 * @param  {string} ciphertext  "<iv>:<authTag>:<data>" — hex-encoded
 * @param  {string} [aad=''] Optional AAD used during encryption
 * @returns {string} Original plaintext
 */
function decrypt(ciphertext, aad = '') {
  if (!ciphertext) return null;
  const [ivHex, authTagHex, dataHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, Buffer.from(ivHex, 'hex'));
  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
