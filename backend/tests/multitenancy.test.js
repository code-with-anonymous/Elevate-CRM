// ─────────────────────────────────────────────────────────────────────────────
// tests/multitenancy.test.js — organization isolation.
//
// This is the file that matters most. Every other guard in the application is
// recoverable: a broken role check leaks data to a colleague, a broken validator
// stores a bad enum. A broken tenant boundary leaks one customer's pipeline to
// another customer, and there is no version of that which is survivable.
//
// The invariant under test, stated once:
//
//     A request carrying Org A's token can neither read nor write any record
//     whose organizationId is Org B, by any route, under any role — and Org B's
//     records must never appear in a list, a search, a count, or an aggregate
//     that Org A can see.
//
// ── On the expected status code ───────────────────────────────────────────────
// Every controller scopes the QUERY — `findOne({ _id, organizationId })` —
// rather than fetching by id and comparing afterwards. A foreign id therefore
// matches nothing and the handler throws its ordinary "not found", so these
// assertions accept 404 as well as 403. That is the better of the two answers:
// a 403 would confirm the record exists, which is itself a small leak. What
// matters is that the status denies the request and the body carries no payload.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { api, ALL_RESOURCES, RESOURCES, idOf } = require('./helpers/api');
const factory = require('./helpers/factory');
const Invitation = require('../models/Invitation');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const tokenService = require('../services/token.service');

/** Any status that refuses the request. See the header note. */
const DENIED = [403, 404];

/** Roles present in every fixture tenant, most privileged first. */
const ALL_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];

/**
 * A string that exists ONLY inside Org B's records. Any Org A response
 * containing it is a leak, whatever the shape of that response — which makes it
 * a cheap, route-agnostic assertion that survives envelope changes.
 */
const B_MARKER = 'ZZ-ORG-B-CONFIDENTIAL-ZZ';
const A_MARKER = 'AA-ORG-A-OWNED-AA';

let A;
let B;

beforeEach(async () => {
  A = await factory.createTenant({ name: 'Org A Alpha' });
  B = await factory.createTenant({ name: 'Org B Bravo' });
});

/** Assert a response denied the request and returned no record. */
function expectDenied(res) {
  expect(DENIED).toContain(res.status);
  expect(res.body.success).toBe(false);
  expect(JSON.stringify(res.body)).not.toContain(B_MARKER);
}

/** Assert a successful response body is free of Org B's marker. */
function expectNoLeak(res) {
  expect(res.status).toBeLessThan(400);
  expect(JSON.stringify(res.body)).not.toContain(B_MARKER);
}

// ═════════════════════════════════════════════════════════════════════════════
// Per-resource isolation. The same body of assertions runs against Leads,
// Deals, Contacts and Tasks — one implementation, four resources, so a new
// resource cannot be added with a weaker boundary than the others.
// ═════════════════════════════════════════════════════════════════════════════

describe.each(ALL_RESOURCES.map((spec) => [spec.name, spec]))(
  'Tenant isolation — %s',
  (_name, spec) => {
    let aRecord;
    let bRecord;

    beforeEach(async () => {
      aRecord = await spec.build(factory, A.orgId, { [spec.searchField]: A_MARKER });
      bRecord = await spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER });
    });

    // ── Control ──────────────────────────────────────────────────────────────
    // Without this, every assertion below could be passing because the route is
    // broken for everyone rather than because the boundary holds.

    it("control: a user CAN read their own organization's record", async () => {
      const res = await api()
        .get(`${spec.path}/${aRecord._id}`)
        .set('Authorization', A.auth('owner'));

      expect(res.status).toBe(200);
      expect(idOf(spec.readOne(res.body))).toBe(aRecord._id.toString());
    });

    // ── GET by id ────────────────────────────────────────────────────────────

    it('GET by id: Org A cannot read an Org B record', async () => {
      const res = await api()
        .get(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth('owner'));

      expectDenied(res);
    });

    it.each(ALL_ROLES)('GET by id: an Org A %s cannot read an Org B record', async (role) => {
      // Run against every role, not just one. Privilege is scoped WITHIN a
      // tenant — being the owner of Org A must confer nothing at all in Org B,
      // and an owner-only test would miss a guard keyed off role instead of
      // organizationId.
      const res = await api()
        .get(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth(role));

      expectDenied(res);
    });

    it('GET by id: the denial is indistinguishable from a non-existent id', async () => {
      // If a cross-tenant read 403s while a missing id 404s, the status code
      // alone tells an attacker which ObjectIds are real records in some other
      // tenant. Enumeration is cheap once that oracle exists.
      const foreign = await api()
        .get(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth('owner'));
      const missing = await api()
        .get(`${spec.path}/${factory.missingId()}`)
        .set('Authorization', A.auth('owner'));

      expect(foreign.status).toBe(missing.status);
    });

    // ── PATCH ────────────────────────────────────────────────────────────────

    it('PATCH: Org A cannot modify an Org B record', async () => {
      const res = await api()
        .patch(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth('owner'))
        .send(spec.validPatch);

      expectDenied(res);
    });

    it('PATCH: the Org B record is unchanged in the database after the attempt', async () => {
      // A denial status is not proof the write did not land. Read the document
      // back out of Mongo and compare the field the patch targeted.
      const before = await spec.model.findById(bRecord._id).lean();

      await api()
        .patch(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth('owner'))
        .send(spec.validPatch);

      const after = await spec.model.findById(bRecord._id).lean();
      const [patchedField] = Object.keys(spec.validPatch);

      expect(after[patchedField]).toBe(before[patchedField]);
      expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
      expect(after[spec.searchField]).toBe(B_MARKER);
    });

    it.each(ALL_ROLES)('PATCH: an Org A %s cannot modify an Org B record', async (role) => {
      const res = await api()
        .patch(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth(role))
        .send(spec.validPatch);

      // A viewer is stopped by the role guard before the tenancy filter is ever
      // consulted; owner/admin/manager/member reach the filter. Both are
      // denials, and this asserts the outcome rather than which guard fired.
      expectDenied(res);
    });

    it('PATCH: a record cannot be moved into another tenant by forging organizationId', async () => {
      // The write half of the boundary. If organizationId were an updatable
      // field, Org A could push its own records into Org B — or, more usefully
      // to an attacker, pull a foreign record across into its own tenant.
      const res = await api()
        .patch(`${spec.path}/${aRecord._id}`)
        .set('Authorization', A.auth('owner'))
        .send({ ...spec.validPatch, organizationId: B.orgId.toString() });

      expect(res.status).toBe(200);

      const after = await spec.model.findById(aRecord._id).lean();
      expect(after.organizationId.toString()).toBe(A.orgId.toString());
    });

    // ── DELETE ───────────────────────────────────────────────────────────────

    it('DELETE: Org A cannot delete an Org B record', async () => {
      const res = await api()
        .delete(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth('owner'));

      expectDenied(res);
    });

    it('DELETE: the Org B record still exists, and is not soft-deleted, afterwards', async () => {
      await api()
        .delete(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth('owner'));

      const after = await spec.model.findById(bRecord._id).lean();
      expect(after).not.toBeNull();
      if (spec.softDelete) {
        expect(after.isDeleted).not.toBe(true);
      }
    });

    it.each(ALL_ROLES)('DELETE: an Org A %s cannot delete an Org B record', async (role) => {
      const res = await api()
        .delete(`${spec.path}/${bRecord._id}`)
        .set('Authorization', A.auth(role));

      expectDenied(res);
      expect(await spec.model.findById(bRecord._id).lean()).not.toBeNull();
    });

    // ── LIST ─────────────────────────────────────────────────────────────────

    it('LIST: returns only Org A records', async () => {
      const res = await api().get(spec.path).set('Authorization', A.auth('owner'));

      expect(res.status).toBe(200);
      const items = spec.readList(res.body);
      expect(items).toHaveLength(1);
      expect(idOf(items[0])).toBe(aRecord._id.toString());
    });

    it('LIST: Org B ids never appear in the response', async () => {
      // Seed several records on each side so a boundary that leaks only under
      // pagination or a particular sort still shows up.
      await Promise.all([
        spec.build(factory, A.orgId, {}),
        spec.build(factory, A.orgId, {}),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
      ]);

      const res = await api()
        .get(spec.path)
        .query({ limit: 500 })
        .set('Authorization', A.auth('owner'));

      const bIds = (await spec.model.find({ organizationId: B.orgId }).lean()).map((d) =>
        d._id.toString()
      );
      const returnedIds = spec.readList(res.body).map(idOf);

      expect(bIds).not.toHaveLength(0); // the fixture is real
      for (const bId of bIds) {
        expect(returnedIds).not.toContain(bId);
      }
      expectNoLeak(res);
    });

    it("LIST: every returned record carries Org A's organizationId", async () => {
      await spec.build(factory, A.orgId, {});
      await spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER });

      const res = await api()
        .get(spec.path)
        .query({ limit: 500 })
        .set('Authorization', A.auth('owner'));

      const items = spec.readList(res.body);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(String(item.organizationId)).toBe(A.orgId.toString());
      }
    });

    it('LIST: the total count excludes Org B records', async () => {
      // The count comes from a second, separate query. A filter applied to the
      // page query but not the count query leaks the size of the other tenant.
      await Promise.all([
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
      ]);

      const res = await api().get(spec.path).set('Authorization', A.auth('owner'));

      expect(res.body.data.total).toBe(1);
    });

    it.each(ALL_ROLES)('LIST: an Org A %s sees only Org A records', async (role) => {
      const res = await api()
        .get(spec.path)
        .query({ limit: 500 })
        .set('Authorization', A.auth(role));

      expect(res.status).toBe(200);
      expectNoLeak(res);
      for (const item of spec.readList(res.body)) {
        expect(String(item.organizationId)).toBe(A.orgId.toString());
      }
    });

    it('LIST: the reverse direction also holds — Org B cannot see Org A', async () => {
      // Isolation is not a property of one tenant being "the attacker". Assert
      // it symmetrically, so a filter accidentally hardcoded to Org A's id
      // would still be caught.
      const res = await api()
        .get(spec.path)
        .query({ limit: 500 })
        .set('Authorization', B.auth('owner'));

      const items = spec.readList(res.body);
      expect(items).toHaveLength(1);
      expect(idOf(items[0])).toBe(bRecord._id.toString());
      expect(JSON.stringify(res.body)).not.toContain(A_MARKER);
    });

    // ── SEARCH / FILTER / PAGINATION ─────────────────────────────────────────

    it("SEARCH: searching for Org B's own content returns nothing", async () => {
      // The most direct exfiltration attempt available to a logged-in user of
      // another tenant: search for a term you know exists only over there.
      const res = await api()
        .get(spec.path)
        .query({ search: B_MARKER })
        .set('Authorization', A.auth('owner'));

      expect(res.status).toBe(200);
      expect(spec.readList(res.body)).toHaveLength(0);
      expect(res.body.data.total).toBe(0);
      expectNoLeak(res);
    });

    it('SEARCH: a regex-wildcard search cannot widen past the tenant', async () => {
      // Unescaped, `.*` matches every record in the collection, across tenants.
      // utils/escapeRegex is what prevents that; this asserts the outcome
      // through the route rather than unit-testing the helper.
      const res = await api()
        .get(spec.path)
        .query({ search: '.*' })
        .set('Authorization', A.auth('owner'));

      expect(res.status).toBe(200);
      expectNoLeak(res);
      for (const item of spec.readList(res.body)) {
        expect(String(item.organizationId)).toBe(A.orgId.toString());
      }
    });

    it('FILTER: filtering by an Org B user id returns nothing', async () => {
      await spec.build(factory, B.orgId, {
        [spec.searchField]: B_MARKER,
        assignedTo: B.users.member._id,
      });

      const res = await api()
        .get(spec.path)
        .query({ assignedTo: B.users.member._id.toString(), limit: 500 })
        .set('Authorization', A.auth('owner'));

      expect(res.status).toBe(200);
      expect(spec.readList(res.body)).toHaveLength(0);
      expectNoLeak(res);
    });

    it('PAGINATION: no page of results ever contains an Org B record', async () => {
      await Promise.all([
        spec.build(factory, A.orgId, {}),
        spec.build(factory, A.orgId, {}),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
        spec.build(factory, B.orgId, { [spec.searchField]: B_MARKER }),
      ]);

      // Walk every page rather than trusting page 1. A boundary applied by
      // post-filtering AFTER skip/limit leaks on later pages specifically.
      for (const page of [1, 2, 3, 4]) {
        const res = await api()
          .get(spec.path)
          .query({ page, limit: 2 })
          .set('Authorization', A.auth('owner'));

        expect(res.status).toBe(200);
        expectNoLeak(res);
        for (const item of spec.readList(res.body)) {
          expect(String(item.organizationId)).toBe(A.orgId.toString());
        }
      }
    });

    // ── CREATE ───────────────────────────────────────────────────────────────

    it('CREATE: organizationId in the request body is ignored', async () => {
      // The tenant comes from the signed token, never from the payload. If the
      // body won, any user could plant records inside another organization —
      // spam, or a phishing "task" appearing in a stranger's dashboard.
      const res = await api()
        .post(spec.path)
        .set('Authorization', A.auth('member'))
        .send({ ...spec.validCreate, organizationId: B.orgId.toString() });

      expect(res.status).toBe(201);

      const createdId = idOf(spec.readOne(res.body) ?? res.body.data);
      const created = await spec.model.findById(createdId).lean();
      expect(created.organizationId.toString()).toBe(A.orgId.toString());

      // Only the fixture should exist over in Org B — nothing was planted.
      expect(await spec.model.countDocuments({ organizationId: B.orgId })).toBe(1);
    });
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// Resource-specific sub-routes. These sit outside the generic CRUD shape and
// are exactly the kind of endpoint that gets added later without the filter.
// ═════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation — resource sub-routes', () => {
  it('PATCH /api/leads/:id/status cannot touch an Org B lead', async () => {
    const bLead = await factory.createLead(B.orgId, { company: B_MARKER });

    const res = await api()
      .patch(`/api/leads/${bLead._id}/status`)
      .set('Authorization', A.auth('owner'))
      .send({ status: 'Won' });

    expectDenied(res);
    expect((await RESOURCES.leads.model.findById(bLead._id).lean()).status).toBe('New');
  });

  it('PATCH /api/deals/:id/stage cannot touch an Org B deal', async () => {
    const bDeal = await factory.createDeal(B.orgId, { title: B_MARKER });

    const res = await api()
      .patch(`/api/deals/${bDeal._id}/stage`)
      .set('Authorization', A.auth('owner'))
      .send({ stage: 'Won' });

    expectDenied(res);

    const after = await RESOURCES.deals.model.findById(bDeal._id).lean();
    expect(after.stage).toBe('Lead');
    expect(after.closedAt).toBeNull();
  });

  it('moving an Org B deal to Won does not create a Contact in Org A', async () => {
    // The stage-move handler auto-creates a Contact on Won. A cross-tenant
    // stage move that slipped through would materialise a brand new record, so
    // the leak would outlive the request that caused it.
    const bDeal = await factory.createDeal(B.orgId, { title: B_MARKER });

    await api()
      .patch(`/api/deals/${bDeal._id}/stage`)
      .set('Authorization', A.auth('owner'))
      .send({ stage: 'Won' });

    expect(await RESOURCES.contacts.model.countDocuments({ organizationId: A.orgId })).toBe(0);
  });

  it('PATCH /api/tasks/:id/complete cannot touch an Org B task', async () => {
    const bTask = await factory.createTask(B.orgId, { title: B_MARKER });

    const res = await api()
      .patch(`/api/tasks/${bTask._id}/complete`)
      .set('Authorization', A.auth('owner'));

    expectDenied(res);

    const after = await RESOURCES.tasks.model.findById(bTask._id).lean();
    expect(after.status).toBe('Open');
    expect(after.completedAt).toBeNull();
  });

  it("GET /api/leads/:id does not attach another tenant's related tasks", async () => {
    // The lead detail route runs a SECOND query for related tasks. It is
    // separately scoped, and a missing filter there would leak task titles for
    // any lead id an attacker could reach.
    const aLead = await factory.createLead(A.orgId, { company: A_MARKER });
    await factory.createTask(B.orgId, {
      title: B_MARKER,
      relatedTo: aLead._id,
      relatedModel: 'Lead',
    });
    await factory.createTask(A.orgId, {
      title: 'A own task',
      relatedTo: aLead._id,
      relatedModel: 'Lead',
    });

    const res = await api()
      .get(`/api/leads/${aLead._id}`)
      .set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(1);
    expectNoLeak(res);
  });

  it('POST /api/leads/:id/ai-summary is denied for an Org B lead before any AI call', async () => {
    // Ordering matters here and is worth pinning: the tenancy filter must run
    // BEFORE the "is AI configured" check. Otherwise the response distinguishes
    // "foreign lead" (404) from "real lead, no key" (503) and becomes an
    // existence oracle for other tenants' records.
    const bLead = await factory.createLead(B.orgId, { company: B_MARKER });

    const res = await api()
      .post(`/api/leads/${bLead._id}/ai-summary`)
      .set('Authorization', A.auth('member'));

    expect(res.status).not.toBe(503);
    expectDenied(res);
  });

  it('POST /api/leads/:id/ai-email is denied for an Org B lead', async () => {
    const bLead = await factory.createLead(B.orgId, { company: B_MARKER });

    const res = await api()
      .post(`/api/leads/${bLead._id}/ai-email`)
      .set('Authorization', A.auth('member'))
      .send({ purpose: 'introduction', tone: 'friendly' });

    expect(res.status).not.toBe(503);
    expectDenied(res);
  });

  it('GET /api/leads/users lists only Org A users', async () => {
    const res = await api().get('/api/leads/users').set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    const emails = res.body.data.map((u) => u.email);

    expect(emails).toHaveLength(5); // owner + 4 roles
    for (const bUser of Object.values(B.users)) {
      expect(emails).not.toContain(bUser.email);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Team members — the same boundary, applied to users rather than records.
// ═════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation — Team members', () => {
  it('GET /api/team/members lists only Org A members', async () => {
    const res = await api().get('/api/team/members').set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    const ids = res.body.data.members.map((m) => m.id);

    expect(ids).toHaveLength(5);
    for (const role of ALL_ROLES) {
      expect(ids).toContain(A.users[role]._id.toString());
      expect(ids).not.toContain(B.users[role]._id.toString());
    }
  });

  it('GET /api/team/members never exposes an Org B email address', async () => {
    const res = await api().get('/api/team/members').set('Authorization', A.auth('viewer'));

    const body = JSON.stringify(res.body);
    for (const user of Object.values(B.users)) {
      expect(body).not.toContain(user.email);
    }
  });

  it("PATCH role: an Org A admin cannot change an Org B member's role", async () => {
    const res = await api()
      .patch(`/api/team/members/${B.users.member._id}/role`)
      .set('Authorization', A.auth('admin'))
      .send({ role: 'viewer' });

    expectDenied(res);
    expect((await User.findById(B.users.member._id).lean()).role).toBe('member');
  });

  it('PATCH role: an Org A owner cannot promote an Org B member', async () => {
    // The escalation shape: grant yourself an admin inside someone else's org.
    const res = await api()
      .patch(`/api/team/members/${B.users.viewer._id}/role`)
      .set('Authorization', A.auth('owner'))
      .send({ role: 'admin' });

    expectDenied(res);
    expect((await User.findById(B.users.viewer._id).lean()).role).toBe('viewer');
  });

  it('DELETE member: an Org A admin cannot remove an Org B member', async () => {
    const res = await api()
      .delete(`/api/team/members/${B.users.member._id}`)
      .set('Authorization', A.auth('admin'));

    expectDenied(res);
    expect((await User.findById(B.users.member._id).lean()).isActive).toBe(true);
  });

  it('DELETE member: an Org A owner cannot remove an Org B owner', async () => {
    const res = await api()
      .delete(`/api/team/members/${B.users.owner._id}`)
      .set('Authorization', A.auth('owner'));

    expectDenied(res);
    expect((await User.findById(B.users.owner._id).lean()).isActive).toBe(true);
  });

  it("DELETE member: a failed cross-tenant removal does not decrement Org B's member count", async () => {
    const before = await Organization.findById(B.orgId).lean();

    await api()
      .delete(`/api/team/members/${B.users.member._id}`)
      .set('Authorization', A.auth('admin'));

    const after = await Organization.findById(B.orgId).lean();
    expect(after.memberCount).toBe(before.memberCount);
  });

  it("DELETE member: a failed cross-tenant removal does not revoke Org B's sessions", async () => {
    // removeMember revokes the target's refresh tokens. If the tenancy check
    // were skipped, this would be a cross-tenant denial of service: sign every
    // user of a competitor's org out, repeatedly, from your own account.
    const raw = tokenService.generateRefreshToken({ sub: B.users.member._id.toString() });
    await tokenService.saveRefreshToken(B.users.member._id, raw, {
      headers: {},
      ip: '127.0.0.1',
    });

    await api()
      .delete(`/api/team/members/${B.users.member._id}`)
      .set('Authorization', A.auth('admin'));

    const stored = await RefreshToken.findOne({ token: tokenService.hashToken(raw) });
    expect(stored.isRevoked).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Invitations — a pending invite carries an email address and a role, which is
// exactly the sort of thing a competitor would like to read.
// ═════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation — Invitations', () => {
  async function seedInvite(tenant, email) {
    const raw = tokenService.generateRandomToken();
    const invite = await Invitation.create({
      organizationId: tenant.orgId,
      invitedBy: tenant.users.owner._id,
      email,
      role: 'member',
      token: tokenService.hashToken(raw),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return { invite, raw };
  }

  it('GET /api/team/invites lists only Org A invitations', async () => {
    await seedInvite(A, 'a-invitee@example.com');
    await seedInvite(B, 'zz-org-b-confidential-zz@example.com');

    const res = await api().get('/api/team/invites').set('Authorization', A.auth('admin'));

    expect(res.status).toBe(200);
    expect(res.body.data.invites).toHaveLength(1);
    expect(res.body.data.invites[0].email).toBe('a-invitee@example.com');
    expect(JSON.stringify(res.body).toUpperCase()).not.toContain(B_MARKER);
  });

  it('POST resend: Org A cannot resend an Org B invitation', async () => {
    const { invite } = await seedInvite(B, 'b-invitee@example.com');
    const before = await Invitation.findById(invite._id).lean();

    const res = await api()
      .post(`/api/team/invites/${invite._id}/resend`)
      .set('Authorization', A.auth('admin'));

    expectDenied(res);

    const after = await Invitation.findById(invite._id).lean();
    // Resending rotates the token and extends the TTL. Both must be untouched.
    expect(after.token).toBe(before.token);
    expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it('DELETE revoke: Org A cannot revoke an Org B invitation', async () => {
    const { invite } = await seedInvite(B, 'b-invitee@example.com');

    const res = await api()
      .delete(`/api/team/invites/${invite._id}`)
      .set('Authorization', A.auth('admin'));

    expectDenied(res);
    expect(await Invitation.findById(invite._id).lean()).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Organization settings.
// ═════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation — Organization', () => {
  it("GET /api/organizations/current returns the caller's own organization", async () => {
    const res = await api()
      .get('/api/organizations/current')
      .set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(A.orgId.toString());
    expect(res.body.data.name).toBe(A.org.name);
  });

  it('there is no id-addressed organization route — the token is the only selector', async () => {
    // organizations.routes.js exposes /current only. Anything that looks like an
    // id-addressed variant must 404 rather than quietly work.
    for (const path of [`/api/organizations/${B.orgId}`, `/api/organizations/${A.orgId}`]) {
      const res = await api().get(path).set('Authorization', A.auth('owner'));
      expect(res.status).toBe(404);
    }
  });

  it('PATCH /api/organizations/current cannot rename another organization', async () => {
    const res = await api()
      .patch('/api/organizations/current')
      .set('Authorization', A.auth('owner'))
      .send({
        name: 'Renamed By A',
        organizationId: B.orgId.toString(),
        id: B.orgId.toString(),
      });

    expect(res.status).toBe(200);

    expect((await Organization.findById(A.orgId).lean()).name).toBe('Renamed By A');
    expect((await Organization.findById(B.orgId).lean()).name).toBe(B.org.name);
  });

  it('the active member count reported to Org A counts only Org A users', async () => {
    const res = await api()
      .get('/api/organizations/current')
      .set('Authorization', A.auth('owner'));

    expect(res.body.data.activeMembers).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Read-only aggregate routes. These are the easiest place for a boundary to go
// missing, because an aggregate leaks totals rather than records and so does not
// look like a data leak in review.
// ═════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation — search, dashboard, calendar, activity, reports', () => {
  beforeEach(async () => {
    await Promise.all([
      factory.createLead(B.orgId, {
        company: B_MARKER,
        firstName: 'Bee',
        lastName: B_MARKER,
        value: 999999,
      }),
      factory.createDeal(B.orgId, { title: B_MARKER, value: 999999, stage: 'Won' }),
      factory.createContact(B.orgId, { company: B_MARKER, lastName: B_MARKER }),
      factory.createTask(B.orgId, { title: B_MARKER, dueDate: new Date() }),
    ]);
  });

  it('GET /api/search returns nothing for an Org B search term', async () => {
    const res = await api()
      .get('/api/search')
      .query({ q: B_MARKER })
      .set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.groups.leads).toHaveLength(0);
    expect(res.body.data.groups.contacts).toHaveLength(0);
    expect(res.body.data.groups.tasks).toHaveLength(0);

    // Scoped to `groups`, not the whole body: this endpoint echoes the query
    // back as `data.query`, so a whole-body marker scan would flag the caller's
    // own input as a leak.
    expect(JSON.stringify(res.body.data.groups)).not.toContain(B_MARKER);
  });

  it('GET /api/search with a wildcard cannot reach across tenants', async () => {
    await factory.createLead(A.orgId, { company: A_MARKER });

    const res = await api()
      .get('/api/search')
      .query({ q: '.*' })
      .set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body.data.groups)).not.toContain(B_MARKER);
  });

  it("GET /api/dashboard/stats excludes Org B's value from the pipeline", async () => {
    // Org B holds a 999,999 deal and lead. An unscoped aggregate would show it.
    const res = await api().get('/api/dashboard/stats').set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expect(res.body.data.pipelineValue).toBe(0);
    expect(res.body.data.conversion.totalLeads).toBe(0);
  });

  it.each([
    '/api/dashboard/stats',
    '/api/dashboard/pipeline-chart',
    '/api/dashboard/lead-activity',
    '/api/dashboard/follow-ups',
    '/api/dashboard/leads-by-source',
    '/api/dashboard/revenue-trend',
  ])('GET %s leaks nothing from Org B', async (path) => {
    const res = await api().get(path).set('Authorization', A.auth('owner'));
    expectNoLeak(res);
  });

  it('GET /api/calendar/events shows only Org A events', async () => {
    const now = new Date();
    await factory.createTask(A.orgId, { title: 'A task', dueDate: now });

    const res = await api()
      .get('/api/calendar/events')
      .query({ month: now.getMonth() + 1, year: now.getFullYear() })
      .set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expectNoLeak(res);
    expect(res.body.data.counts.tasks).toBe(1);
  });

  it('GET /api/activity-log shows only Org A activity', async () => {
    await factory.createLead(A.orgId, { company: A_MARKER });

    const res = await api().get('/api/activity-log').set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    expectNoLeak(res);
  });

  it.each([
    '/api/reports/sales-performance',
    '/api/reports/pipeline-forecast',
    '/api/reports/lead-source-roi',
    '/api/reports/activity-summary',
  ])('GET %s leaks nothing from Org B', async (path) => {
    // Reports are manager+, so this uses the manager token — a viewer would be
    // stopped by RBAC first and the tenancy assertion would be vacuous.
    const res = await api().get(path).set('Authorization', A.auth('manager'));

    expect(res.status).toBe(200);
    expectNoLeak(res);
  });

  it("GET /api/reports/pipeline-forecast totals exclude Org B's 999,999 deal", async () => {
    const res = await api()
      .get('/api/reports/pipeline-forecast')
      .set('Authorization', A.auth('manager'));

    expect(JSON.stringify(res.body)).not.toContain('999999');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// The boundary is carried by the signed token, so this is where forging it is
// tested. These assert the mechanism, not only the outcome.
// ═════════════════════════════════════════════════════════════════════════════

describe('Tenant isolation — the organizationId claim itself', () => {
  it('a token with a tampered payload is rejected outright', async () => {
    // Swap the organizationId claim for Org B's and re-encode WITHOUT resigning.
    const [header, payload, signature] = A.tokens.owner.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.organizationId = B.orgId.toString();

    const forged = [
      header,
      Buffer.from(JSON.stringify(decoded)).toString('base64url'),
      signature,
    ].join('.');

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('a token signed with an attacker-chosen secret is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign(
      {
        sub: A.users.owner._id.toString(),
        role: 'owner',
        organizationId: B.orgId.toString(),
      },
      'attacker-chosen-secret',
      { issuer: 'elevate-crm', expiresIn: '15m' }
    );

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('a refresh token cannot be used as an access token', async () => {
    // The two secrets are distinct in config/env.js. If they were ever collapsed
    // into one value a refresh token would verify here — and refresh tokens are
    // long-lived, so that is a 7-day bearer credential for the whole API.
    const refresh = tokenService.generateRefreshToken({ sub: A.users.owner._id.toString() });

    const res = await api().get('/api/leads').set('Authorization', `Bearer ${refresh}`);
    expect(res.status).toBe(401);
  });

  it('scoping comes from the token, not from any query parameter or header', async () => {
    const aLead = await factory.createLead(A.orgId, { company: A_MARKER });
    await factory.createLead(B.orgId, { company: B_MARKER });

    const res = await api()
      .get('/api/leads')
      .query({ organizationId: B.orgId.toString() })
      .set('X-Organization-Id', B.orgId.toString())
      .set('Authorization', A.auth('owner'));

    expect(res.status).toBe(200);
    const items = res.body.data.leads;
    expect(items).toHaveLength(1);
    expect(idOf(items[0])).toBe(aLead._id.toString());
    expectNoLeak(res);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// KNOWN GAP — cross-tenant reference population.
//
// These use `it.failing`, which PASSES while the body throws and FAILS the
// moment the body starts passing. They are therefore both documentation of a
// confirmed defect and the regression guard that tells you a fix landed: when
// one of these goes red, change `it.failing` to `it`.
//
// The defect: no create/update handler verifies that an incoming REFERENCE
// (assignedTo, relatedTo, leadId, dealId) points at a record in the caller's
// own organization. The controllers then `.populate()` those refs with no
// tenancy filter, because populate resolves by _id alone. So an Org A user who
// supplies an Org B ObjectId gets that foreign record's fields echoed back in
// the response — and again on every subsequent list request.
//
// Reported to the maintainer rather than fixed; the brief was tests only.
// ═════════════════════════════════════════════════════════════════════════════

describe('KNOWN GAP: cross-tenant reference population', () => {
  it.failing('task.relatedTo pointing at an Org B lead must not echo that lead back', async () => {
    const bLead = await factory.createLead(B.orgId, {
      firstName: 'Bravo',
      lastName: 'Secret',
      company: B_MARKER,
    });

    await api()
      .post('/api/tasks')
      .set('Authorization', A.auth('member'))
      .send({ title: 'probe', relatedTo: bLead._id.toString(), relatedModel: 'Lead' });

    const res = await api().get('/api/tasks').set('Authorization', A.auth('member'));

    expect(JSON.stringify(res.body)).not.toContain(B_MARKER);
  });

  it.failing('lead.assignedTo pointing at an Org B user must not echo that user back', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', A.auth('member'))
      .send({ firstName: 'X', lastName: 'Y', assignedTo: B.users.admin._id.toString() });

    expect(JSON.stringify(res.body)).not.toContain(B.users.admin.email);
  });

  it.failing('deal.leadId pointing at an Org B lead must not echo that lead back', async () => {
    const bLead = await factory.createLead(B.orgId, { company: B_MARKER });

    await api()
      .post('/api/deals')
      .set('Authorization', A.auth('member'))
      .send({ title: 'probe deal', value: 1, leadId: bLead._id.toString() });

    const res = await api().get('/api/deals').set('Authorization', A.auth('member'));

    expect(JSON.stringify(res.body)).not.toContain(B_MARKER);
  });

  it.failing('contact.leadId / dealId pointing at Org B records must not echo them back', async () => {
    const bLead = await factory.createLead(B.orgId, { company: B_MARKER });
    const bDeal = await factory.createDeal(B.orgId, { title: B_MARKER });

    await api()
      .post('/api/contacts')
      .set('Authorization', A.auth('member'))
      .send({
        firstName: 'Probe',
        lastName: 'Contact',
        leadId: bLead._id.toString(),
        dealId: bDeal._id.toString(),
      });

    const res = await api().get('/api/contacts').set('Authorization', A.auth('member'));

    expect(JSON.stringify(res.body)).not.toContain(B_MARKER);
  });

  it.failing('a cross-tenant reference should be rejected at write time', async () => {
    // The stronger fix, and the one worth asking for: refuse the write with a
    // 400. Filtering the reference out on read leaves a dangling cross-tenant
    // pointer in the document that any future populate() will resolve again.
    const bLead = await factory.createLead(B.orgId, { company: B_MARKER });

    const res = await api()
      .post('/api/tasks')
      .set('Authorization', A.auth('member'))
      .send({ title: 'probe', relatedTo: bLead._id.toString(), relatedModel: 'Lead' });

    expect(res.status).toBe(400);
  });
});
