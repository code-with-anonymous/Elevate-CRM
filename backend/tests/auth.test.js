// ─────────────────────────────────────────────────────────────────────────────
// tests/auth.test.js — registration, login, token rotation, logout, recovery.
//
// Two things shape how this file is written.
//
// 1. Rate limits are real. POST /auth/login allows 5 attempts per 15 minutes per
//    IP and /auth/forgot-password allows 3 per hour, and every request in the
//    suite arrives from the same loopback address. tests/setup/afterEnv.js
//    resets the limiter buckets after each test, so each test starts with a full
//    budget — but a single test must stay inside it. Where a test needs several
//    logins the count is called out in a comment.
//
// 2. Verification, reset and invite tokens are stored SHA-256 hashed, so the
//    value a user would click cannot be read back out of Mongo. The only place
//    it exists in plaintext is the argument passed to the email service, which
//    is why tests/helpers/mailbox.js spies there. That is not a shortcut around
//    the product — it IS the product's only channel for those tokens.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');

const { api, refreshCookieFrom, refreshTokenValue } = require('./helpers/api');
const factory = require('./helpers/factory');
const { createMailbox } = require('./helpers/mailbox');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const Organization = require('../models/Organization');
const tokenService = require('../services/token.service');

const mailbox = createMailbox();

/** A registration body that satisfies every validator on the route. */
const validRegistration = (overrides = {}) => ({
  organizationName: 'Test Organization',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: `ada-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
  password: 'Password123',
  confirmPassword: 'Password123',
  ...overrides,
});

beforeEach(() => {
  mailbox.install();
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/register
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/register', () => {
  it('creates the user, the organization, and returns a token pair', async () => {
    const body = validRegistration();
    const res = await api().post('/api/auth/register').send(body);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(body.email.toLowerCase());
    expect(res.body.data.organization.name).toBe(body.organizationName);

    const user = await User.findOne({ email: body.email.toLowerCase() });
    expect(user).not.toBeNull();

    // The first user of a new organization is its owner, and the organization
    // must point back at them — a null ownerId would orphan the tenant.
    expect(user.role).toBe('owner');
    const org = await Organization.findById(user.organizationId);
    expect(org.ownerId.toString()).toBe(user._id.toString());
  });

  it('starts the account unverified and sends a verification email', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);

    const user = await User.findOne({ email: body.email.toLowerCase() });
    expect(user.isEmailVerified).toBe(false);

    expect(mailbox.last('verification').to).toBe(body.email.toLowerCase());
    expect(mailbox.last('verification').token).toEqual(expect.any(String));
  });

  it('never returns the password hash', async () => {
    const res = await api().post('/api/auth/register').send(validRegistration());

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('Password123');
  });

  it('stores a bcrypt hash, not the password', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);

    const user = await User.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
    expect(user.passwordHash).not.toBe(body.password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(body.password, user.passwordHash)).toBe(true);
  });

  it('sets the refresh token as an httpOnly cookie', async () => {
    const res = await api().post('/api/auth/register').send(validRegistration());

    const raw = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    expect(raw).toBeDefined();
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Path=/');
  });

  it('rejects a duplicate email with 409', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);

    const second = await api()
      .post('/api/auth/register')
      .send(validRegistration({ email: body.email }));

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EMAIL_IN_USE');
    expect(await User.countDocuments({ email: body.email.toLowerCase() })).toBe(1);
  });

  it('treats email as case-insensitive when rejecting duplicates', async () => {
    const body = validRegistration({ email: 'Mixed.Case@Example.com' });
    await api().post('/api/auth/register').send(body);

    const second = await api()
      .post('/api/auth/register')
      .send(validRegistration({ email: 'MIXED.CASE@EXAMPLE.COM' }));

    expect(second.status).toBe(409);
  });

  it.each([
    ['too short', 'Pass1'],
    ['no uppercase', 'password123'],
    ['no digit', 'PasswordOnly'],
  ])('rejects a weak password (%s)', async (_label, password) => {
    const res = await api()
      .post('/api/auth/register')
      .send(validRegistration({ password, confirmPassword: password }));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors.some((e) => e.field === 'password')).toBe(true);
  });

  it('creates no user when the password is rejected', async () => {
    const body = validRegistration({ password: 'weak', confirmPassword: 'weak' });
    await api().post('/api/auth/register').send(body);

    expect(await User.countDocuments({ email: body.email.toLowerCase() })).toBe(0);
  });

  it('rejects a mismatched confirmPassword', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send(validRegistration({ confirmPassword: 'Different123' }));

    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'confirmPassword')).toBe(true);
  });

  it.each(['organizationName', 'firstName', 'lastName', 'email'])(
    'rejects a missing %s',
    async (field) => {
      const body = validRegistration();
      delete body[field];

      const res = await api().post('/api/auth/register').send(body);

      expect(res.status).toBe(400);
      expect(res.body.errors.some((e) => e.field === field)).toBe(true);
    }
  );

  it('rejects a malformed email address', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send(validRegistration({ email: 'not-an-email' }));

    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/verify-email
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/verify-email', () => {
  it('verifies the account using the token from the email', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);
    const token = mailbox.tokenFor('verification', body.email.toLowerCase());

    const res = await api().post('/api/auth/verify-email').send({ token });

    expect(res.status).toBe(200);

    const user = await User.findOne({ email: body.email.toLowerCase() }).select(
      '+emailVerifyToken +emailVerifyExpiry'
    );
    expect(user.isEmailVerified).toBe(true);
    // The token is consumed, so the link cannot be replayed.
    expect(user.emailVerifyToken).toBeNull();
    expect(user.emailVerifyExpiry).toBeNull();
  });

  it('rejects a token that was already used', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);
    const token = mailbox.tokenFor('verification');

    await api().post('/api/auth/verify-email').send({ token });
    const replay = await api().post('/api/auth/verify-email').send({ token });

    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('INVALID_VERIFY_TOKEN');
  });

  it('rejects an expired verification token', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);
    const token = mailbox.tokenFor('verification');

    // Expire it in place. The route looks for `emailVerifyExpiry > now`, so
    // backdating the row is exactly what a 24-hour-old link looks like.
    await User.updateOne(
      { email: body.email.toLowerCase() },
      { emailVerifyExpiry: new Date(Date.now() - 1000) }
    );

    const res = await api().post('/api/auth/verify-email').send({ token });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_VERIFY_TOKEN');
  });

  it('rejects a garbage token', async () => {
    const res = await api()
      .post('/api/auth/verify-email')
      .send({ token: 'nonsense-token-value' });

    expect(res.status).toBe(400);
  });

  it('stores the verification token hashed, never in plaintext', async () => {
    const body = validRegistration();
    await api().post('/api/auth/register').send(body);
    const raw = mailbox.tokenFor('verification');

    const user = await User.findOne({ email: body.email.toLowerCase() }).select(
      '+emailVerifyToken'
    );

    expect(user.emailVerifyToken).not.toBe(raw);
    expect(user.emailVerifyToken).toBe(tokenService.hashToken(raw));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/login', () => {
  /** A verified, active user who can actually log in. */
  async function verifiedUser(overrides = {}) {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({
      organizationId: org._id,
      role: 'admin',
      isEmailVerified: true,
      ...overrides,
    });
    return { org, user };
  }

  it('logs in with the correct password and returns tokens', async () => {
    const { user, org } = await verifiedUser();

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.organization.id).toBe(org._id.toString());
    expect(res.body.data.requiresTwoFactor).toBeUndefined();
  });

  it('issues an access token that opens a protected route', async () => {
    const { user } = await verifiedUser();

    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const me = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.data.tokens.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
  });

  it('persists the refresh token as a hash, and sets it as a cookie', async () => {
    const { user } = await verifiedUser();

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const raw = refreshTokenValue(refreshCookieFrom(res));
    expect(raw).toEqual(expect.any(String));

    const stored = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
    expect(stored).not.toBeNull();
    expect(stored.isRevoked).toBe(false);
    expect(stored.userId.toString()).toBe(user._id.toString());
  });

  it('records a successful login in the history', async () => {
    const { user } = await verifiedUser();
    await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const history = await api()
      .get('/api/auth/login-history')
      .set('Authorization', `Bearer ${factory.accessTokenFor(user)}`);

    expect(history.status).toBe(200);
    expect(history.body.data[0].wasSuccessful).toBe(true);
  });

  it('rejects a wrong password with 401', async () => {
    const { user } = await verifiedUser();

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword123' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
    expect(refreshCookieFrom(res)).toBeNull();
  });

  it('records a failed login in the history', async () => {
    const { user } = await verifiedUser();
    await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword123' });

    const history = await api()
      .get('/api/auth/login-history')
      .set('Authorization', `Bearer ${factory.accessTokenFor(user)}`);

    expect(history.body.data[0].wasSuccessful).toBe(false);
  });

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    // Differing messages here would turn login into a user-enumeration oracle.
    const { user } = await verifiedUser();

    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword123' });

    const unknownEmail = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody-at-all@example.com', password: 'WrongPassword123' });

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
  });

  it('blocks an unverified email with 403 EMAIL_NOT_VERIFIED', async () => {
    const { user } = await verifiedUser({ isEmailVerified: false });

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
    expect(res.body.data).toBeUndefined();
    expect(refreshCookieFrom(res)).toBeNull();
  });

  it('blocks a deactivated user, without revealing that the account exists', async () => {
    const { user } = await verifiedUser({ isActive: false });

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a missing password before touching the database', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'a@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // ── Two-factor ─────────────────────────────────────────────────────────────

  describe('with two-factor authentication enabled', () => {
    async function twoFactorUser() {
      const secret = authenticator.generateSecret();
      const { org } = await factory.createOrganization();
      const user = await factory.buildUser({
        organizationId: org._id,
        role: 'admin',
        is2FAEnabled: true,
        twoFASecret: secret,
      });
      return { user, secret };
    }

    it('returns requiresTwoFactor and a tempToken instead of a session', async () => {
      const { user } = await twoFactorUser();

      const res = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data.requiresTwoFactor).toBe(true);
      expect(res.body.data.tempToken).toEqual(expect.any(String));

      // Crucially, NOT a real session: no access token, no refresh cookie, no
      // refresh row in the database.
      expect(res.body.data.tokens).toBeUndefined();
      expect(refreshCookieFrom(res)).toBeNull();
      expect(await RefreshToken.countDocuments({ userId: user._id })).toBe(0);
    });

    it('the tempToken carries twoFAPending and a short lifetime', async () => {
      const { user } = await twoFactorUser();

      const res = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

      const decoded = jwt.decode(res.body.data.tempToken);
      expect(decoded.twoFAPending).toBe(true);
      expect(decoded.role).toBeUndefined();

      // 5 minutes, not the 15-minute access-token window.
      expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(5 * 60);
    });

    it('the tempToken does NOT open ordinary protected routes', async () => {
      // This is the 2FA enforcement point. The temp token is signed with the
      // same secret as a real access token, so without the twoFAPending check in
      // middleware/auth.js it would verify cleanly on every protected route and
      // the second factor would be decorative.
      const { user } = await twoFactorUser();

      const login = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

      const temp = `Bearer ${login.body.data.tempToken}`;

      for (const path of ['/api/auth/me', '/api/leads', '/api/deals', '/api/team/members']) {
        const res = await api().get(path).set('Authorization', temp);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TWO_FA_REQUIRED');
      }
    });

    it('completes the login when the correct OTP is supplied', async () => {
      const { user, secret } = await twoFactorUser();

      const login = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

      const res = await api()
        .post('/api/auth/verify-otp')
        .set('Authorization', `Bearer ${login.body.data.tempToken}`)
        .send({ code: authenticator.generate(secret) });

      expect(res.status).toBe(200);
      expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));
      expect(refreshCookieFrom(res)).not.toBeNull();

      // And the token it hands back is a full one.
      const me = await api()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${res.body.data.tokens.accessToken}`);
      expect(me.status).toBe(200);
    });

    it('rejects an incorrect OTP', async () => {
      const { user } = await twoFactorUser();

      const login = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

      const res = await api()
        .post('/api/auth/verify-otp')
        .set('Authorization', `Bearer ${login.body.data.tempToken}`)
        .send({ code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });

    it('refuses a full access token on /auth/verify-otp', async () => {
      // The mirror of the check above: this route accepts ONLY a pending token,
      // so an already-signed-in session cannot finish somebody else's login.
      const { user } = await twoFactorUser();

      const res = await api()
        .post('/api/auth/verify-otp')
        .set('Authorization', `Bearer ${factory.accessTokenFor(user)}`)
        .send({ code: '123456' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NOT_PENDING_2FA');
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/refresh', () => {
  /** Log in and return the tokens plus the refresh cookie. */
  async function session() {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id, role: 'manager' });

    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const cookie = refreshCookieFrom(login);
    return { user, cookie, raw: refreshTokenValue(cookie), login };
  }

  it('rotates the refresh token and returns a new access token', async () => {
    const { raw, cookie } = await session();

    // The one-second pause is load-bearing, not flake insurance.
    //
    // generateRefreshToken signs { sub } only, so the payload's sole varying
    // field is `iat` — which has one-second resolution. Two refresh tokens
    // issued to the same user inside the same second are therefore BYTE
    // IDENTICAL, their SHA-256 hashes collide, and the "new" row cannot be told
    // apart from the revoked old one. See the KNOWN GAP block at the end of this
    // file, which pins that defect directly.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toEqual(expect.any(String));

    const newRaw = refreshTokenValue(refreshCookieFrom(res));
    expect(newRaw).not.toBe(raw);

    // Rotation means the OLD row is revoked and a NEW row exists.
    const oldRow = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
    const newRow = await RefreshToken.findOne({ token: tokenService.hashToken(newRaw) });
    expect(oldRow.isRevoked).toBe(true);
    expect(newRow.isRevoked).toBe(false);
  });

  it('returns the fresh user and organization alongside the tokens', async () => {
    // The client rebuilds its auth state from this response rather than from
    // sessionStorage, so a role change reaches the UI on the next refresh.
    const { user, cookie } = await session();

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.role).toBe('MANAGER');
    expect(res.body.data.organization).not.toBeNull();
  });

  it('reflects a role change made since the token was issued', async () => {
    const { user, cookie } = await session();
    await User.updateOne({ _id: user._id }, { role: 'viewer' });

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.body.data.user.role).toBe('VIEWER');

    // And the new access token carries the demoted role, not the old one.
    const decoded = jwt.decode(res.body.data.tokens.accessToken);
    expect(decoded.role).toBe('viewer');
  });

  it('rejects a reused (already rotated) refresh token', async () => {
    // Replay of a rotated token is the signature of a stolen cookie. The first
    // use revokes it; the second must fail rather than mint a parallel session.
    const { cookie } = await session();

    const first = await api().post('/api/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);

    const replay = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an explicitly revoked refresh token', async () => {
    const { raw, cookie } = await session();
    await RefreshToken.updateOne({ token: tokenService.hashToken(raw) }, { isRevoked: true });

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects an expired refresh token', async () => {
    const { user } = await session();

    // Signed with the real secret and issuer, but already past its expiry — so
    // this exercises the JWT expiry path rather than a signature failure.
    const expired = jwt.sign({ sub: user._id.toString() }, process.env.REFRESH_TOKEN_SECRET, {
      issuer: 'elevate-crm',
      expiresIn: '-1s',
    });

    const res = await api()
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('rejects a refresh token whose database row has expired', async () => {
    // Belt and braces: the JWT may still be valid while the row is not. The row
    // is the revocation record, so it has to be consulted too.
    const { raw, cookie } = await session();
    await RefreshToken.updateOne(
      { token: tokenService.hashToken(raw) },
      { expiresAt: new Date(Date.now() - 1000) }
    );

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a refresh token with a valid signature but no database row', async () => {
    // A token signed correctly but never issued — e.g. minted from a leaked
    // secret. A valid signature alone must not be enough; the row is what
    // records that the token was actually handed out and not yet revoked.
    //
    // Minted for a DIFFERENT user than the one who logged in: a token for the
    // same user in the same second would be byte-identical to the real one and
    // would find that user's genuine row. See the KNOWN GAP block below.
    const { org } = await factory.createOrganization();
    const neverLoggedIn = await factory.buildUser({ organizationId: org._id });
    const orphan = tokenService.generateRefreshToken({ sub: neverLoggedIn._id.toString() });

    const res = await api()
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${orphan}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a refresh token signed with the wrong secret', async () => {
    const { user } = await session();
    const forged = jwt.sign({ sub: user._id.toString() }, 'wrong-secret', {
      issuer: 'elevate-crm',
      expiresIn: '7d',
    });

    const res = await api()
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${forged}`);

    expect(res.status).toBe(401);
  });

  it('rejects a request with no refresh cookie at all', async () => {
    const res = await api().post('/api/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_REFRESH_TOKEN');
  });

  it('refuses to refresh a deactivated user', async () => {
    const { user, cookie } = await session();
    await User.updateOne({ _id: user._id }, { isActive: false });

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('USER_INACTIVE');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/logout', () => {
  async function session() {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    return {
      user,
      cookie: refreshCookieFrom(login),
      raw: refreshTokenValue(refreshCookieFrom(login)),
      access: login.body.data.tokens.accessToken,
    };
  }

  it('revokes the refresh token in the database', async () => {
    // The assertion that matters. A 200 with a cleared cookie but a live row
    // means "logout" only removed the client's copy — the token still works
    // from anywhere it was captured.
    const { raw, cookie, access } = await session();

    const before = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
    expect(before.isRevoked).toBe(false);

    const res = await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);

    const after = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
    expect(after.isRevoked).toBe(true);
  });

  it('clears the refresh cookie', async () => {
    const { cookie, access } = await session();

    const res = await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .set('Cookie', cookie);

    const cleared = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    expect(cleared).toMatch(/refreshToken=;/);
  });

  it('makes the revoked token unusable for refresh afterwards', async () => {
    const { cookie, access } = await session();

    await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${access}`)
      .set('Cookie', cookie);

    const res = await api().post('/api/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('requires authentication', async () => {
    const res = await api().post('/api/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('does not revoke OTHER sessions belonging to the same user', async () => {
    // Logging out of one device must not sign the user out everywhere. Two
    // logins, which is inside the 5-per-15-minute budget.
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const first = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    // Separated by a second deliberately. Two logins inside the same second
    // produce the SAME refresh token string (only `iat` varies, at one-second
    // resolution), so the two "sessions" would share one hash and this test
    // would be asserting against a collision rather than against logout. The
    // KNOWN GAP block at the end of this file pins that defect.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const second = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const firstRaw = refreshTokenValue(refreshCookieFrom(first));
    const secondRaw = refreshTokenValue(refreshCookieFrom(second));

    await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${first.body.data.tokens.accessToken}`)
      .set('Cookie', refreshCookieFrom(first));

    expect(
      (await RefreshToken.findOne({ token: tokenService.hashToken(firstRaw) })).isRevoked
    ).toBe(true);
    expect(
      (await RefreshToken.findOne({ token: tokenService.hashToken(secondRaw) })).isRevoked
    ).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Forgot / reset password
// ═════════════════════════════════════════════════════════════════════════════

describe('Forgot and reset password', () => {
  async function userWithSessions(sessionCount = 2) {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    // Create refresh rows directly rather than by logging in repeatedly, which
    // would eat the 5-attempt login budget.
    const raws = [];
    for (let i = 0; i < sessionCount; i++) {
      const raw = tokenService.generateRefreshToken({ sub: user._id.toString() });
      await tokenService.saveRefreshToken(user._id, raw, { headers: {}, ip: '127.0.0.1' });
      raws.push(raw);
    }
    return { user, raws };
  }

  it('sends a reset email and stores the token hashed', async () => {
    const { user } = await userWithSessions(0);

    const res = await api().post('/api/auth/forgot-password').send({ email: user.email });

    expect(res.status).toBe(200);

    const raw = mailbox.tokenFor('reset', user.email);
    const fresh = await User.findById(user._id).select('+passwordResetToken +passwordResetExpiry');

    expect(fresh.passwordResetToken).toBe(tokenService.hashToken(raw));
    expect(fresh.passwordResetToken).not.toBe(raw);
    expect(fresh.passwordResetExpiry.getTime()).toBeGreaterThan(Date.now());
  });

  it('answers 200 for an unknown email, and sends nothing', async () => {
    // A 404 here would confirm which addresses have accounts.
    const res = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody-here@example.com' });

    expect(res.status).toBe(200);
    expect(mailbox.outbox.filter((m) => m.type === 'reset')).toHaveLength(0);
  });

  it('resets the password with a valid token', async () => {
    const { user } = await userWithSessions(0);
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token = mailbox.tokenFor('reset');

    const res = await api().post('/api/auth/reset-password').send({
      token,
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });

    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id).select('+passwordHash');
    expect(await bcrypt.compare('BrandNew123', fresh.passwordHash)).toBe(true);
    expect(await bcrypt.compare(factory.DEFAULT_PASSWORD, fresh.passwordHash)).toBe(false);
  });

  it('lets the user log in with the new password and not the old one', async () => {
    const { user } = await userWithSessions(0);
    await api().post('/api/auth/forgot-password').send({ email: user.email });

    await api().post('/api/auth/reset-password').send({
      token: mailbox.tokenFor('reset'),
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });

    const withOld = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });
    expect(withOld.status).toBe(401);

    const withNew = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'BrandNew123' });
    expect(withNew.status).toBe(200);
  });

  it('enforces token expiry', async () => {
    const { user } = await userWithSessions(0);
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token = mailbox.tokenFor('reset');

    // The route matches on `passwordResetExpiry > now`. Backdating the row is
    // what a link older than the one-hour window looks like.
    await User.updateOne(
      { _id: user._id },
      { passwordResetExpiry: new Date(Date.now() - 1000) }
    );

    const res = await api().post('/api/auth/reset-password').send({
      token,
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');

    // And the password really did not change.
    const fresh = await User.findById(user._id).select('+passwordHash');
    expect(await bcrypt.compare(factory.DEFAULT_PASSWORD, fresh.passwordHash)).toBe(true);
  });

  it('revokes every existing session after a successful reset', async () => {
    // The point of a reset is usually that the account is compromised. Leaving
    // old refresh tokens live would leave the attacker signed in.
    const { user, raws } = await userWithSessions(3);
    await api().post('/api/auth/forgot-password').send({ email: user.email });

    const res = await api().post('/api/auth/reset-password').send({
      token: mailbox.tokenFor('reset'),
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });
    expect(res.status).toBe(200);

    for (const raw of raws) {
      const row = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
      expect(row.isRevoked).toBe(true);
    }
    expect(await RefreshToken.countDocuments({ userId: user._id, isRevoked: false })).toBe(0);
  });

  it('makes the pre-reset refresh tokens unusable through the API', async () => {
    const { user, raws } = await userWithSessions(1);
    await api().post('/api/auth/forgot-password').send({ email: user.email });

    await api().post('/api/auth/reset-password').send({
      token: mailbox.tokenFor('reset'),
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });

    const res = await api()
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${raws[0]}`);

    expect(res.status).toBe(401);
  });

  it('consumes the reset token so it cannot be replayed', async () => {
    const { user } = await userWithSessions(0);
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token = mailbox.tokenFor('reset');

    await api().post('/api/auth/reset-password').send({
      token,
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });

    const replay = await api().post('/api/auth/reset-password').send({
      token,
      password: 'Different123',
      confirmPassword: 'Different123',
    });

    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('INVALID_RESET_TOKEN');

    const fresh = await User.findById(user._id).select('+passwordHash');
    expect(await bcrypt.compare('BrandNew123', fresh.passwordHash)).toBe(true);
  });

  it('applies the password rules to the new password', async () => {
    const { user } = await userWithSessions(0);
    await api().post('/api/auth/forgot-password').send({ email: user.email });

    const res = await api().post('/api/auth/reset-password').send({
      token: mailbox.tokenFor('reset'),
      password: 'weak',
      confirmPassword: 'weak',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown reset token', async () => {
    const res = await api().post('/api/auth/reset-password').send({
      token: 'not-a-real-token',
      password: 'BrandNew123',
      confirmPassword: 'BrandNew123',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_RESET_TOKEN');
  });

  describe('GET /api/auth/validate-reset-token/:token', () => {
    it('reports a fresh token as valid', async () => {
      const { user } = await userWithSessions(0);
      await api().post('/api/auth/forgot-password').send({ email: user.email });

      const res = await api().get(
        `/api/auth/validate-reset-token/${mailbox.tokenFor('reset')}`
      );

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.email).toBe(user.email);
    });

    it('reports an expired token as invalid', async () => {
      const { user } = await userWithSessions(0);
      await api().post('/api/auth/forgot-password').send({ email: user.email });
      const token = mailbox.tokenFor('reset');

      await User.updateOne(
        { _id: user._id },
        { passwordResetExpiry: new Date(Date.now() - 1000) }
      );

      const res = await api().get(`/api/auth/validate-reset-token/${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.email).toBeUndefined();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/auth/change-password
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/change-password', () => {
  it('changes the password when the current one is correct', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${factory.accessTokenFor(user)}`)
      .send({
        currentPassword: factory.DEFAULT_PASSWORD,
        newPassword: 'Changed123',
        confirmNewPassword: 'Changed123',
      });

    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id).select('+passwordHash');
    expect(await bcrypt.compare('Changed123', fresh.passwordHash)).toBe(true);
  });

  it('rejects a wrong current password', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${factory.accessTokenFor(user)}`)
      .send({
        currentPassword: 'NotMyPassword1',
        newPassword: 'Changed123',
        confirmNewPassword: 'Changed123',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('WRONG_PASSWORD');
  });

  it('revokes other sessions but keeps the caller signed in', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });
    const mine = refreshTokenValue(refreshCookieFrom(login));

    // The extra `sid` claim is what makes this token distinct from the one the
    // login above issued. Without it the two are byte-identical inside the same
    // second and this test compares a token against itself. refreshTokens()
    // reads only `decoded.sub`, so the extra claim changes nothing the
    // application looks at. See the KNOWN GAP block below.
    const otherRaw = tokenService.generateRefreshToken({
      sub: user._id.toString(),
      sid: 'second-device',
    });
    await tokenService.saveRefreshToken(user._id, otherRaw, { headers: {}, ip: '127.0.0.1' });

    await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.data.tokens.accessToken}`)
      .set('Cookie', refreshCookieFrom(login))
      .send({
        currentPassword: factory.DEFAULT_PASSWORD,
        newPassword: 'Changed123',
        confirmNewPassword: 'Changed123',
      });

    expect(
      (await RefreshToken.findOne({ token: tokenService.hashToken(otherRaw) })).isRevoked
    ).toBe(true);
    expect((await RefreshToken.findOne({ token: tokenService.hashToken(mine) })).isRevoked).toBe(
      false
    );
  });

  it('requires authentication', async () => {
    const res = await api().post('/api/auth/change-password').send({
      currentPassword: 'a',
      newPassword: 'Changed123',
      confirmNewPassword: 'Changed123',
    });

    expect(res.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Sessions
// ═════════════════════════════════════════════════════════════════════════════

describe('Session management', () => {
  it('lists active sessions and marks the caller\'s own', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const login = await api()
      .post('/api/auth/login')
      .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const res = await api()
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${login.body.data.tokens.accessToken}`)
      .set('Cookie', refreshCookieFrom(login));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isCurrent).toBe(true);
    expect(res.body.data[0].browser).toBe('Chrome');
  });

  it('revokes a session by id', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const raw = tokenService.generateRefreshToken({ sub: user._id.toString() });
    const row = await tokenService.saveRefreshToken(user._id, raw, {
      headers: {},
      ip: '127.0.0.1',
    });

    const res = await api()
      .delete(`/api/auth/sessions/${row._id}`)
      .set('Authorization', `Bearer ${factory.accessTokenFor(user)}`);

    expect(res.status).toBe(200);
    expect((await RefreshToken.findById(row._id)).isRevoked).toBe(true);
  });

  it('cannot revoke another user\'s session', async () => {
    // revokeSession scopes by userId, so a session id belonging to somebody else
    // must 404 rather than sign them out.
    const { org } = await factory.createOrganization();
    const victim = await factory.buildUser({ organizationId: org._id });
    const attacker = await factory.buildUser({ organizationId: org._id, role: 'admin' });

    const raw = tokenService.generateRefreshToken({ sub: victim._id.toString() });
    const row = await tokenService.saveRefreshToken(victim._id, raw, {
      headers: {},
      ip: '127.0.0.1',
    });

    const res = await api()
      .delete(`/api/auth/sessions/${row._id}`)
      .set('Authorization', `Bearer ${factory.accessTokenFor(attacker)}`);

    expect(res.status).toBe(404);
    expect((await RefreshToken.findById(row._id)).isRevoked).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// KNOWN GAP — refresh tokens carry no per-session entropy.
//
// `it.failing` passes while the body throws and FAILS once the body starts
// passing, so each of these is both a record of a confirmed defect and the
// regression guard that will tell you a fix landed. When one goes red, change
// `it.failing` to `it`.
//
// The defect: token.service.generateRefreshToken signs the payload it is given,
// and auth.service always hands it exactly `{ sub }`. The only other fields in
// the JWT are `iat`, `exp` and `iss`, and iat/exp have ONE-SECOND resolution.
// So every refresh token issued to the same user within the same second is
// byte-for-byte identical, and RefreshToken.token stores the SHA-256 of that
// value — so two rows collide.
//
// Confirmed consequences, all reproduced below:
//   · Two logins in the same second create two rows sharing one hash, and
//     revokeRefreshToken uses updateOne, so logout revokes ONE of them.
//   · Rotation eats itself: refresh #1 revokes the old row and inserts a new row
//     with the SAME hash, so refresh #2 finds the revoked row first and 401s.
//     Two browser tabs refreshing within a second of each other is enough —
//     each tab has its own `isRefreshing` guard in axiosInstance.ts, so that
//     guard does not span them, and the user is signed out.
//
// A `jti` (or any random nonce) in the refresh payload fixes all of it.
// Reported to the maintainer rather than fixed; the brief was tests only.
// ═════════════════════════════════════════════════════════════════════════════

describe('KNOWN GAP: refresh token uniqueness', () => {
  it.failing('two logins in the same second must not produce the same token', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const first = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });
    const second = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    expect(refreshTokenValue(refreshCookieFrom(second))).not.toBe(
      refreshTokenValue(refreshCookieFrom(first))
    );
  });

  it.failing('two sessions must not collide onto one stored token hash', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const first = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });
    await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const hash = tokenService.hashToken(refreshTokenValue(refreshCookieFrom(first)));
    expect(await RefreshToken.countDocuments({ token: hash })).toBe(1);
  });

  it.failing('logging out of one session must leave the other session live', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const first = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });
    const second = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    await api()
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${first.body.data.tokens.accessToken}`)
      .set('Cookie', refreshCookieFrom(first));

    const stillWorks = await api()
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookieFrom(second));

    expect(stillWorks.status).toBe(200);
  });

  it.failing('two consecutive refreshes must both succeed', async () => {
    // The user-visible symptom: a session that dies the moment it is refreshed
    // twice inside one second, which two open tabs will do on their own.
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const first = await api().post('/api/auth/refresh').set('Cookie', refreshCookieFrom(login));
    expect(first.status).toBe(200);

    const second = await api().post('/api/auth/refresh').set('Cookie', refreshCookieFrom(first));
    expect(second.status).toBe(200);
  });
});
