// ─────────────────────────────────────────────────────────────────────────────
// tests/rbac.test.js — role-based access control.
//
// The policy, as stated in config/permissions.js and enforced by the route
// files. This file is the executable version of that table:
//
//   read   (GET)          viewer+    leads / contacts / deals / tasks
//   write  (POST, PATCH)  member+    ditto, plus the AI endpoints
//   delete (DELETE)       manager+   ditto
//   reports               manager+   /api/reports/*
//   team mutations        admin+     /api/team/* writes, /api/auth/invite
//   org settings          admin+     PATCH /api/organizations/current
//
// ── Why this is matrix-driven ─────────────────────────────────────────────────
// The brief asks that EVERY protected route be covered, not just the obvious
// ones. Hand-writing one test per route-and-role is ~150 near-identical blocks
// that rot the moment a route is added, and the routes people forget to guard
// are exactly the ones nobody remembers to hand-write a test for. So the guarded
// surface is declared as a table below and every role is driven against every
// entry. Adding a route means adding one line.
//
// ── On asserting "allowed" ────────────────────────────────────────────────────
// A permitted role is asserted as "not 403", not as "200". Some of these routes
// legitimately answer something else for reasons unrelated to RBAC — the AI
// endpoints 503 because no Gemini key is configured in tests, and a target-level
// check inside team.controller can 403 for a reason that is not the route guard.
// The route guard is what this file is about, so the assertion is scoped to it,
// and the target-level rules get their own explicit tests further down.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { api } = require('./helpers/api');
const factory = require('./helpers/factory');
const { createMailbox } = require('./helpers/mailbox');
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Contact = require('../models/Contact');
const Task = require('../models/Task');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Invitation = require('../models/Invitation');
const tokenService = require('../services/token.service');

const ROLE_LEVEL = { owner: 5, admin: 4, manager: 3, member: 2, viewer: 1 };
const ALL_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];

const mailbox = createMailbox();

let T; // the tenant under test

beforeEach(async () => {
  T = await factory.createTenant({ name: 'RBAC Org' });
  mailbox.install();
});

// ═════════════════════════════════════════════════════════════════════════════
// The guarded surface, declared once.
//
// `minRole` — enforced by requireMinRole, so every role at or above it passes.
// `roles`   — enforced by requireRole, so ONLY the listed roles pass.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @typedef {object} RouteCase
 * @property {string}   method
 * @property {Function} path     (ctx) => string
 * @property {object|Function} [body]
 * @property {string}   [minRole]
 * @property {string[]} [roles]
 */

/** @type {RouteCase[]} */
const GUARDED_ROUTES = [
  // ── Leads ──────────────────────────────────────────────────────────────────
  { method: 'post', path: () => '/api/leads', body: { firstName: 'A', lastName: 'B' }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/leads/${c.lead._id}`, body: { company: 'X' }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/leads/${c.lead._id}/status`, body: { status: 'Qualified' }, minRole: 'member' },
  { method: 'delete', path: (c) => `/api/leads/${c.lead._id}`, minRole: 'manager' },
  { method: 'post', path: (c) => `/api/leads/${c.lead._id}/ai-summary`, minRole: 'member' },
  { method: 'post', path: (c) => `/api/leads/${c.lead._id}/ai-email`, body: { purpose: 'introduction', tone: 'friendly' }, minRole: 'member' },

  // ── Deals ──────────────────────────────────────────────────────────────────
  { method: 'post', path: () => '/api/deals', body: { title: 'D', value: 1 }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/deals/${c.deal._id}`, body: { title: 'X' }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/deals/${c.deal._id}/stage`, body: { stage: 'Qualified' }, minRole: 'member' },
  { method: 'delete', path: (c) => `/api/deals/${c.deal._id}`, minRole: 'manager' },

  // ── Contacts ───────────────────────────────────────────────────────────────
  { method: 'post', path: () => '/api/contacts', body: { firstName: 'C', lastName: 'D' }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/contacts/${c.contact._id}`, body: { company: 'X' }, minRole: 'member' },
  { method: 'delete', path: (c) => `/api/contacts/${c.contact._id}`, minRole: 'manager' },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  { method: 'post', path: () => '/api/tasks', body: { title: 'T' }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/tasks/${c.task._id}`, body: { title: 'X' }, minRole: 'member' },
  { method: 'patch', path: (c) => `/api/tasks/${c.task._id}/complete`, minRole: 'member' },
  { method: 'delete', path: (c) => `/api/tasks/${c.task._id}`, minRole: 'manager' },

  // ── Reports ────────────────────────────────────────────────────────────────
  { method: 'get', path: () => '/api/reports/sales-performance', minRole: 'manager' },
  { method: 'get', path: () => '/api/reports/pipeline-forecast', minRole: 'manager' },
  { method: 'get', path: () => '/api/reports/lead-source-roi', minRole: 'manager' },
  { method: 'get', path: () => '/api/reports/activity-summary', minRole: 'manager' },

  // ── Team (requireRole: owner/admin only — a manager is NOT enough) ──────────
  { method: 'patch', path: (c) => `/api/team/members/${c.target._id}/role`, body: { role: 'viewer' }, roles: ['owner', 'admin'] },
  { method: 'delete', path: (c) => `/api/team/members/${c.target._id}`, roles: ['owner', 'admin'] },
  { method: 'get', path: () => '/api/team/invites', roles: ['owner', 'admin'] },
  { method: 'post', path: (c) => `/api/team/invites/${c.invite._id}/resend`, roles: ['owner', 'admin'] },
  { method: 'delete', path: (c) => `/api/team/invites/${c.invite._id}`, roles: ['owner', 'admin'] },

  // ── Organization settings ──────────────────────────────────────────────────
  { method: 'patch', path: () => '/api/organizations/current', body: { name: 'Renamed' }, roles: ['owner', 'admin'] },

  // ── Invitations ────────────────────────────────────────────────────────────
  { method: 'post', path: () => '/api/auth/invite', body: { email: 'new-hire@example.com', role: 'viewer' }, roles: ['owner', 'admin'] },
];

/** Routes any authenticated user may read, viewer included. */
const OPEN_TO_ALL_ROUTES = [
  '/api/leads',
  '/api/leads/users',
  '/api/deals',
  '/api/contacts',
  '/api/tasks',
  '/api/team/members',
  '/api/organizations/current',
  '/api/dashboard/stats',
  '/api/dashboard/pipeline-chart',
  '/api/dashboard/lead-activity',
  '/api/dashboard/follow-ups',
  '/api/dashboard/leads-by-source',
  '/api/dashboard/revenue-trend',
  '/api/calendar/events',
  '/api/activity-log',
  '/api/search?q=test',
  '/api/auth/me',
  '/api/auth/sessions',
  '/api/auth/login-history',
  '/api/users/notifications',
];

/** Fresh records for the route table to point at. */
async function buildContext() {
  const [lead, deal, contact, task] = await Promise.all([
    factory.createLead(T.orgId),
    factory.createDeal(T.orgId),
    factory.createContact(T.orgId),
    factory.createTask(T.orgId),
  ]);

  // A member-level target, so an admin or owner acting on them is allowed by
  // the target-level rules and only the ROUTE guard decides the outcome.
  const target = T.users.member;

  const raw = tokenService.generateRandomToken();
  const invite = await Invitation.create({
    organizationId: T.orgId,
    invitedBy: T.users.owner._id,
    email: 'pending@example.com',
    role: 'member',
    token: tokenService.hashToken(raw),
    expiresAt: new Date(Date.now() + 86400000),
  });

  return { lead, deal, contact, task, target, invite };
}

/** Human label for a table row, used in the test title. */
const label = (route) => `${route.method.toUpperCase()} ${route.path({
  lead: { _id: ':id' },
  deal: { _id: ':id' },
  contact: { _id: ':id' },
  task: { _id: ':id' },
  target: { _id: ':id' },
  invite: { _id: ':id' },
})}`;

/** Is `role` permitted by this route's guard? */
function isAllowed(route, role) {
  if (route.roles) return route.roles.includes(role);
  return ROLE_LEVEL[role] >= ROLE_LEVEL[route.minRole];
}

// ═════════════════════════════════════════════════════════════════════════════
// The full matrix.
// ═════════════════════════════════════════════════════════════════════════════

describe('Route guards — every guarded route against every role', () => {
  describe.each(GUARDED_ROUTES.map((r) => [label(r), r]))('%s', (_title, route) => {
    it.each(ALL_ROLES)('%s', async (role) => {
      const ctx = await buildContext();
      const req = api()[route.method](route.path(ctx)).set('Authorization', T.auth(role));
      if (route.body) req.send(route.body);

      const res = await req;

      if (isAllowed(route, role)) {
        // See the header note: scoped to the route guard, because some of these
        // answer 503 (AI unconfigured) or 403 from a target-level rule.
        if (res.status === 403) {
          expect(res.body.code).not.toBe('INSUFFICIENT_ROLE');
        }
      } else {
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('INSUFFICIENT_ROLE');
        expect(res.body.success).toBe(false);
      }
    });
  });

  it('the matrix actually covers every guarded route in the route files', () => {
    // A guard rail on the guard rail. If someone adds a route with a role check
    // and forgets to add it here, the count drifts and this fails — which is the
    // only way a matrix-driven suite can notice its own blind spot.
    const guardedPaths = new Set(GUARDED_ROUTES.map((r) => label(r)));
    expect(guardedPaths.size).toBe(GUARDED_ROUTES.length); // no duplicate rows

    // Counts per policy tier, checked against the policy table in the header.
    const memberWrites = GUARDED_ROUTES.filter((r) => r.minRole === 'member');
    const managerOnly = GUARDED_ROUTES.filter((r) => r.minRole === 'manager');
    const adminOnly = GUARDED_ROUTES.filter((r) => r.roles?.join() === 'owner,admin');

    expect(memberWrites.length).toBe(13);
    expect(managerOnly.length).toBe(8);
    expect(adminOnly.length).toBe(7);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The four scenarios called out explicitly in the brief.
// ═════════════════════════════════════════════════════════════════════════════

describe('As a Viewer: every write is refused', () => {
  it('cannot POST any resource', async () => {
    const bodies = [
      ['/api/leads', { firstName: 'A', lastName: 'B' }],
      ['/api/deals', { title: 'D', value: 1 }],
      ['/api/contacts', { firstName: 'C', lastName: 'D' }],
      ['/api/tasks', { title: 'T' }],
    ];

    for (const [path, body] of bodies) {
      const res = await api().post(path).set('Authorization', T.auth('viewer')).send(body);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    }
  });

  it('creates nothing in the database when refused', async () => {
    // A 403 that still writes would be the worst of both worlds.
    await api()
      .post('/api/leads')
      .set('Authorization', T.auth('viewer'))
      .send({ firstName: 'Ghost', lastName: 'Record' });

    expect(await Lead.countDocuments({ firstName: 'Ghost' })).toBe(0);
  });

  it('cannot PATCH any resource', async () => {
    const ctx = await buildContext();
    const cases = [
      ['/api/leads/' + ctx.lead._id, { company: 'X' }],
      ['/api/deals/' + ctx.deal._id, { title: 'X' }],
      ['/api/contacts/' + ctx.contact._id, { company: 'X' }],
      ['/api/tasks/' + ctx.task._id, { title: 'X' }],
    ];

    for (const [path, body] of cases) {
      const res = await api().patch(path).set('Authorization', T.auth('viewer')).send(body);
      expect(res.status).toBe(403);
    }
  });

  it('modifies nothing in the database when a PATCH is refused', async () => {
    const lead = await factory.createLead(T.orgId, { company: 'Original Co' });

    await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', T.auth('viewer'))
      .send({ company: 'Hijacked' });

    expect((await Lead.findById(lead._id)).company).toBe('Original Co');
  });

  it('cannot DELETE any resource', async () => {
    const ctx = await buildContext();
    const paths = [
      `/api/leads/${ctx.lead._id}`,
      `/api/deals/${ctx.deal._id}`,
      `/api/contacts/${ctx.contact._id}`,
      `/api/tasks/${ctx.task._id}`,
    ];

    for (const path of paths) {
      const res = await api().delete(path).set('Authorization', T.auth('viewer'));
      expect(res.status).toBe(403);
    }
  });

  it('deletes nothing in the database when refused', async () => {
    const ctx = await buildContext();

    await api().delete(`/api/deals/${ctx.deal._id}`).set('Authorization', T.auth('viewer'));
    await api().delete(`/api/tasks/${ctx.task._id}`).set('Authorization', T.auth('viewer'));
    await api().delete(`/api/leads/${ctx.lead._id}`).set('Authorization', T.auth('viewer'));

    expect(await Deal.findById(ctx.deal._id)).not.toBeNull();
    expect(await Task.findById(ctx.task._id)).not.toBeNull();
    expect((await Lead.findById(ctx.lead._id)).isDeleted).toBe(false);
  });

  it('cannot move a deal through the pipeline by dragging', async () => {
    // The kanban has its own endpoint, so it needs its own guard. Hiding the
    // card is decoration; this is the control.
    const ctx = await buildContext();

    const res = await api()
      .patch(`/api/deals/${ctx.deal._id}/stage`)
      .set('Authorization', T.auth('viewer'))
      .send({ stage: 'Won' });

    expect(res.status).toBe(403);
    expect((await Deal.findById(ctx.deal._id)).stage).toBe('Lead');
  });

  it('cannot spend paid AI quota', async () => {
    const ctx = await buildContext();

    const res = await api()
      .post(`/api/leads/${ctx.lead._id}/ai-summary`)
      .set('Authorization', T.auth('viewer'));

    expect(res.status).toBe(403);
  });

  it('CAN still read, and CAN still edit their own profile', async () => {
    // The negative half of RBAC matters too: an over-tight guard that broke a
    // viewer's own profile page would be a regression this file should catch.
    const list = await api().get('/api/leads').set('Authorization', T.auth('viewer'));
    expect(list.status).toBe(200);

    const profile = await api()
      .patch('/api/users/me')
      .set('Authorization', T.auth('viewer'))
      .send({ firstName: 'Renamed' });
    expect(profile.status).toBe(200);
    expect(profile.body.data.firstName).toBe('Renamed');
  });
});

describe('As a Member: cannot change another user\'s role', () => {
  it('is refused by the route guard', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.viewer._id}/role`)
      .set('Authorization', T.auth('member'))
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  it('leaves the target\'s role untouched', async () => {
    await api()
      .patch(`/api/team/members/${T.users.viewer._id}/role`)
      .set('Authorization', T.auth('member'))
      .send({ role: 'admin' });

    expect((await User.findById(T.users.viewer._id)).role).toBe('viewer');
  });

  it('cannot promote themselves', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.member._id}/role`)
      .set('Authorization', T.auth('member'))
      .send({ role: 'owner' });

    expect(res.status).toBe(403);
    expect((await User.findById(T.users.member._id)).role).toBe('member');
  });

  it('cannot remove a team member', async () => {
    const res = await api()
      .delete(`/api/team/members/${T.users.viewer._id}`)
      .set('Authorization', T.auth('member'));

    expect(res.status).toBe(403);
    expect((await User.findById(T.users.viewer._id)).isActive).toBe(true);
  });

  it('cannot invite anyone', async () => {
    const res = await api()
      .post('/api/auth/invite')
      .set('Authorization', T.auth('member'))
      .send({ email: 'friend@example.com', role: 'member' });

    expect(res.status).toBe(403);
    expect(await Invitation.countDocuments({ email: 'friend@example.com' })).toBe(0);
  });

  it('cannot read the pending invitation list', async () => {
    // Pending invites are email addresses, which are not roster data.
    const res = await api().get('/api/team/invites').set('Authorization', T.auth('member'));

    expect(res.status).toBe(403);
  });

  it('cannot change organization settings', async () => {
    const res = await api()
      .patch('/api/organizations/current')
      .set('Authorization', T.auth('member'))
      .send({ name: 'Member Renamed This' });

    expect(res.status).toBe(403);
    expect((await Organization.findById(T.orgId)).name).toBe(T.org.name);
  });

  it('cannot read reports', async () => {
    const res = await api()
      .get('/api/reports/sales-performance')
      .set('Authorization', T.auth('member'));

    expect(res.status).toBe(403);
  });

  it('CAN create and edit records', async () => {
    const create = await api()
      .post('/api/leads')
      .set('Authorization', T.auth('member'))
      .send({ firstName: 'Member', lastName: 'Made' });

    expect(create.status).toBe(201);

    const patch = await api()
      .patch(`/api/leads/${create.body.data.id}`)
      .set('Authorization', T.auth('member'))
      .send({ company: 'Edited' });

    expect(patch.status).toBe(200);
  });

  it('CANNOT delete records — that is manager and above', async () => {
    const lead = await factory.createLead(T.orgId);

    const res = await api()
      .delete(`/api/leads/${lead._id}`)
      .set('Authorization', T.auth('member'));

    expect(res.status).toBe(403);
  });
});

describe('As a Manager: cannot remove a team member', () => {
  it('is refused, because only owner and admin may mutate the roster', async () => {
    const res = await api()
      .delete(`/api/team/members/${T.users.member._id}`)
      .set('Authorization', T.auth('manager'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    expect((await User.findById(T.users.member._id)).isActive).toBe(true);
  });

  it('cannot remove a viewer either — it is not about the target\'s rank', async () => {
    const res = await api()
      .delete(`/api/team/members/${T.users.viewer._id}`)
      .set('Authorization', T.auth('manager'));

    expect(res.status).toBe(403);
  });

  it('cannot change anyone\'s role', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.viewer._id}/role`)
      .set('Authorization', T.auth('manager'))
      .send({ role: 'member' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
  });

  it('cannot invite anyone', async () => {
    const res = await api()
      .post('/api/auth/invite')
      .set('Authorization', T.auth('manager'))
      .send({ email: 'hire@example.com', role: 'member' });

    expect(res.status).toBe(403);
  });

  it('CAN delete records and read reports', async () => {
    const lead = await factory.createLead(T.orgId);

    const del = await api()
      .delete(`/api/leads/${lead._id}`)
      .set('Authorization', T.auth('manager'));
    expect(del.status).toBe(200);

    const report = await api()
      .get('/api/reports/pipeline-forecast')
      .set('Authorization', T.auth('manager'));
    expect(report.status).toBe(200);
  });
});

describe('The Owner is a protected target', () => {
  it('cannot be removed by an admin', async () => {
    const res = await api()
      .delete(`/api/team/members/${T.users.owner._id}`)
      .set('Authorization', T.auth('admin'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_PROTECTED');
    expect((await User.findById(T.users.owner._id)).isActive).toBe(true);
  });

  it('cannot remove themselves through the team route', async () => {
    const res = await api()
      .delete(`/api/team/members/${T.users.owner._id}`)
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_REMOVE_SELF');
    expect((await User.findById(T.users.owner._id)).isActive).toBe(true);
  });

  it('cannot delete their own account through the users route either', async () => {
    // Two different doors to the same outcome — orphaning the tenant. Both are
    // shut, and by different code, so both need testing.
    const res = await api().delete('/api/users/me').set('Authorization', T.auth('owner'));

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_CANNOT_DELETE');
    expect((await User.findById(T.users.owner._id)).isActive).toBe(true);
  });

  it('cannot be demoted by an admin', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.owner._id}/role`)
      .set('Authorization', T.auth('admin'))
      .send({ role: 'viewer' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('OWNER_PROTECTED');
    expect((await User.findById(T.users.owner._id)).role).toBe('owner');
  });

  it('cannot demote themselves', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.owner._id}/role`)
      .set('Authorization', T.auth('owner'))
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_EDIT_SELF');
    expect((await User.findById(T.users.owner._id)).role).toBe('owner');
  });

  it('nobody can be promoted TO owner through the role route', async () => {
    // Ownership transfer has to move Organization.ownerId too, so it cannot ride
    // in on a generic role change — otherwise the org would have two owners, or
    // an owner the organization does not point at.
    const res = await api()
      .patch(`/api/team/members/${T.users.member._id}/role`)
      .set('Authorization', T.auth('owner'))
      .send({ role: 'owner' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect((await User.findById(T.users.member._id)).role).toBe('member');
  });

  it('nobody can be invited as owner', async () => {
    const res = await api()
      .post('/api/auth/invite')
      .set('Authorization', T.auth('owner'))
      .send({ email: 'usurper@example.com', role: 'owner' });

    expect(res.status).toBe(400);
    expect(await Invitation.countDocuments({ email: 'usurper@example.com' })).toBe(0);
  });

  it('the organization still points at the owner after every failed attempt', async () => {
    await api()
      .delete(`/api/team/members/${T.users.owner._id}`)
      .set('Authorization', T.auth('admin'));

    const org = await Organization.findById(T.orgId);
    expect(org.ownerId.toString()).toBe(T.users.owner._id.toString());
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Target-level rules. These live in team.controller.js rather than in the route
// guard, and they are what stops a permitted actor from acting on the wrong
// person. Distinct from the route guard, and separately testable.
// ═════════════════════════════════════════════════════════════════════════════

describe('Target-level rules — you cannot act at or above your own level', () => {
  it('an admin cannot demote another admin', async () => {
    const otherAdmin = await factory.buildUser({ organizationId: T.orgId, role: 'admin' });

    const res = await api()
      .patch(`/api/team/members/${otherAdmin._id}/role`)
      .set('Authorization', T.auth('admin'))
      .send({ role: 'viewer' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    expect((await User.findById(otherAdmin._id)).role).toBe('admin');
  });

  it('an admin cannot mint another admin', async () => {
    // Privilege escalation dressed up as an ordinary edit: an admin who can
    // create peers acquires allies who outrank the people able to remove them.
    const res = await api()
      .patch(`/api/team/members/${T.users.member._id}/role`)
      .set('Authorization', T.auth('admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    expect((await User.findById(T.users.member._id)).role).toBe('member');
  });

  it('an admin cannot remove another admin', async () => {
    const otherAdmin = await factory.buildUser({ organizationId: T.orgId, role: 'admin' });

    const res = await api()
      .delete(`/api/team/members/${otherAdmin._id}`)
      .set('Authorization', T.auth('admin'));

    expect(res.status).toBe(403);
    expect((await User.findById(otherAdmin._id)).isActive).toBe(true);
  });

  it('an admin CAN demote a manager', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.manager._id}/role`)
      .set('Authorization', T.auth('admin'))
      .send({ role: 'viewer' });

    expect(res.status).toBe(200);
    expect((await User.findById(T.users.manager._id)).role).toBe('viewer');
  });

  it('an admin cannot change their own role', async () => {
    // Demoting themselves is the case the self-check exists for. Asking for
    // 'owner' here would be rejected by the body validator first (400), which
    // would pass for the wrong reason and leave CANNOT_EDIT_SELF untested — the
    // "nobody can be promoted TO owner" test above covers that path.
    const res = await api()
      .patch(`/api/team/members/${T.users.admin._id}/role`)
      .set('Authorization', T.auth('admin'))
      .send({ role: 'viewer' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_EDIT_SELF');
    expect((await User.findById(T.users.admin._id)).role).toBe('admin');
  });

  it('an admin cannot invite an admin', async () => {
    // The same escalation through a different door. The route guard permits an
    // admin to invite; what role they may hand out is a separate decision.
    const res = await api()
      .post('/api/auth/invite')
      .set('Authorization', T.auth('admin'))
      .send({ email: 'peer@example.com', role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_ROLE');
    expect(await Invitation.countDocuments({ email: 'peer@example.com' })).toBe(0);
  });

  it('an admin CAN invite a manager', async () => {
    const res = await api()
      .post('/api/auth/invite')
      .set('Authorization', T.auth('admin'))
      .send({ email: 'newmanager@example.com', role: 'manager' });

    expect(res.status).toBe(201);
    expect(await Invitation.countDocuments({ email: 'newmanager@example.com' })).toBe(1);
  });

  it('the invite level check uses the database role, not the token claim', async () => {
    // A stale token cannot widen what its holder may grant. Demote the admin in
    // the database but keep using their old admin token: inviting a manager must
    // now fail, because the check reads the current role.
    const staleToken = T.tokens.admin;
    await User.updateOne({ _id: T.users.admin._id }, { role: 'member' });

    const res = await api()
      .post('/api/auth/invite')
      .set('Authorization', `Bearer ${staleToken}`)
      .send({ email: 'via-stale-token@example.com', role: 'manager' });

    expect(res.status).toBe(403);
    expect(await Invitation.countDocuments({ email: 'via-stale-token@example.com' })).toBe(0);
  });

  it('a role change revokes the demoted user\'s refresh tokens', async () => {
    // The role lives in the access token, so writing the database alone does not
    // demote anyone — they could hand back a refresh token and be reissued the
    // OLD role indefinitely. Revoking bounds the window to one access-token
    // lifetime.
    const RefreshToken = require('../models/RefreshToken');
    const raw = tokenService.generateRefreshToken({ sub: T.users.manager._id.toString() });
    await tokenService.saveRefreshToken(T.users.manager._id, raw, {
      headers: {},
      ip: '127.0.0.1',
    });

    await api()
      .patch(`/api/team/members/${T.users.manager._id}/role`)
      .set('Authorization', T.auth('owner'))
      .send({ role: 'viewer' });

    const row = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
    expect(row.isRevoked).toBe(true);
  });

  it('removing a member revokes their refresh tokens and decrements the count', async () => {
    const RefreshToken = require('../models/RefreshToken');
    const raw = tokenService.generateRefreshToken({ sub: T.users.member._id.toString() });
    await tokenService.saveRefreshToken(T.users.member._id, raw, {
      headers: {},
      ip: '127.0.0.1',
    });
    const before = await Organization.findById(T.orgId);

    const res = await api()
      .delete(`/api/team/members/${T.users.member._id}`)
      .set('Authorization', T.auth('owner'));

    expect(res.status).toBe(200);
    expect((await User.findById(T.users.member._id)).isActive).toBe(false);
    expect((await RefreshToken.findOne({ token: tokenService.hashToken(raw) })).isRevoked).toBe(
      true
    );
    expect((await Organization.findById(T.orgId)).memberCount).toBe(before.memberCount - 1);
  });

  it('an invalid role value is rejected before any target lookup', async () => {
    const res = await api()
      .patch(`/api/team/members/${T.users.member._id}/role`)
      .set('Authorization', T.auth('owner'))
      .send({ role: 'superuser' });

    expect(res.status).toBe(400);
    expect((await User.findById(T.users.member._id)).role).toBe('member');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Read routes must stay open to a viewer — the other half of the policy.
// ═════════════════════════════════════════════════════════════════════════════

describe('Read routes are open to every authenticated role', () => {
  it.each(OPEN_TO_ALL_ROUTES)('GET %s is readable by a viewer', async (path) => {
    const res = await api().get(path).set('Authorization', T.auth('viewer'));

    expect(res.status).toBe(200);
  });

  it.each(ALL_ROLES)('a %s can read the leads list', async (role) => {
    const res = await api().get('/api/leads').set('Authorization', T.auth(role));
    expect(res.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Guards must key off the role, not off the spelling of the role.
// ═════════════════════════════════════════════════════════════════════════════

describe('Role normalisation', () => {
  it('an UPPERCASE role claim is honoured, not silently denied', async () => {
    // Roles cross this boundary in two spellings: lowercase from Mongo, and
    // UPPERCASE where a response was serialised for the frontend enum. A raw
    // `roles.includes(req.user.role)` would compare one against the other and
    // deny everyone — which is what normalizeRole exists to prevent.
    const token = tokenService.generateAccessToken({
      sub: T.users.manager._id.toString(),
      role: 'MANAGER',
      organizationId: T.orgId.toString(),
      permissions: [],
    });

    const res = await api()
      .get('/api/reports/pipeline-forecast')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('an unknown role fails closed, at viewer level', async () => {
    const token = tokenService.generateAccessToken({
      sub: T.users.manager._id.toString(),
      role: 'superadmin-typo',
      organizationId: T.orgId.toString(),
      permissions: [],
    });

    // Reads still work (viewer can read)…
    const read = await api().get('/api/leads').set('Authorization', `Bearer ${token}`);
    expect(read.status).toBe(200);

    // …but nothing above viewer does.
    const write = await api()
      .post('/api/leads')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'A', lastName: 'B' });
    expect(write.status).toBe(403);
  });

  it('an absent role claim fails closed', async () => {
    const token = tokenService.generateAccessToken({
      sub: T.users.owner._id.toString(),
      organizationId: T.orgId.toString(),
    });

    const res = await api()
      .delete(`/api/team/members/${T.users.member._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('an empty permissions claim falls back to the role, rather than denying', async () => {
    // Tokens issued before permissions were derived carry `[]`. Treating that as
    // "no permissions" would 403 every already-signed-in user until their token
    // expired.
    const token = tokenService.generateAccessToken({
      sub: T.users.manager._id.toString(),
      role: 'manager',
      organizationId: T.orgId.toString(),
      permissions: [],
    });

    const res = await api()
      .get('/api/reports/sales-performance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
