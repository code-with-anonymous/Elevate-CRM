// ─────────────────────────────────────────────────────────────────────────────
// tests/helpers/rateLimit.js
//
// express-rate-limit v7 attaches only `resetKey(key)` and `getKey(key)` to the
// middleware — there is no resetAll on the middleware itself. The default
// keyGenerator returns `request.ip` verbatim, so the key is whatever the socket
// reports. Supertest connects over IPv4 loopback, which Node surfaces as the
// IPv4-mapped IPv6 form; the other spellings are covered because resetting a
// key that was never seen is a no-op.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const limiters = require('../../middleware/rateLimiter');

const LIMITERS = [
  limiters.loginLimiter,
  limiters.forgotPasswordLimiter,
  limiters.resendVerificationLimiter,
  limiters.generalLimiter,
  limiters.aiLimiter,
];

const CANDIDATE_KEYS = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];

/** Clear every limiter's counter for the loopback client. */
async function resetRateLimiters(extraKeys = []) {
  const keys = [...CANDIDATE_KEYS, ...extraKeys];
  for (const limiter of LIMITERS) {
    for (const key of keys) {
      try {
        await limiter.resetKey(key);
      } catch {
        // A store that does not know the key throws or no-ops; either is fine.
      }
    }
  }
}

/**
 * How many requests the general limiter still allows. Useful when a test
 * deliberately drives a limiter to exhaustion and needs to know it started
 * from a clean slate.
 */
async function generalLimiterHits() {
  for (const key of CANDIDATE_KEYS) {
    try {
      const entry = await limiters.generalLimiter.getKey(key);
      if (entry) return entry.totalHits;
    } catch {
      /* not this key */
    }
  }
  return 0;
}

module.exports = { resetRateLimiters, generalLimiterHits, LIMITERS, CANDIDATE_KEYS };
