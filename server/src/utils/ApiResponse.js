/**
 * @file ApiResponse.js
 * @description Standardized API response envelope for all MediFlow endpoints.
 * Enforces a consistent JSON contract: { success, statusCode, message, data, meta }.
 */

class ApiResponse {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} message    - Human-readable result message
   * @param {*}      data       - Response payload (object, array, or null)
   * @param {object} [meta]     - Optional pagination/metadata object
   */
  constructor(statusCode, message, data = null, meta = null) {
    this.success    = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.message    = message;
    this.data       = data;
    if (meta) this.meta = meta;
    this.timestamp  = new Date().toISOString();
  }

  /** Convenience sender — attaches statusCode and sends JSON. */
  send(res) {
    return res.status(this.statusCode).json(this);
  }
}

// ─── Static factory helpers ────────────────────────────────────────────────────

ApiResponse.ok = (res, data, message = 'Success', meta = null) =>
  new ApiResponse(200, message, data, meta).send(res);

ApiResponse.created = (res, data, message = 'Resource created') =>
  new ApiResponse(201, message, data).send(res);

ApiResponse.noContent = (res, message = 'No content') =>
  res.status(204).send();

module.exports = ApiResponse;
