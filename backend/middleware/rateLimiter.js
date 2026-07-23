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

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
  generalLimiter,
};
