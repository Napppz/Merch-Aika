// api/_lib/security-middleware.js — Payload Limit + Request Timeout
// Protects against basic DoS attacks and resource exhaustion

/**
 * Security middleware untuk payload limit dan timeout
 * Usage:
 *   const { checkPayloadLimit, setRequestTimeout } = require('./_lib/security-middleware');
 *   checkPayloadLimit(req, res, maxMB); // Di awal handler
 *   setRequestTimeout(req, res, seconds); // Juga di awal handler
 */

/**
 * Check payload size limit
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {Number} maxMB - Maximum payload size in MB (default: 15)
 * @returns {Boolean} true jika OK, false jika exceed limit
 */
function checkPayloadLimit(req, res, maxMB = 15) {
  const maxBytes = maxMB * 1024 * 1024;
  const contentLength = parseInt(req.headers['content-length'] || 0);

  if (contentLength > maxBytes) {
    res.status(413).json({
      success: false,
      error: 'Payload too large',
      message: `Request size exceeds ${maxMB}MB limit. Received: ${(contentLength / 1024 / 1024).toFixed(2)}MB`
    });
    return false;
  }

  return true;
}

/**
 * Set request timeout
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {Number} seconds - Timeout in seconds (default: 30)
 */
function setRequestTimeout(req, res, seconds = 30) {
  const timeoutMs = seconds * 1000;

  // Set timeout on request
  req.setTimeout(timeoutMs, () => {
    console.error(`[SECURITY] Request timeout after ${seconds}s`);
    res.status(408).json({
      success: false,
      error: 'Request timeout',
      message: `Request took longer than ${seconds} seconds`
    });
  });

  // Set timeout on response
  res.setTimeout(timeoutMs, () => {
    console.error(`[SECURITY] Response timeout after ${seconds}s`);
    res.status(408).json({
      success: false,
      error: 'Request timeout',
      message: `Response did not complete within ${seconds} seconds`
    });
  });
}

/**
 * Combined security check (use this in most handlers)
 * @param {Object} req - HTTP request object
 * @param {Object} res - HTTP response object
 * @param {Object} options - Configuration options
 *   - maxPayloadMB: Max payload in MB (default: 15)
 *   - timeoutSeconds: Request timeout in seconds (default: 30)
 * @returns {Boolean} true jika semua OK
 */
function securityCheck(req, res, options = {}) {
  const maxPayloadMB = options.maxPayloadMB || 15;
  const timeoutSeconds = options.timeoutSeconds || 30;

  // Check payload
  if (!checkPayloadLimit(req, res, maxPayloadMB)) {
    return false;
  }

  // Set timeout
  setRequestTimeout(req, res, timeoutSeconds);

  return true;
}

module.exports = {
  checkPayloadLimit,
  setRequestTimeout,
  securityCheck
};
