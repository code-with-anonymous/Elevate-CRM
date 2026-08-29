// ─────────────────────────────────────────────────────────────────────────────
// services/auth.service.js — Pure business logic (no req/res)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const bcrypt   = require('bcryptjs');
const UAParser = require('ua-parser-js');
const { authenticator } = require('otplib');
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
const { derivePermissions, roleLevel, normalizeRole } = require('../config/permissions');

// ── TOTP configuration ────────────────────────────────────────────────────────
//
// `authenticator`, NOT `totp`. otplib v12 exports both, and they are different
// classes that are easy to confuse and impossible to mix:
//
//   authenticator — base32 secrets, has generateSecret(). What Google
//                   Authenticator, 1Password, Authy and every otpauth:// URI
//                   actually speak.
//   totp          — raw/ASCII secrets, NO generateSecret().
//
// This file used `totp` for all four 2FA operations. Two consequences:
// `totp.generateSecret()` threw `TypeError: not a function` (a 500 on every
// "Enable 2FA" click, and the secret was never persisted), and even patched,
// `totp.check()` rejects an authenticator app's code for the same secret —
// the two generate different digits. 2FA could never have been enabled.
//
// window: 1 accepts the adjacent 30-second step either side. Phone clocks drift
// by a few seconds routinely; without this those users see "invalid code" for a
// code that is, by their phone, correct. step/digits are already 30/6 by default.
authenticator.options = { window: 1 };

/**
 * Lifetime of the half-finished-login token handed out between password and
 * code. Short on purpose — it is a credential in flight, not a session.
 */
const TWO_FA_TEMP_TOKEN_EXPIRES = '5m';

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
    // Derived, not `user.permissions` — that array is empty on every user in the
    // database, so signing it verbatim is what made requirePermission() deny
    // everyone. See config/permissions.js.
    permissions:    derivePermissions(user),
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
      // UPPERCASE to match the frontend UserRole enum; the store re-normalises
      // anyway, but sending the shape the client's type claims avoids a third
      // place where 'owner' vs 'OWNER' has to be remembered.
      role:            String(user.role || 'viewer').toUpperCase(),
      // Same derivation as the JWT, so `can()` on the client and
      // requirePermission() on the server always agree about one user.
      permissions:     derivePermissions(user),
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

  // NOTE: this function used to console.log the email, user id, verification
  // token, expiry and the password-match result on every single login attempt.
  // Render keeps those logs, so it amounted to a plaintext audit trail of who
  // signs in and a live feed of e-mail verification tokens. Removed, not
  // downgraded to debug — none of it belongs in a log at any level.

  // Find user with passwordHash
  const user = await User.findOne({
    email: email.toLowerCase(),
  }).select("+passwordHash");

  if (!user || !user.isActive) {
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

  if (!passwordMatch) {
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
    throw ApiError.forbidden(
      "Please verify your email before logging in",
      "EMAIL_NOT_VERIFIED"
    );
  }

  if (user.is2FAEnabled) {
    // The password was correct — that is half of the login, and it belongs in
    // the history whether or not the second factor follows. This used to return
    // before the LoginHistory.create below, so 2FA accounts (the ones most
    // likely to care) had a permanently empty sign-in log.
    await LoginHistory.create({
      userId: user._id,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      ...ua,
      status: "success",
    });

    // Deliberately NOT a normal access token.
    //
    // `twoFAPending: true` marks this as a half-finished login, and verifyToken
    // rejects it everywhere except /auth/verify-otp — see middleware/auth.js.
    // Before that check existed this token was signed with the same secret and
    // accepted by every protected route, so a password alone reached the whole
    // API and the second factor was decorative.
    //
    // Five minutes, not the usual fifteen: its only job is to survive the walk
    // to a phone and back.
    const tempToken = tokenService.generateAccessToken(
      {
        sub: user._id.toString(),
        organizationId: user.organizationId.toString(),
        twoFAPending: true,
      },
      TWO_FA_TEMP_TOKEN_EXPIRES
    );

    return {
      requiresTwoFactor: true,
      tempToken,
    };
  }

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

  // The fresh user and org go back to the caller, not just the tokens.
  //
  // They were already loaded here and then dropped, which forced the client to
  // re-apply the `user` it had persisted in sessionStorage across a reload. Two
  // consequences: a role change never reached the UI (the server issued a token
  // saying `member` while the interface kept rendering the admin controls from
  // the stale copy), and sessionStorage is user-writable, so editing `role` to
  // OWNER there unlocked every gated control in the app. The server 403s on the
  // actual requests, so it was never a real privilege escalation — it just made
  // RBAC look broken from both directions.
  return {
    ...formatUser(user, org),
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

/**
 * Complete a 2FA login. Accepts either a live TOTP code or one backup code.
 */
async function verifyOtp(userId, code, req) {
  const user = await User.findById(userId).select('+twoFASecret +twoFABackupCodes');
  if (!user || !user.is2FAEnabled || !user.twoFASecret) {
    throw ApiError.badRequest('2FA not enabled for this account', '2FA_NOT_ENABLED');
  }

  const submitted = String(code || '').trim();
  let valid = authenticator.check(submitted, user.twoFASecret);

  if (!valid) {
    // Backup code fallback — the path for "my phone is gone".
    //
    // Compared against every UNUSED hash rather than short-circuiting, and each
    // is marked usedAt on success, which is what makes them single-use. bcrypt
    // is slow by design, so this loop is also why backup codes are worth rate
    // limiting at the route (loginLimiter already covers /auth/login).
    const normalized = normalizeBackupCode(submitted);

    for (const entry of user.twoFABackupCodes) {
      if (entry.usedAt) continue;
      if (await bcrypt.compare(normalized, entry.hash)) {
        entry.usedAt = new Date();
        valid = true;
        break;
      }
    }
  }

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

/**
 * Number of single-use recovery codes issued at enrolment.
 * They are the only way back in when the authenticator device is lost.
 */
const BACKUP_CODE_COUNT = 10;

/**
 * Generate the recovery codes.
 *
 * Returns the plaintext for one-time display AND bcrypt hashes for storage.
 * The plaintext is never persisted — the same reasoning as passwords: a database
 * leak must not hand over the 2FA bypass along with everything else.
 *
 * Format is `xxxx-xxxx` from an unambiguous alphabet (no 0/O/1/I/L) because
 * people transcribe these by hand off a screenshot, months later, under stress.
 */
/**
 * Put a typed backup code into the exact form that was hashed (`XXXX-XXXX`).
 *
 * People retype these from a screenshot or a printout: lowercase, with spaces,
 * with or without the dash. Since only a hash is stored there is no way to
 * compare loosely, so normalising here is the difference between a valid code
 * working and a locked-out user being told it's invalid.
 */
function normalizeBackupCode(input) {
  const bare = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return bare.length === 8 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

async function generateBackupCodes() {
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const plain = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const chars = Array.from(crypto.randomBytes(8))
      .map((b) => ALPHABET[b % ALPHABET.length])
      .join('');
    plain.push(`${chars.slice(0, 4)}-${chars.slice(4)}`);
  }

  const hashed = await Promise.all(
    plain.map(async (code) => ({
      hash:   await bcrypt.hash(code, env.BCRYPT_ROUNDS),
      usedAt: null,
    }))
  );

  return { plain, hashed };
}

async function enable2FA(userId) {
  const user = await User.findById(userId).select('+twoFASecret');
  if (!user) throw ApiError.notFound('User not found');

  // Re-issuing a secret to an already-protected account would silently
  // invalidate the authenticator entry the user is relying on — and since
  // disable2FA needs a working code, that locks them out of their own account.
  // Turn it off first, deliberately, then re-enrol.
  if (user.is2FAEnabled) {
    throw ApiError.badRequest(
      'Two-factor authentication is already enabled. Disable it before setting it up again.',
      '2FA_ALREADY_ENABLED'
    );
  }

  const secret     = authenticator.generateSecret();
  const otpAuthUrl = authenticator.keyuri(user.email, 'ElevateCRM', secret);
  const qrCodeUrl  = await QRCode.toDataURL(otpAuthUrl);

  const { plain, hashed } = await generateBackupCodes();

  // Secret and codes are staged, NOT active: is2FAEnabled stays false until
  // verify2FA proves the user can actually read a code from their app. Enabling
  // on this call would lock out anyone whose scan silently failed.
  await User.findByIdAndUpdate(userId, {
    twoFASecret:      secret,
    twoFABackupCodes: hashed,
  });

  // `backupCodes` is returned exactly once, here. There is no endpoint to fetch
  // them again — only to regenerate by re-enrolling.
  return { secret, qrCodeUrl, backupCodes: plain };
}

// ── 2FA Verify (complete setup) ───────────────────────────────────────────────

async function verify2FA(userId, code) {
  const user = await User.findById(userId).select('+twoFASecret');
  if (!user || !user.twoFASecret) {
    throw ApiError.badRequest('2FA setup not initiated', '2FA_NOT_INITIATED');
  }

  if (!authenticator.check(code, user.twoFASecret)) {
    throw ApiError.badRequest('Invalid verification code', 'INVALID_OTP');
  }

  user.is2FAEnabled = true;
  await user.save();
}

// ── 2FA Disable ───────────────────────────────────────────────────────────────

/**
 * Turn 2FA off. Requires BOTH the account password and a current code.
 *
 * The password requirement is the point: removing a protection should be harder
 * than adding it. With a code alone, anyone who reaches a momentarily unlocked
 * laptop can strip the second factor off the account in seconds — the session is
 * already authenticated, and the authenticator app is usually on a phone sitting
 * right there. Same stance as GitHub, Google and Stripe.
 */
async function disable2FA(userId, code, password) {
  const user = await User.findById(userId).select('+twoFASecret +passwordHash');
  if (!user || !user.is2FAEnabled || !user.twoFASecret) {
    throw ApiError.badRequest('2FA is not enabled', '2FA_NOT_ENABLED');
  }

  // Password first: a wrong password should not reveal whether the code was
  // right, and this is the cheaper check to fail.
  const passwordMatches = await bcrypt.compare(password || '', user.passwordHash);
  if (!passwordMatches) {
    throw ApiError.badRequest('Incorrect password', 'INVALID_PASSWORD');
  }

  if (!authenticator.check(code, user.twoFASecret)) {
    throw ApiError.badRequest('Invalid verification code', 'INVALID_OTP');
  }

  user.is2FAEnabled     = false;
  user.twoFASecret      = null;
  // Drop the recovery codes with the secret. Leaving them behind would mean a
  // later re-enrolment silently inherits codes the user believes are retired.
  user.twoFABackupCodes = [];
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

/**
 * Active sessions for the security page.
 *
 * @param {string} userId
 * @param {object} [req] The caller's request — used only to identify which row
 *   is the caller's own session, by hashing their refresh cookie.
 *
 * This used to hardcode device/browser/os to 'Unknown' and isCurrent to false,
 * even though RefreshToken.userAgent holds the real string and parseUA() has
 * been sitting at the top of this file the whole time. Every row read "Unknown
 * on Unknown", so Revoke was a guess — and the one row you must not revoke, your
 * own, was indistinguishable from the rest.
 */
async function getSessions(userId, req) {
  const tokens = await RefreshToken.find({
    userId,
    isRevoked:  false,
    expiresAt:  { $gt: new Date() },
  }).sort({ createdAt: -1 });

  // The refresh token is httpOnly, so the browser sends it without the page
  // ever seeing it; only its hash is stored. Hashing the incoming cookie and
  // matching is how "this device" can be identified without trusting anything
  // the client claims about itself.
  const currentHash = req?.cookies?.refreshToken
    ? tokenService.hashToken(req.cookies.refreshToken)
    : null;

  return tokens.map((t) => {
    const ua = parseUA(t.userAgent);

    return {
      id:         t._id.toString(),
      device:     ua.device,
      browser:    ua.browser,
      os:         ua.os,
      ip:         t.ipAddress || 'Unknown',
      location:   null,
      lastActive: t.updatedAt,
      createdAt:  t.createdAt,
      isCurrent:  Boolean(currentHash && t.token === currentHash),
    };
  });
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
