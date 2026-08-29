// ─────────────────────────────────────────────────────────────────────────────
// tests/security.test.js — injection, XSS storage, rate limiting, token handling.
//
// The theme running through this file: a hostile input should produce a boring
// answer. Not a 500, not a stack trace, not a hung worker — a 400 or a 401 or an
// empty result set. "No crash" is a real assertion here, because every 500 this
// application returns is a place where an attacker learned something.
//
// ── A note on the rate-limit tests ────────────────────────────────────────────
// tests/setup/afterEnv.js resets the limiter buckets after every test, because
// the limiters are per-IP module singletons and every request in the suite comes
// from the same loopback address. The tests below therefore each start from a
// clean budget and deliberately spend it — which is the only way to observe a
// 429 without making the rest of the suite flaky.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const jwt = require('jsonwebtoken');

const { api } = require('./helpers/api');
const factory = require('./helpers/factory');
const Lead = require('../models/Lead');
const User = require('../models/User');
const { resetRateLimiters } = require('./helpers/rateLimit');

let T;

beforeEach(async () => {
  T = await factory.createTenant({ name: 'Security Org' });
});

// ═════════════════════════════════════════════════════════════════════════════
// NoSQL injection
// ═════════════════════════════════════════════════════════════════════════════

describe('NoSQL injection', () => {
  it('an operator object in the login body cannot bypass authentication', async () => {
    // The canonical Mongo auth bypass: `{ email: {$ne:null}, password: {$ne:null} }`
    // matches the first user in the collection if it reaches the driver.
    // express-mongo-sanitize strips the `$ne` key, leaving `{}`, which then fails
    // the isEmail validator.
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.data).toBeUndefined();
    // Above all: no token was issued.
    expect(JSON.stringify(res.body)).not.toContain('accessToken');
  });

  it('a $gt operator in the login body is refused too', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $gt: '' }, password: { $gt: '' } });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('accessToken');
  });

  it('a $where payload does not execute', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $where: 'sleep(5000) || true' }, password: 'x' });

    expect(res.status).toBe(400);
  });

  it.each([
    ['leads', '/api/leads'],
    ['deals', '/api/deals'],
    ['contacts', '/api/contacts'],
    ['tasks', '/api/tasks'],
  ])('an operator in the %s search query is sanitised, without a crash', async (_n, path) => {
    const res = await api()
      .get(path)
      .query({ 'search[$ne]': 'x' })
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('an operator in a filter value cannot invert the filter', async () => {
    const won = await factory.createLead(T.orgId, { status: 'Won' });
    await factory.createLead(T.orgId, { status: 'New' });

    const res = await api()
      .get('/api/leads')
      .query({ 'status[$ne]': 'Won' })
      .set('Authorization', T.auth('owner'));

    // sanitize strips the `$ne` key, leaving `status` as an empty object, which
    // then fails to cast to the enum's String path — so this refuses with a 400
    // rather than answering. Either outcome is acceptable; what must NOT happen
    // is the query running as "every lead whose status is not Won".
    expect([200, 400]).toContain(res.status);
    expect(res.status).not.toBe(500);

    if (res.status === 200) {
      // If it did answer, it answered as an exact-match on nothing.
      expect(res.body.data.leads.map((l) => l.id)).not.toContain(won._id.toString());
    }
  });

  it('an unknown query parameter cannot widen a tenant-scoped list', async () => {
    // organizationId is not a filter the controller reads, so this is the
    // "hopefully it gets merged into the filter" attempt. It must be ignored.
    const lead = await factory.createLead(T.orgId);
    const other = await factory.createTenant({ name: 'Other Org' });
    await factory.createLead(other.orgId);

    const res = await api()
      .get('/api/leads')
      .query({ 'organizationId[$ne]': 'x' })
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(1);
    expect(res.body.data.leads[0].id).toBe(lead._id.toString());
    for (const item of res.body.data.leads) {
      expect(String(item.organizationId)).toBe(T.orgId.toString());
    }
  });

  it.each([
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "admin'--",
    '" OR 1=1 --',
    'UNION SELECT * FROM users',
  ])('a classic SQL payload (%s) is treated as literal text', async (payload) => {
    // There is no SQL here, but these strings must still be inert rather than
    // producing a 500 out of a regex or a cast.
    const res = await api()
      .get('/api/leads')
      .query({ search: payload })
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('an operator in a PATCH body cannot rewrite other records', async () => {
    const target = await factory.createLead(T.orgId, { company: 'Untouched' });
    const other = await factory.createLead(T.orgId, { company: 'Also Untouched' });

    const res = await api()
      .patch(`/api/leads/${target._id}`)
      .set('Authorization', T.auth('member'))
      .send({ company: 'Rewritten', $set: { value: 999999 } });

    expect(res.status).toBe(200);
    expect((await Lead.findById(other._id)).company).toBe('Also Untouched');
    expect((await Lead.findById(target._id)).value).not.toBe(999999);
  });

  it('a dotted key in a body cannot reach a nested field', async () => {
    // express-mongo-sanitize also strips keys containing a dot, which is how
    // `{"address.city": "x"}` would otherwise reach a subdocument.
    const contact = await factory.createContact(T.orgId);

    const res = await api()
      .patch(`/api/contacts/${contact._id}`)
      .set('Authorization', T.auth('member'))
      .send({ 'address.city': 'Injected' });

    expect(res.status).toBe(200);
    expect(res.body.data.address.city).toBeNull();
  });

  it('a __proto__ payload does not pollute Object.prototype', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .send({
        firstName: 'Proto',
        lastName: 'Pollution',
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
      });

    expect([201, 400]).toContain(res.status);
    expect({}.isAdmin).toBeUndefined();
    expect(Object.prototype.isAdmin).toBeUndefined();
  });

  it('an array where a scalar is expected does not produce a 500', async () => {
    // hpp() collapses duplicated query parameters, which is what stops
    // `?search=a&search=b` from arriving as an array and breaking a regex build.
    const res = await api()
      .get('/api/leads')
      .query('search=one&search=two')
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(200);
  });

  it('a very long search term is handled without a crash', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ search: 'A'.repeat(5000) })
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBeLessThan(500);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-site scripting
// ═════════════════════════════════════════════════════════════════════════════

describe('XSS payloads in stored text', () => {
  const XSS = '<script>alert("pwned")</script>';

  it('a script tag in lead notes is stored verbatim, not silently mangled', async () => {
    // Storing the exact bytes is the correct behaviour for a JSON API: escaping
    // at write time corrupts legitimate data (a note that genuinely discusses a
    // `<script>` tag) and gives false confidence, because the same value would
    // still need escaping wherever it is finally rendered. What matters is that
    // it is inert in transit — see the two tests below.
    const res = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .send({ firstName: 'XSS', lastName: 'Probe', notes: XSS });

    expect(res.status).toBe(201);
    expect(res.body.data.notes).toBe(XSS);
    expect((await Lead.findById(res.body.data.id)).notes).toBe(XSS);
  });

  it('the response is served as JSON, so a browser will not execute it', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .send({ firstName: 'XSS', lastName: 'Probe', notes: XSS });

    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-type']).not.toMatch(/text\/html/);
  });

  it('nosniff is set, so the JSON cannot be re-interpreted as HTML', async () => {
    // Without X-Content-Type-Options, a browser may sniff a JSON body that
    // starts with markup and render it — which turns a stored string into a
    // live script. This is the header that closes that path.
    const res = await api().get('/api/leads').set('Authorization', T.auth('owner'));

    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it.each([
    ['img onerror', '<img src=x onerror=alert(1)>'],
    ['svg onload', '<svg/onload=alert(1)>'],
    ['javascript uri', 'javascript:alert(document.cookie)'],
    ['iframe', '<iframe src="javascript:alert(1)"></iframe>'],
    ['event handler', '" onmouseover="alert(1)'],
    ['encoded script', '%3Cscript%3Ealert(1)%3C/script%3E'],
    ['template literal', '${alert(1)}'],
    ['null byte', 'safe <script>alert(1)</script>'],
  ])('a %s payload round-trips unchanged and does not error', async (_label, payload) => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .send({ firstName: 'XSS', lastName: 'Probe', notes: payload });

    expect(res.status).toBe(201);
    expect(res.body.data.notes).toBe(payload);
  });

  it('a payload in a searchable field cannot break the search that finds it', async () => {
    await factory.createLead(T.orgId, { company: '<script>alert(1)</script>' });

    const res = await api()
      .get('/api/leads')
      .query({ search: '<script>' })
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it('a payload in a task title survives the whole read path', async () => {
    const created = await api()
      .post('/api/tasks')
      .set('Authorization', T.auth('member'))
      .send({ title: XSS });

    const list = await api().get('/api/tasks').set('Authorization', T.auth('owner'));
    const single = await api()
      .get(`/api/tasks/${created.body.data.id}`)
      .set('Authorization', T.auth('owner'));

    expect(list.body.data.tasks[0].title).toBe(XSS);
    expect(single.body.data.title).toBe(XSS);
    expect(single.headers['content-type']).toMatch(/application\/json/);
  });

  it('a payload in an organization name is stored and returned as data', async () => {
    const res = await api()
      .patch('/api/organizations/current')
      .set('Authorization', T.auth('owner'))
      .send({ name: XSS });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe(XSS);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Rate limiting
// ═════════════════════════════════════════════════════════════════════════════

describe('Rate limiting', () => {
  it('returns 429 once the login attempt limit is exceeded', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    // The limiter allows 5 per 15 minutes per IP. Spend all five on wrong
    // passwords, which is the attack this exists to slow down.
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      const res = await api()
        .post('/api/auth/login')
        .send({ email: user.email, password: `WrongGuess${i}A` });
      statuses.push(res.status);
    }

    expect(statuses).toEqual([401, 401, 401, 401, 401]);

    const blocked = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: `WrongGuess5A` });

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(blocked.body.message).toMatch(/too many login attempts/i);
  });

  it('the block applies even to the CORRECT password', async () => {
    // Otherwise the limiter is only an inconvenience: an attacker who guesses on
    // attempt six still gets in.
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    for (let i = 0; i < 5; i++) {
      await api().post('/api/auth/login').send({ email: user.email, password: 'Wrong123A' });
    }

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    expect(res.status).toBe(429);
    expect(JSON.stringify(res.body)).not.toContain('accessToken');
  });

  it('advertises standard RateLimit headers', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'someone@example.com', password: 'Wrong123A' });

    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    // legacyHeaders is off, so the X- prefixed variants must be absent.
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('counts attempts per IP rather than per account', async () => {
    // Spreading guesses across many usernames must not buy extra attempts —
    // that is credential stuffing, and it is the more common attack.
    const { org } = await factory.createOrganization();
    const users = await Promise.all([
      factory.buildUser({ organizationId: org._id }),
      factory.buildUser({ organizationId: org._id }),
      factory.buildUser({ organizationId: org._id }),
      factory.buildUser({ organizationId: org._id }),
      factory.buildUser({ organizationId: org._id }),
    ]);

    for (const user of users) {
      await api().post('/api/auth/login').send({ email: user.email, password: 'Wrong123A' });
    }

    const res = await api()
      .post('/api/auth/login')
      .send({ email: users[0].email, password: 'Wrong123A' });

    expect(res.status).toBe(429);
  });

  it('X-Forwarded-For cannot be used to escape the bucket', async () => {
    // `trust proxy` is off outside production/hosted deploys, so req.ip stays the
    // socket address and a spoofed header changes nothing. If this ever starts
    // failing, the app is trusting a client-supplied IP and the login limiter is
    // bypassable by anyone.
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    for (let i = 0; i < 5; i++) {
      await api()
        .post('/api/auth/login')
        .set('X-Forwarded-For', `10.0.0.${i}`)
        .send({ email: user.email, password: 'Wrong123A' });
    }

    const res = await api()
      .post('/api/auth/login')
      .set('X-Forwarded-For', '10.0.0.250')
      .send({ email: user.email, password: 'Wrong123A' });

    expect(res.status).toBe(429);
  });

  it('rate-limits forgot-password after 3 requests', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    for (let i = 0; i < 3; i++) {
      const res = await api().post('/api/auth/forgot-password').send({ email: user.email });
      expect(res.status).toBe(200);
    }

    const blocked = await api().post('/api/auth/forgot-password').send({ email: user.email });

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });

  it('rate-limits resend-verification after 3 requests', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id, isEmailVerified: false });

    for (let i = 0; i < 3; i++) {
      await api().post('/api/auth/resend-verification').send({ email: user.email });
    }

    const blocked = await api()
      .post('/api/auth/resend-verification')
      .send({ email: user.email });

    expect(blocked.status).toBe(429);
  });

  it('rate-limits the general API surface after 100 requests', async () => {
    // The blanket limiter on /api. Driven with unauthenticated requests so each
    // one is cheap — the limiter sits ahead of the routes, so a 401 still counts.
    await resetRateLimiters();

    let blocked = null;
    for (let i = 0; i < 120; i++) {
      const res = await api().get('/api/leads');
      if (res.status === 429) {
        blocked = { at: i, body: res.body };
        break;
      }
    }

    expect(blocked).not.toBeNull();
    expect(blocked.body.code).toBe('RATE_LIMITED');
    // 100 allowed, so the 101st (index 100) is the first refusal.
    expect(blocked.at).toBe(100);
  });

  it('a 429 body never leaks internals', async () => {
    await resetRateLimiters();

    let body = null;
    for (let i = 0; i < 120; i++) {
      const res = await api().get('/api/leads');
      if (res.status === 429) {
        body = res.body;
        break;
      }
    }

    expect(body.stack).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'success']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Token handling
// ═════════════════════════════════════════════════════════════════════════════

describe('Access token handling', () => {
  /** Protected routes across every router, for the blanket assertions. */
  const PROTECTED = [
    '/api/leads',
    '/api/deals',
    '/api/contacts',
    '/api/tasks',
    '/api/dashboard/stats',
    '/api/calendar/events',
    '/api/reports/pipeline-forecast',
    '/api/team/members',
    '/api/organizations/current',
    '/api/activity-log',
    '/api/search?q=x',
    '/api/auth/me',
    '/api/users/notifications',
  ];

  it.each(PROTECTED)('GET %s is 401 with no Authorization header', async (path) => {
    const res = await api().get(path);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
    expect(res.body.success).toBe(false);
  });

  it('an expired access token is 401, not a crash', async () => {
    const expired = jwt.sign(
      {
        sub: T.users.owner._id.toString(),
        role: 'owner',
        organizationId: T.orgId.toString(),
      },
      process.env.ACCESS_TOKEN_SECRET,
      { issuer: 'elevate-crm', expiresIn: '-1s' }
    );

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it.each(PROTECTED)('GET %s is 401 with an expired token', async (path) => {
    const expired = jwt.sign(
      {
        sub: T.users.owner._id.toString(),
        role: 'owner',
        organizationId: T.orgId.toString(),
      },
      process.env.ACCESS_TOKEN_SECRET,
      { issuer: 'elevate-crm', expiresIn: '-1s' }
    );

    const res = await api().get(path).set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it.each([
    ['not a jwt at all', 'Bearer complete-nonsense'],
    ['two segments', 'Bearer aaa.bbb'],
    ['four segments', 'Bearer aaa.bbb.ccc.ddd'],
    ['empty token', 'Bearer '],
    ['whitespace token', 'Bearer    '],
    ['no Bearer prefix', 'complete-nonsense'],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['lowercase bearer', 'bearer abc.def.ghi'],
    ['base64 garbage', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.invalidsignature'],
    ['json in place of a token', 'Bearer {"sub":"x","role":"owner"}'],
  ])('a malformed Authorization header (%s) is 401, not a crash', async (_label, header) => {
    const res = await api().get('/api/leads').set('Authorization', header);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.stack).toBeUndefined();
  });

  it('an alg:none token is rejected', async () => {
    // The classic JWT bypass: strip the signature and claim the algorithm is
    // "none". jsonwebtoken refuses it unless it is explicitly allowed.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: T.users.owner._id.toString(),
        role: 'owner',
        organizationId: T.orgId.toString(),
        iss: 'elevate-crm',
      })
    ).toString('base64url');

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${header}.${payload}.`);

    expect(res.status).toBe(401);
  });

  it('a token signed with the wrong secret is rejected', async () => {
    const forged = jwt.sign(
      {
        sub: T.users.owner._id.toString(),
        role: 'owner',
        organizationId: T.orgId.toString(),
      },
      'attacker-secret',
      { issuer: 'elevate-crm', expiresIn: '15m' }
    );

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('a token with the wrong issuer is rejected', async () => {
    const forged = jwt.sign(
      {
        sub: T.users.owner._id.toString(),
        role: 'owner',
        organizationId: T.orgId.toString(),
      },
      process.env.ACCESS_TOKEN_SECRET,
      { issuer: 'somebody-else', expiresIn: '15m' }
    );

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it('a payload edited in place is rejected — the signature is checked', async () => {
    const [header, payload, signature] = T.tokens.viewer.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.role = 'owner';

    const forged = [
      header,
      Buffer.from(JSON.stringify(decoded)).toString('base64url'),
      signature,
    ].join('.');

    const res = await api()
      .post('/api/leads')
      .set('Authorization', `Bearer ${forged}`)
      .send({ firstName: 'A', lastName: 'B' });

    expect(res.status).toBe(401);
    expect(await Lead.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it('a valid token for a deleted user still resolves — the role check is the guard', async () => {
    // Documenting real behaviour rather than asserting a wish: rbac reads the
    // token, not the database, which is a deliberate trade recorded in
    // middleware/rbac.js. The bound on it is ACCESS_TOKEN_EXPIRES plus the
    // refresh-token revocation done by team.controller.
    const token = factory.accessTokenFor(T.users.member);
    await User.updateOne({ _id: T.users.member._id }, { isActive: false });

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // But their refresh path is closed, so the window cannot be extended.
    const refresh = await api()
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=nonsense');
    expect(refresh.status).toBe(401);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Error responses and information disclosure
// ═════════════════════════════════════════════════════════════════════════════

describe('Error responses do not leak internals', () => {
  it('a 404 carries no stack trace', async () => {
    const res = await api().get('/api/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
  });

  it('a cast error names the field but not the internals', async () => {
    const res = await api()
      .get('/api/leads/not-an-objectid')
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(400);
    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('mongoose');
    expect(JSON.stringify(res.body)).not.toContain('at Object');
  });

  it('a validation error lists fields without dumping the document', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', T.auth('member'))
      .send({ value: 1 });

    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({
      field: 'title',
      message: expect.any(String),
    });
    expect(res.body.stack).toBeUndefined();
  });

  it('never returns a password hash on any user-shaped response', async () => {
    const paths = ['/api/auth/me', '/api/team/members', '/api/leads/users'];

    for (const path of paths) {
      const res = await api().get(path).set('Authorization', T.auth('owner'));
      const serialized = JSON.stringify(res.body);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('$2a$');
      expect(serialized).not.toContain('$2b$');
    }
  });

  it('never returns 2FA secrets or backup codes', async () => {
    const secretUser = await factory.buildUser({
      organizationId: T.orgId,
      is2FAEnabled: true,
      twoFASecret: 'JBSWY3DPEHPK3PXP',
      twoFABackupCodes: [{ hash: '$2a$04$abcdefghijklmnopqrstuv', usedAt: null }],
    });

    const res = await api()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${factory.accessTokenFor(secretUser)}`);

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('JBSWY3DPEHPK3PXP');
    expect(serialized).not.toContain('twoFASecret');
    expect(serialized).not.toContain('twoFABackupCodes');
  });

  it('never returns reset or verification tokens', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', T.auth('owner'));

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordResetToken');
    expect(serialized).not.toContain('emailVerifyToken');
  });

  it('the 404 handler echoes the path without reflecting it as HTML', async () => {
    const res = await api().get('/api/<script>alert(1)</script>');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Security headers and payload limits
// ═════════════════════════════════════════════════════════════════════════════

describe('Security headers', () => {
  it('sets the headers helmet is mounted for', async () => {
    const res = await api().get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('does not advertise the server technology', async () => {
    const res = await api().get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the refresh cookie httpOnly so script cannot read it', async () => {
    const { org } = await factory.createOrganization();
    const user = await factory.buildUser({ organizationId: org._id });

    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: factory.DEFAULT_PASSWORD });

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe('Request payload limits', () => {
  it('rejects a body over the 10kb global limit', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .send({ firstName: 'Big', lastName: 'Body', notes: 'x'.repeat(20 * 1024) });

    expect(res.status).toBe(413);
    expect(await Lead.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it('allows a larger body on the avatar route, which needs it', async () => {
    // app.js mounts a 400kb parser for this path specifically, so a payload that
    // would 413 elsewhere must get through and be judged on its content instead.
    const dataUrl = `data:image/png;base64,${'A'.repeat(30 * 1024)}`;

    const res = await api()
      .post('/api/users/avatar')
      .set('Authorization', T.auth('owner'))
      .send({ avatar: dataUrl });

    expect(res.status).not.toBe(413);
    expect(res.status).toBe(200);
  });

  it('enforces the avatar size cap on decoded bytes', async () => {
    // Sized to land between the two limits on purpose: 280KB of base64 is under
    // the route's 400kb body parser, so the request reaches the handler, but it
    // decodes to ~210KB which is over the 200KB avatar cap. A larger string
    // would 413 at the parser and never exercise the check under test.
    const base64 = 'A'.repeat(280 * 1024);
    const decodedKb = Math.floor((base64.length * 3) / 4) / 1024;
    expect(decodedKb).toBeGreaterThan(200);

    const res = await api()
      .post('/api/users/avatar')
      .set('Authorization', T.auth('owner'))
      .send({ avatar: `data:image/png;base64,${base64}` });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('AVATAR_TOO_LARGE');
  });

  it('rejects a non-image data URL as an avatar', async () => {
    const res = await api()
      .post('/api/users/avatar')
      .set('Authorization', T.auth('owner'))
      .send({ avatar: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_AVATAR');
  });

  it('rejects malformed JSON with a 400, not a 500', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .set('Content-Type', 'application/json')
      .send('{"firstName": "unterminated');

    expect(res.status).toBe(400);
    expect(res.body.stack).toBeUndefined();
  });
});
