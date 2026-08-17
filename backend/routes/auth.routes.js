// ─────────────────────────────────────────────────────────────────────────────
// routes/auth.routes.js — All /api/auth/* routes with validation + middleware
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { Router } = require('express');
const { body, param } = require('express-validator');

const ctrl       = require('../controllers/auth.controller');
const validate   = require('../middleware/validate');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  loginLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
} = require('../middleware/rateLimiter');

const router = Router();

// ── Validation chains ─────────────────────────────────────────────────────────

const passwordRules = () =>
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number');

const confirmPasswordRules = (field = 'confirmPassword', ref = 'password') =>
  body(field)
    .custom((value, { req }) => {
      if (value !== req.body[ref]) throw new Error('Passwords do not match');
      return true;
    });

// ── Public routes ─────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post(
  '/register',
  [
    body('organizationName').trim().notEmpty().withMessage('Organization name is required')
      .isLength({ max: 100 }).withMessage('Organization name too long'),
    body('firstName').trim().notEmpty().withMessage('First name is required')
      .isLength({ max: 50 }).withMessage('First name too long'),
    body('lastName').trim().notEmpty().withMessage('Last name is required')
      .isLength({ max: 50 }).withMessage('Last name too long'),
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    passwordRules(),
    confirmPasswordRules(),
  ],
  validate,
  ctrl.register
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  ctrl.login
);

// POST /api/auth/logout
router.post('/logout', verifyToken, ctrl.logout);

// POST /api/auth/google
router.post(
  '/google',
  [body('accessToken').trim().notEmpty().withMessage('Google access token is required')],
  validate,
  ctrl.googleLogin
);

// POST /api/auth/refresh
router.post('/refresh', ctrl.refresh);

// POST /api/auth/verify-email
router.post(
  '/verify-email',
  [body('token').trim().notEmpty().withMessage('Verification token is required')],
  validate,
  ctrl.verifyEmail
);

// POST /api/auth/resend-verification
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  [body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()],
  validate,
  ctrl.resendVerification
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  [body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail()],
  validate,
  ctrl.forgotPassword
);

// GET /api/auth/validate-reset-token/:token
router.get(
  '/validate-reset-token/:token',
  [param('token').trim().notEmpty().withMessage('Token is required')],
  validate,
  ctrl.validateResetToken
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('token').trim().notEmpty().withMessage('Reset token is required'),
    passwordRules(),
    confirmPasswordRules(),
  ],
  validate,
  ctrl.resetPassword
);

// GET /api/auth/invite/:token
router.get(
  '/invite/:token',
  [param('token').trim().notEmpty().withMessage('Invite token is required')],
  validate,
  ctrl.getInvite
);

// POST /api/auth/accept-invite
router.post(
  '/accept-invite',
  [
    body('token').trim().notEmpty().withMessage('Invite token is required'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    passwordRules(),
    confirmPasswordRules(),
  ],
  validate,
  ctrl.acceptInvite
);

// ── Protected routes ──────────────────────────────────────────────────────────

// POST /api/auth/change-password
router.post(
  '/change-password',
  verifyToken,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
      .matches(/[A-Z]/).withMessage('New password must contain at least one uppercase letter')
      .matches(/[0-9]/).withMessage('New password must contain at least one number'),
    body('confirmNewPassword').custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  validate,
  ctrl.changePassword
);

// POST /api/auth/verify-otp  (protected partial — accepts tempToken)
router.post(
  '/verify-otp',
  verifyToken,
  [body('code').trim().notEmpty().withMessage('OTP code is required')],
  validate,
  ctrl.verifyOtp
);

// POST /api/auth/2fa/enable
router.post('/2fa/enable', verifyToken, ctrl.enable2FA);

// POST /api/auth/2fa/verify
router.post(
  '/2fa/verify',
  verifyToken,
  [body('code').trim().notEmpty().withMessage('Verification code is required')],
  validate,
  ctrl.verify2FA
);

// POST /api/auth/2fa/disable
router.post(
  '/2fa/disable',
  verifyToken,
  [body('code').trim().notEmpty().withMessage('Verification code is required')],
  validate,
  ctrl.disable2FA
);

// POST /api/auth/invite
router.post(
  '/invite',
  verifyToken,
  requireRole('owner', 'admin'),
  [
    body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
    // 'owner' removed: ownership is transferred, never invited. The controller
    // additionally refuses any role at or above the inviter's own level, which
    // a static list here cannot express.
    body('role').optional().isIn(['admin', 'manager', 'member', 'viewer'])
      .withMessage('Role must be admin, manager, member, or viewer'),
  ],
  validate,
  ctrl.inviteMember
);

// GET /api/auth/me
router.get('/me', verifyToken, ctrl.getMe);

// GET /api/auth/login-history
router.get('/login-history', verifyToken, ctrl.getLoginHistory);

// GET /api/auth/sessions
router.get('/sessions', verifyToken, ctrl.getSessions);

// DELETE /api/auth/sessions/:sessionId
router.delete(
  '/sessions/:sessionId',
  verifyToken,
  [param('sessionId').notEmpty().withMessage('Session ID is required')],
  validate,
  ctrl.revokeSession
);

module.exports = router;
