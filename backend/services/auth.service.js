// ─────────────────────────────────────────────────────────────────────────────
// services/auth.service.js — Pure business logic (no req/res)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const bcrypt   = require('bcryptjs');
const UAParser = require('ua-parser-js');
const { totp } = require('otplib');
const QRCode   = require('qrcode');
const crypto   = require('crypto');

const env             = require('../config/env');
const User            = require('../models/User');
const Organization    = require('../models/Organization');
const RefreshToken    = require('../models/RefreshToken');
const Invitation      = require('../models/Invitation');
const LoginHistory    = require('../models/LoginHistory');
const ApiError        = require('../utils/ApiError');
const tokenService    = require('./token.service');
const emailService    = require('./email.service');

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUA(userAgent) {
  const parser  = new UAParser(userAgent);
  const result  = parser.getResult();
  return {
    browser: result.browser.name || 'Unknown',
    os:      `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
    device:  result.device.type || 'desktop',
  };
}

function buildTokenPair(user) {
  const payload = {
    sub:            user._id.toString(),
    role:           user.role,
    organizationId: user.organizationId.toString(),
    permissions:    user.permissions,
  };
  const accessToken  = tokenService.generateAccessToken(payload);
  const refreshToken = tokenService.generateRefreshToken({ sub: user._id.toString() });
  return { accessToken, refreshToken };
}

// function formatUser(user, org) {
//   return {
//     user: {
//       id:              user._id.toString(),
//       email:           user.email,
//       firstName:       user.firstName,
//       lastName:        user.lastName,
//       avatarUrl:       user.avatarUrl,
//       role:            user.role.toUpperCase(),    // map to frontend enum: OWNER|ADMIN etc.
//       permissions:     user.permissions,
//       isEmailVerified: user.isEmailVerified,
//       is2FAEnabled:    user.is2FAEnabled,
//       twoFactorMethod: user.is2FAEnabled ? 'AUTHENTICATOR' : null,
//       phone:           user.phone,
//       jobTitle:        null,
//       timezone:        null,
//       createdAt:       user.createdAt,
//       updatedAt:       user.updatedAt,
//       lastLoginAt:     user.lastLogin,
//     },
//     organization: {
//       id:          org._id.toString(),
//       name:        org.name,
//       slug:        org.slug,
//       plan:        org.plan.toUpperCase(),
//       logoUrl:     org.logoUrl,
//       ownerId:     org.ownerId.toString(),
//       memberCount: org.memberCount,
//       createdAt:   org.createdAt,
//     },
//   };
// }


function formatUser(user, org) {
  return {
    user: {
      id:              user._id.toString(),
      email:           user.email,
      firstName:       user.firstName,
      lastName:        user.lastName,
      avatarUrl:       user.avatarUrl,
      role:            user.role.toUpperCase(),    
      permissions:     user.permissions,
      isEmailVerified: user.isEmailVerified,
      is2FAEnabled:    user.is2FAEnabled,
      twoFactorMethod: user.is2FAEnabled ? 'AUTHENTICATOR' : null,
      phone:           user.phone,
      jobTitle:        null,
      timezone:        null,
      createdAt:       user.createdAt,
      updatedAt:       user.updatedAt,
      lastLoginAt:     user.lastLogin,
    },
    // ✅ FIX: Safely check if org exists before accessing ._id
    organization: org ? {
      id:          org._id.toString(),
      name:        org.name,
      slug:        org.slug,
      plan:        org.plan ? org.plan.toUpperCase() : 'FREE',
      logoUrl:     org.logoUrl || null,
      ownerId:     org.ownerId ? org.ownerId.toString() : null,
      memberCount: org.memberCount || 1,
      createdAt:   org.createdAt,
    } : null,
  };
}

// ── Register ──────────────────────────────────────────────────────────────────

async function register({ orgName, firstName, lastName, email, password }, req) {
  // Check email uniqueness
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_IN_USE');
  }

  // Create organization
  const slug = await Organization.generateSlug(orgName);
  const org  = new Organization({ name: orgName, slug, ownerId: null, memberCount: 1 });

  // Hash password
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  // Create user
  const rawVerifyToken  = tokenService.generateRandomToken();
  const hashedVerify    = tokenService.hashToken(rawVerifyToken);
  const verifyExpiry    = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = new User({
    organizationId:    org._id,
    firstName,
    lastName,
    email:             email.toLowerCase(),
    passwordHash,
    role:              'owner',
    permissions:       [],
    isEmailVerified:   false,
    emailVerifyToken:  hashedVerify,
    emailVerifyExpiry: verifyExpiry,
  });

  org.ownerId = user._id;
  await org.save();
  await user.save();


  try {
    console.log('\n================ EMAIL DEBUG ================');
    console.log('📧 Preparing to send verification email');
    console.log('Recipient :', email);
    console.log('Sender    :', env.EMAIL_FROM);
    console.log('Client URL:', env.CLIENT_URL);
    console.log('SMTP Host :', env.SMTP_HOST);
    console.log('SMTP Port :', env.SMTP_PORT);
    console.log('SMTP User :', env.SMTP_USER);
    console.log('Token     :', rawVerifyToken);
    console.log('=============================================\n');

    const result = await emailService.sendVerificationEmail(email, rawVerifyToken);

    console.log('✅ Verification email successfully sent!');
    console.log('Mail Result:', result);
  } catch (mailErr) {
    console.error('\n========== EMAIL ERROR ==========');
    console.error('Message :', mailErr.message);
    console.error('Code    :', mailErr.code);
    console.error('Response:', mailErr.response);
    console.error('Command :', mailErr.command);
    console.error('Full Error:');
    console.error(mailErr);
    console.error('=================================\n');
  }

  // Generate tokens
  const { accessToken, refreshToken } = buildTokenPair(user);
  await tokenService.saveRefreshToken(user._id, refreshToken, req);

  return {
    ...formatUser(user, org),
    tokens: {
      accessToken,
      expiresIn: tokenService.parseExpiresIn(env.ACCESS_TOKEN_EXPIRES),
    },
    rawRefreshToken: refreshToken,
  };
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function login({ email, password }, req) {
  const ua = parseUA(req?.headers?.['user-agent']);

  console.log("\n========== LOGIN DEBUG ==========");
  console.log("Login Email:", email);

  // Find user with passwordHash
  const user = await User.findOne({
    email: email.toLowerCase(),
  }).select("+passwordHash");

  console.log("User Found:", !!user);

  if (user) {
    console.log("User ID:", user._id.toString());
    console.log("Email:", user.email);
    console.log("isActive:", user.isActive);
    console.log("isEmailVerified:", user.isEmailVerified);
    console.log("is2FAEnabled:", user.is2FAEnabled);
    console.log("Email Verify Token:", user.emailVerifyToken);
    console.log("Email Verify Expiry:", user.emailVerifyExpiry);
  }

  if (!user || !user.isActive) {
    console.log("❌ Login Failed: User not found or inactive.");

    if (user) {
      await LoginHistory.create({
        userId: user._id,
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent'],
        ...ua,
        status: "failed",
      });
    }

    throw ApiError.unauthorized(
      "Invalid email or password",
      "INVALID_CREDENTIALS"
    );
  }

  const passwordMatch = await bcrypt.compare(
    password,
    user.passwordHash
  );

  console.log("Password Match:", passwordMatch);

  if (!passwordMatch) {
    console.log("❌ Login Failed: Incorrect password.");

    await LoginHistory.create({
      userId: user._id,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      ...ua,
      status: "failed",
    });

    throw ApiError.unauthorized(
      "Invalid email or password",
      "INVALID_CREDENTIALS"
    );
  }

  if (!user.isEmailVerified) {
    console.log("❌ Login Failed: Email is NOT verified.");
    console.log("Current value:", user.isEmailVerified);
    console.log("Stored Verify Token:", user.emailVerifyToken);
    console.log("Token Expiry:", user.emailVerifyExpiry);

    throw ApiError.forbidden(
      "Please verify your email before logging in",
      "EMAIL_NOT_VERIFIED"
    );
  }

  console.log("✅ Email is verified.");

  if (user.is2FAEnabled) {
    console.log("🔐 2FA is enabled.");

    const tempToken = tokenService.generateAccessToken({
      sub: user._id.toString(),
      organizationId: user.organizationId.toString(),
      twoFAPending: true,
    });

    return {
      requiresTwoFactor: true,
      tempToken,
    };
  }

  console.log("✅ Login successful.");

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  await LoginHistory.create({
    userId: user._id,
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    ...ua,
    status: "success",
  });

  const org = await Organization.findById(user.organizationId);
  const { accessToken, refreshToken } = buildTokenPair(user);
  await tokenService.saveRefreshToken(user._id, refreshToken, req);

  console.log("=================================\n");

  return {
    ...formatUser(user, org),
    tokens: {
      accessToken,
      expiresIn: tokenService.parseExpiresIn(env.ACCESS_TOKEN_EXPIRES),
    },
    rawRefreshToken: refreshToken,
  };
}



// ── Google Login ──────────────────────────────────────────────────────────────

async function googleLogin(accessToken, req) {
  // Verify with Google
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw ApiError.unauthorized('Invalid Google access token', 'INVALID_GOOGLE_TOKEN');
  }

  const googleUser = await response.json();
  if (!googleUser.email) {
    throw ApiError.unauthorized('Google account has no email', 'INVALID_GOOGLE_ACCOUNT');
  }
  const email = googleUser.email.toLowerCase();

  let user = await User.findOne({ email }).select('+passwordHash');
  let org;

  if (user) {
    if (!user.isActive) {
      throw ApiError.unauthorized('User not found or inactive', 'USER_INACTIVE');
    }
    // Set isEmailVerified true if not already
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      user.emailVerifyToken = null;
      user.emailVerifyExpiry = null;
    }
    user.lastLogin = new Date();
    await user.save();
    org = await Organization.findById(user.organizationId);
  } else {
    // Register
    const orgName = `${googleUser.given_name || 'My'} Organization`;
    const slug = await Organization.generateSlug(orgName);
    org = new Organization({ name: orgName, slug, ownerId: null, memberCount: 1 });

    // Dummy password since they use Google
    const dummyPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(dummyPassword, env.BCRYPT_ROUNDS);

    user = new User({
      organizationId: org._id,
      firstName: googleUser.given_name || 'Google',
      lastName: googleUser.family_name || 'User',
      email,
      passwordHash,
      role: 'owner',
      permissions: [],
      isEmailVerified: true,
      avatarUrl: googleUser.picture || null,
    });

    org.ownerId = user._id;
    await org.save();
    await user.save();
  }

  const ua = parseUA(req?.headers?.['user-agent']);
  await LoginHistory.create({
    userId: user._id,
    ipAddress: req?.ip,
    userAgent: req?.headers?.['user-agent'],
    ...ua,
    status: 'success',
  });

  const { accessToken: jwtAccess, refreshToken: jwtRefresh } = buildTokenPair(user);
  await tokenService.saveRefreshToken(user._id, jwtRefresh, req);

  // ✅ FIX: Use user.toJSON() (relies on your schema's safe transform) 
  // and safely check if org exists to prevent ._id crashes
  return {
    user: user.toJSON(), 
    organization: org ? {
      id: org._id,
      name: org.name,
      slug: org.slug,
    } : null,
    tokens: {
      accessToken: jwtAccess,
      expiresIn: tokenService.parseExpiresIn(env.ACCESS_TOKEN_EXPIRES),
    },
    rawRefreshToken: jwtRefresh,
  };
}

// ── Verify Email ──────────────────────────────────────────────────────────────


async function verifyEmail(rawToken) {
  console.log("\n========== VERIFY EMAIL ==========");
  console.log("Raw Token:", rawToken);

  const hashed = tokenService.hashToken(rawToken);

  console.log("Hashed Token:", hashed);

  const user = await User.findOne({
    emailVerifyToken: hashed,
    emailVerifyExpiry: { $gt: new Date() },
  }).select("+emailVerifyToken +emailVerifyExpiry");

  console.log("User Found:", !!user);

  if (user) {
    console.log("User:", user.email);
    console.log("Before Verification:");
    console.log("isEmailVerified:", user.isEmailVerified);
    console.log("Stored Token:", user.emailVerifyToken);
    console.log("Expiry:", user.emailVerifyExpiry);
  }

  if (!user) {
    console.log("❌ Token not found or expired");
    throw ApiError.badRequest(
      "Invalid or expired verification token",
      "INVALID_VERIFY_TOKEN"
    );
  }

  user.isEmailVerified = true;
  user.emailVerifyToken = null;
  user.emailVerifyExpiry = null;

  await user.save();

  console.log("✅ User saved.");

  const updated = await User.findById(user._id);

  console.log("Database now says:");
  console.log("isEmailVerified:", updated.isEmailVerified);
  console.log("Verify Token:", updated.emailVerifyToken);
  console.log("=================================\n");

  try {
    await emailService.sendWelcomeEmail(user.email, user.firstName);
  } catch (e) {}
}

// ── Logout ────────────────────────────────────────────────────────────────────

async function logout(rawRefreshToken) {
  if (rawRefreshToken) {
    await tokenService.revokeRefreshToken(rawRefreshToken);
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

async function refreshTokens(rawRefreshToken, req) {
  if (!rawRefreshToken) {
    throw ApiError.unauthorized('No refresh token provided', 'NO_REFRESH_TOKEN');
  }

  // Verify JWT signature
  const decoded = tokenService.verifyRefreshToken(rawRefreshToken);

  // Check DB — find hashed token
  const hashed     = tokenService.hashToken(rawRefreshToken);
  const storedToken = await RefreshToken.findOne({ token: hashed });

  if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
    throw ApiError.unauthorized('Refresh token invalid or expired', 'INVALID_REFRESH_TOKEN');
  }

  // Revoke old token (rotation)
  storedToken.isRevoked = true;
  await storedToken.save();

  // Get user
  const user = await User.findById(decoded.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User not found or inactive', 'USER_INACTIVE');
  }

  const org = await Organization.findById(user.organizationId);
  const { accessToken, refreshToken: newRefreshToken } = buildTokenPair(user);
  await tokenService.saveRefreshToken(user._id, newRefreshToken, req);

  return {
    accessToken,
    expiresIn:      tokenService.parseExpiresIn(env.ACCESS_TOKEN_EXPIRES),
    rawRefreshToken: newRefreshToken,
  };
}



// ── Resend Verification ───────────────────────────────────────────────────────

async function resendVerification(email) {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+emailVerifyToken +emailVerifyExpiry');

  if (!user) return; // prevent email enumeration

  if (user.isEmailVerified) {
    throw ApiError.badRequest('Email is already verified', 'ALREADY_VERIFIED');
  }

  const rawToken  = tokenService.generateRandomToken();
  const hashed    = tokenService.hashToken(rawToken);
  const expiry    = new Date(Date.now() + 24 * 60 * 60 * 1000);

  user.emailVerifyToken  = hashed;
  user.emailVerifyExpiry = expiry;
  await user.save();

  await emailService.sendVerificationEmail(email, rawToken);
}

// ── Forgot Password ───────────────────────────────────────────────────────────

async function forgotPassword(email) {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+passwordResetToken +passwordResetExpiry');

  if (!user) return; // always return 200

  const rawToken = tokenService.generateRandomToken();
  const hashed   = tokenService.hashToken(rawToken);
  const expiry   = new Date(Date.now() + 60 * 60 * 1000); // 1h

  user.passwordResetToken  = hashed;
  user.passwordResetExpiry = expiry;
  await user.save();

  try {
    await emailService.sendPasswordResetEmail(email, rawToken);
  } catch (e) {
    console.error('Reset email failed:', e.message);
  }
}

// ── Reset Password ────────────────────────────────────────────────────────────

async function resetPassword(rawToken, newPassword) {
  const hashed = tokenService.hashToken(rawToken);
  const user   = await User.findOne({
    passwordResetToken:  hashed,
    passwordResetExpiry: { $gt: new Date() },
  }).select('+passwordHash +passwordResetToken +passwordResetExpiry');

  if (!user) {
    throw ApiError.badRequest('Invalid or expired reset token', 'INVALID_RESET_TOKEN');
  }

  user.passwordHash        = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  user.passwordResetToken  = null;
  user.passwordResetExpiry = null;
  await user.save();

  // Revoke all sessions
  await tokenService.revokeAllUserTokens(user._id);
}

// ── Change Password ───────────────────────────────────────────────────────────

async function changePassword(userId, currentPassword, newPassword, rawRefreshToken) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) {
    throw ApiError.badRequest('Current password is incorrect', 'WRONG_PASSWORD');
  }

  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await user.save();

  // Revoke all OTHER refresh tokens
  const hashed = rawRefreshToken ? tokenService.hashToken(rawRefreshToken) : null;
  const query  = { userId, isRevoked: false };
  if (hashed) query.token = { $ne: hashed };
  await RefreshToken.updateMany(query, { isRevoked: true });
}

// ── Verify OTP (2FA login completion) ─────────────────────────────────────────

async function verifyOtp(userId, code, req) {
  const user = await User.findById(userId).select('+twoFASecret');
  if (!user || !user.is2FAEnabled || !user.twoFASecret) {
    throw ApiError.badRequest('2FA not enabled for this account', '2FA_NOT_ENABLED');
  }

  totp.options = { step: 30, digits: 6 };
  const valid  = totp.check(code, user.twoFASecret);
  if (!valid) {
    throw ApiError.badRequest('Invalid OTP code', 'INVALID_OTP');
  }

  user.lastLogin = new Date();
  await user.save();

  const org = await Organization.findById(user.organizationId);
  const { accessToken, refreshToken } = buildTokenPair(user);
  await tokenService.saveRefreshToken(user._id, refreshToken, req);

  return {
    ...formatUser(user, org),
    tokens: {
      accessToken,
      expiresIn: tokenService.parseExpiresIn(env.ACCESS_TOKEN_EXPIRES),
    },
    rawRefreshToken: refreshToken,
  };
}

// ── 2FA Enable (generate secret + QR) ────────────────────────────────────────

async function enable2FA(userId) {
  const user   = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const secret    = totp.generateSecret();
  const otpAuthUrl = totp.keyuri(user.email, 'ElevateCRM', secret);
  const qrCodeUrl  = await QRCode.toDataURL(otpAuthUrl);

  // Store secret temporarily (not enabled until verified)
  await User.findByIdAndUpdate(userId, { twoFASecret: secret });

  return { secret, qrCodeUrl };
}

// ── 2FA Verify (complete setup) ───────────────────────────────────────────────

async function verify2FA(userId, code) {
  const user = await User.findById(userId).select('+twoFASecret');
  if (!user || !user.twoFASecret) {
    throw ApiError.badRequest('2FA setup not initiated', '2FA_NOT_INITIATED');
  }

  totp.options = { step: 30, digits: 6 };
  const valid  = totp.check(code, user.twoFASecret);
  if (!valid) {
    throw ApiError.badRequest('Invalid verification code', 'INVALID_OTP');
  }

  user.is2FAEnabled = true;
  await user.save();
}

// ── 2FA Disable ───────────────────────────────────────────────────────────────

async function disable2FA(userId, code) {
  const user = await User.findById(userId).select('+twoFASecret');
  if (!user || !user.is2FAEnabled || !user.twoFASecret) {
    throw ApiError.badRequest('2FA is not enabled', '2FA_NOT_ENABLED');
  }

  totp.options = { step: 30, digits: 6 };
  const valid  = totp.check(code, user.twoFASecret);
  if (!valid) {
    throw ApiError.badRequest('Invalid verification code', 'INVALID_OTP');
  }

  user.is2FAEnabled = false;
  user.twoFASecret  = null;
  await user.save();
}

// ── Invite Member ─────────────────────────────────────────────────────────────

async function inviteMember(organizationId, invitedBy, email, role, inviterName, orgName) {
  console.log('\n========== INVITE MEMBER DEBUG ==========');
  console.log('1. Checking if user exists...');
  
  // Check if already a member
  const existingUser = await User.findOne({
    email:          email.toLowerCase(),
    organizationId,
  });
  if (existingUser) {
    console.log('❌ FAILED: User already exists.');
    throw ApiError.conflict('This email is already a member of your organisation', 'ALREADY_MEMBER');
  }

  console.log('2. Checking for pending invitations...');
  // Check for pending invitation
  const existingInvite = await Invitation.findOne({
    email:          email.toLowerCase(),
    organizationId,
    isAccepted:     false,
    expiresAt:      { $gt: new Date() },
  });
  if (existingInvite) {
    console.log('❌ FAILED: Pending invite already exists.');
    throw ApiError.conflict('An invitation for this email is already pending', 'INVITE_PENDING');
  }

  console.log('3. Generating token...');
  const rawToken = tokenService.generateRandomToken();
  const hashed   = tokenService.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  console.log('4. Saving invitation to database...');
  await Invitation.create({
    organizationId,
    invitedBy,
    email:    email.toLowerCase(),
    role,
    token:    hashed,
    expiresAt,
  });
  console.log('✅ Invitation saved to DB successfully.');

  console.log('5. Preparing to send email...');
  console.log('   To:', email);
  console.log('   From:', env.EMAIL_FROM);
  
  try {
    await emailService.sendInvitationEmail(email, inviterName, orgName, rawToken);
    console.log('✅ Email function completed without throwing errors.');
  } catch (error) {
    console.error('❌ EMAIL ERROR CAUGHT IN INVITE MEMBER:');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Full Error:', error);
    // Intentionally not throwing so the 201 still returns, but we see the error
  }

  console.log('=========================================\n');
}

// ── Get Invite Details ────────────────────────────────────────────────────────

async function getInviteDetails(rawToken) {
  const hashed     = tokenService.hashToken(rawToken);
  const invitation = await Invitation.findOne({
    token:      hashed,
    isAccepted: false,
    expiresAt:  { $gt: new Date() },
  }).populate('organizationId').populate('invitedBy');

  if (!invitation) {
    throw ApiError.notFound('Invitation not found or has expired', 'INVITE_NOT_FOUND');
  }

  const org     = invitation.organizationId;
  const inviter = invitation.invitedBy;

  return {
    token:               rawToken,
    email:               invitation.email,
    firstName:           null,
    lastName:            null,
    role:                invitation.role.toUpperCase(),
    organizationName:    org.name,
    organizationLogoUrl: org.logoUrl,
    invitedBy:           inviter ? `${inviter.firstName} ${inviter.lastName}` : 'Unknown',
    expiresAt:           invitation.expiresAt,
    isExpired:           false,
    isUsed:              false,
  };
}

// ── Accept Invite ─────────────────────────────────────────────────────────────

async function acceptInvite({ token, firstName, lastName, password }, req) {
  const hashed     = tokenService.hashToken(token);
  const invitation = await Invitation.findOne({
    token:      hashed,
    isAccepted: false,
    expiresAt:  { $gt: new Date() },
  }).populate('organizationId');

  if (!invitation) {
    throw ApiError.badRequest('Invitation not found or has expired', 'INVITE_NOT_FOUND');
  }

  const existing = await User.findOne({ email: invitation.email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists', 'EMAIL_IN_USE');
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  const user = await User.create({
    organizationId:  invitation.organizationId._id,
    firstName,
    lastName,
    email:           invitation.email,
    passwordHash,
    role:            invitation.role,
    isEmailVerified: true, // invited users are pre-verified
  });

  invitation.isAccepted = true;
  await invitation.save();

  await Organization.findByIdAndUpdate(invitation.organizationId._id, {
    $inc: { memberCount: 1 },
  });

  const org = await Organization.findById(invitation.organizationId._id);
  const { accessToken, refreshToken } = buildTokenPair(user);
  await tokenService.saveRefreshToken(user._id, refreshToken, req);

  return {
    ...formatUser(user, org),
    tokens: {
      accessToken,
      expiresIn: tokenService.parseExpiresIn(env.ACCESS_TOKEN_EXPIRES),
    },
    rawRefreshToken: refreshToken,
  };
}

// ── Get Me ────────────────────────────────────────────────────────────────────

async function getMe(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const org = await Organization.findById(user.organizationId);
  return formatUser(user, org);
}

// ── Login History ─────────────────────────────────────────────────────────────

async function getLoginHistory(userId, page = 1, limit = 20) {
  const entries = await LoginHistory.find({ userId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  return entries.map((e) => ({
    id:           e._id.toString(),
    device:       e.device || 'Unknown',
    browser:      e.browser || 'Unknown',
    os:           e.os || 'Unknown',
    ip:           e.ipAddress || 'Unknown',
    location:     null,
    createdAt:    e.createdAt,
    isCurrent:    false,
    wasSuccessful: e.status === 'success',
  }));
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function getSessions(userId) {
  const tokens = await RefreshToken.find({
    userId,
    isRevoked:  false,
    expiresAt:  { $gt: new Date() },
  }).sort({ createdAt: -1 });

  return tokens.map((t) => ({
    id:         t._id.toString(),
    device:     'Unknown',
    browser:    'Unknown',
    os:         'Unknown',
    ip:         t.ipAddress || 'Unknown',
    location:   null,
    lastActive: t.updatedAt,
    createdAt:  t.createdAt,
    isCurrent:  false,
  }));
}

async function revokeSession(sessionId, userId) {
  const session = await RefreshToken.findOne({ _id: sessionId, userId });
  if (!session) throw ApiError.notFound('Session not found', 'SESSION_NOT_FOUND');
  session.isRevoked = true;
  await session.save();
}

// ── Validate Reset Token ──────────────────────────────────────────────────────

async function validateResetToken(rawToken) {
  const hashed = tokenService.hashToken(rawToken);
  const user   = await User.findOne({
    passwordResetToken:  hashed,
    passwordResetExpiry: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpiry');

  if (!user) {
    return { isValid: false };
  }
  return { isValid: true, email: user.email, expiresAt: user.passwordResetExpiry };
}

module.exports = {
  register,
  login,
  googleLogin,
  logout,
  refreshTokens,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  verifyOtp,
  enable2FA,
  verify2FA,
  disable2FA,
  inviteMember,
  getInviteDetails,
  acceptInvite,
  getMe,
  getLoginHistory,
  getSessions,
  revokeSession,
  validateResetToken,
};
