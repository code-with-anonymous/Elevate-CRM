// ─────────────────────────────────────────────────────────────────────────────
// controllers/auth.controller.js — Thin HTTP layer, calls auth.service
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const authService   = require('../services/auth.service');
const tokenService  = require('../services/token.service');
const ApiResponse   = require('../utils/ApiResponse');
const asyncHandler  = require('../utils/asyncHandler');

// ── POST /auth/register ───────────────────────────────────────────────────────
const register = asyncHandler(async (req, res) => {
  const { organizationName, firstName, lastName, email, password } = req.body;

  const result = await authService.register(
    { orgName: organizationName, firstName, lastName, email, password },
    req
  );

  tokenService.setRefreshCookie(res, result.rawRefreshToken);

  return ApiResponse.created(res, 'Account created successfully. Please verify your email.', {
    user:         result.user,
    organization: result.organization,
    tokens:       result.tokens,
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await authService.login({ email, password }, req);

  // 2FA required
  if (result.requiresTwoFactor) {
    return ApiResponse.ok(res, 'Two-factor authentication required', {
      requiresTwoFactor: true,
      tempToken: result.tempToken,
    });
  }

  tokenService.setRefreshCookie(res, result.rawRefreshToken);

  return ApiResponse.ok(res, 'Login successful', {
    user:         result.user,
    organization: result.organization,
    tokens:       result.tokens,
  });
});

// ── POST /auth/google ─────────────────────────────────────────────────────────
const googleLogin = asyncHandler(async (req, res) => {
  const { accessToken } = req.body;
  const result = await authService.googleLogin(accessToken, req);

  tokenService.setRefreshCookie(res, result.rawRefreshToken);

  return ApiResponse.ok(res, 'Google Login successful', {
    user:         result.user,
    organization: result.organization,
    tokens:       result.tokens,
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
const logout = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  await authService.logout(rawRefreshToken);
  tokenService.clearRefreshCookie(res);
  return ApiResponse.ok(res, 'Logged out successfully');
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────
const refresh = asyncHandler(async (req, res) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  const result = await authService.refreshTokens(rawRefreshToken, req);

  tokenService.setRefreshCookie(res, result.rawRefreshToken);

  return ApiResponse.ok(res, 'Token refreshed', {
    tokens: {
      accessToken: result.accessToken,
      expiresIn:   result.expiresIn,
    },
  });
});

// ── POST /auth/verify-email ───────────────────────────────────────────────────
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;
  await authService.verifyEmail(token);
  return ApiResponse.ok(res, 'Email verified successfully');
});

// ── POST /auth/resend-verification ───────────────────────────────────────────
const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.resendVerification(email);
  return ApiResponse.ok(res, 'Verification email sent. Please check your inbox.');
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.forgotPassword(email);
  return ApiResponse.ok(res, 'If this email is registered, a password reset link has been sent.');
});

// ── GET /auth/validate-reset-token/:token ─────────────────────────────────────
const validateResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const result = await authService.validateResetToken(token);
  return ApiResponse.ok(res, 'Token status', result);
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  return ApiResponse.ok(res, 'Password reset successfully. Please log in.');
});

// ── POST /auth/change-password  [protected] ───────────────────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.sub;
  const rawRefreshToken = req.cookies?.refreshToken;
  await authService.changePassword(userId, currentPassword, newPassword, rawRefreshToken);
  return ApiResponse.ok(res, 'Password changed successfully.');
});

// ── POST /auth/verify-otp  [protected partial] ────────────────────────────────
const verifyOtp = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const userId = req.user.sub;

  const result = await authService.verifyOtp(userId, code, req);
  tokenService.setRefreshCookie(res, result.rawRefreshToken);

  return ApiResponse.ok(res, '2FA verified. Login complete.', {
    user:         result.user,
    organization: result.organization,
    tokens:       result.tokens,
  });
});

// ── POST /auth/2fa/enable  [protected] ───────────────────────────────────────
const enable2FA = asyncHandler(async (req, res) => {
  const userId = req.user.sub;
  const result = await authService.enable2FA(userId);
  return ApiResponse.ok(res, '2FA setup initiated. Scan the QR code.', result);
});

// ── POST /auth/2fa/verify  [protected] ───────────────────────────────────────
const verify2FA = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const userId = req.user.sub;
  await authService.verify2FA(userId, code);
  return ApiResponse.ok(res, '2FA enabled successfully.');
});

// ── POST /auth/2fa/disable  [protected] ──────────────────────────────────────
const disable2FA = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const userId = req.user.sub;
  await authService.disable2FA(userId, code);
  return ApiResponse.ok(res, '2FA disabled.');
});

// ── POST /auth/invite  [protected, role: owner|admin] ────────────────────────
const inviteMember = asyncHandler(async (req, res) => {
  const { email, role } = req.body;
  const { sub: invitedBy, organizationId } = req.user;

  // Fetch inviter's name for the email
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const inviter = await User.findById(invitedBy);
  const org     = await Organization.findById(organizationId);

  await authService.inviteMember(
    organizationId,
    invitedBy,
    email,
    role || 'member',
    `${inviter.firstName} ${inviter.lastName}`,
    org.name
  );

  return res.status(201).json({ success: true, message: 'Invitation sent successfully.' });
});

// ── GET /auth/invite/:token ───────────────────────────────────────────────────
const getInvite = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const details = await authService.getInviteDetails(token);
  return ApiResponse.ok(res, 'Invitation details', details);
});

// ── POST /auth/accept-invite ──────────────────────────────────────────────────
const acceptInvite = asyncHandler(async (req, res) => {
  const { token, firstName, lastName, password } = req.body;

  const result = await authService.acceptInvite(
    { token, firstName, lastName, password },
    req
  );

  tokenService.setRefreshCookie(res, result.rawRefreshToken);

  return ApiResponse.created(res, 'Invitation accepted. Account created.', {
    user:         result.user,
    organization: result.organization,
    tokens:       result.tokens,
  });
});

// ── GET /auth/me  [protected] ─────────────────────────────────────────────────
const getMe = asyncHandler(async (req, res) => {
  const userId = req.user.sub;
  const result = await authService.getMe(userId);
  return ApiResponse.ok(res, 'Current user', result);
});

// ── GET /auth/login-history  [protected] ─────────────────────────────────────
const getLoginHistory = asyncHandler(async (req, res) => {
  const userId = req.user.sub;
  const page   = parseInt(req.query.page || '1', 10);
  const limit  = parseInt(req.query.limit || '20', 10);
  const data   = await authService.getLoginHistory(userId, page, limit);
  return ApiResponse.ok(res, 'Login history', data);
});

// ── GET /auth/sessions  [protected] ──────────────────────────────────────────
const getSessions = asyncHandler(async (req, res) => {
  const userId = req.user.sub;
  const data   = await authService.getSessions(userId);
  return ApiResponse.ok(res, 'Active sessions', data);
});

// ── DELETE /auth/sessions/:sessionId  [protected] ────────────────────────────
const revokeSession = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const userId = req.user.sub;
  await authService.revokeSession(sessionId, userId);
  return ApiResponse.ok(res, 'Session revoked.');
});

module.exports = {
  register,
  login,
  googleLogin,
  logout,
  refresh,
  verifyEmail,
  resendVerification,
  forgotPassword,
  validateResetToken,
  resetPassword,
  changePassword,
  verifyOtp,
  enable2FA,
  verify2FA,
  disable2FA,
  inviteMember,
  getInvite,
  acceptInvite,
  getMe,
  getLoginHistory,
  getSessions,
  revokeSession,
};
