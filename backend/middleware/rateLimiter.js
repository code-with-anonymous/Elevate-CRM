// ─────────────────────────────────────────────────────────────────────────────
// middleware/rateLimiter.js — express-rate-limit presets
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const rateLimit = require('express-rate-limit');

function buildLimiter(options) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders:   false,
    handler(req, res) {
      res.status(429).json({
        success: false,
        message: options.message || 'Too many requests. Please try again later.',
        code:    'RATE_LIMITED',
      });
    },
    ...options,
  });
}

/** 5 login attempts per 15 minutes per IP */
const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max:      5,
  message:  'Too many login attempts. Please try again in 15 minutes.',
});

/** 3 forgot-password requests per hour per IP */
const forgotPasswordLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max:      3,
  message:  'Too many password reset requests. Please try again in an hour.',
});

/** 3 resend-verification per hour per IP */
const resendVerificationLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max:      3,
  message:  'Too many verification emails sent. Please try again later.',
});

/** 100 requests per 15 minutes per IP — general API */
const generalLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  'Too many requests. Please slow down.',
});

/**
 * 15 AI generations per 15 minutes, per USER — every one is a paid Gemini call.
 *
 * Keyed on the authenticated user rather than the IP, unlike every limiter
 * above: generalLimiter's per-IP bucket already puts a whole office behind one
 * NAT address on a shared budget, and these buttons are slow enough to invite
 * repeat clicking. Falls back to req.ip if this ever runs unauthenticated —
 * it currently cannot, since the leads router applies verifyToken first.
 *
 * `sub` is the user id: middleware/auth.js sets req.user = { sub, role,
 * organizationId }. There is no req.user.id.
 */
const aiLimiter = buildLimiter({
  windowMs:     15 * 60 * 1000,
  max:          15,
  keyGenerator: (req) => req.user?.sub || req.ip,
  message:      'Too many AI requests. Please try again in a few minutes.',
  // Count only the calls that actually generated something. A validation 400
  // never reaches Gemini, and an upstream 502/503 is not billed either — without
  // this, a Gemini outage plus a few "Try again" clicks locks the user out of a
  // working feature for 15 minutes over requests that cost nothing.
  // Raw request volume is still capped by generalLimiter.
  skipFailedRequests: true,
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
  generalLimiter,
  aiLimiter,
};
