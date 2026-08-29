// ─────────────────────────────────────────────────────────────────────────────
// tests/leads.test.js — CRUD, validation, pagination, search and filtering.
//
// Fixtures are written straight to Mongo via the factory rather than created
// through POST /api/leads. That is not just speed: the general limiter allows
// 100 requests per 15 minutes per IP, and seeding 25 leads over HTTP would spend
// a quarter of the whole suite's budget on setup.
//
// Tenant isolation for this resource lives in multitenancy.test.js, and the role
// guards live in rbac.test.js. This file covers the behaviour of the endpoint
// itself, and every assertion still runs as a scoped, authenticated request.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { api } = require('./helpers/api');
const factory = require('./helpers/factory');
const Lead = require('../models/Lead');

let T;

beforeEach(async () => {
  T = await factory.createTenant({ name: 'Leads Org' });
});

/** The write-capable default actor. */
const asMember = () => T.auth('member');

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/leads
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/leads', () => {
  it('creates a lead scoped to the caller\'s organization', async () => {
    const res = await api().post('/api/leads').set('Authorization', asMember()).send({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      company: 'Navy',
      source: 'Referral',
      value: 4200,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('Grace');
    expect(res.body.data.value).toBe(4200);

    const stored = await Lead.findById(res.body.data.id);
    expect(stored.organizationId.toString()).toBe(T.orgId.toString());
  });

  it('applies schema defaults for the fields left out', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({ firstName: 'Minimal', lastName: 'Lead' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('New');
    expect(res.body.data.source).toBe('Other');
    expect(res.body.data.value).toBe(0);
    expect(res.body.data.isDeleted).toBe(false);
    expect(res.body.data.assignedTo).toBeNull();
  });

  it('seeds the activity log and stamps statusChangedAt', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({ firstName: 'Logged', lastName: 'Lead' });

    expect(res.body.data.activityLog).toHaveLength(1);
    expect(res.body.data.activityLog[0]).toMatchObject({
      status: 'New',
      note: 'Lead created',
    });
    expect(res.body.data.statusChangedAt).toEqual(expect.any(String));
  });

  it('lowercases and trims the email', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({ firstName: 'Case', lastName: 'Test', email: '  MiXeD@Example.COM  ' });

    expect(res.body.data.email).toBe('mixed@example.com');
  });

  it('returns the assignee populated, not as a bare id', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({
        firstName: 'Assigned',
        lastName: 'Lead',
        assignedTo: T.users.manager._id.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assignedTo).toMatchObject({
      firstName: 'Manager',
      email: T.users.manager.email,
    });
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it.each(['firstName', 'lastName'])('rejects a missing %s', async (field) => {
    const body = { firstName: 'A', lastName: 'B' };
    delete body[field];

    const res = await api().post('/api/leads').set('Authorization', asMember()).send(body);

    expect(res.status).toBe(400);
    expect(await Lead.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it('rejects an empty request body', async () => {
    const res = await api().post('/api/leads').set('Authorization', asMember()).send({});

    expect(res.status).toBe(400);
  });

  it.each([
    ['status', 'Bogus'],
    ['source', 'Telepathy'],
  ])('rejects an invalid %s enum value', async (field, value) => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({ firstName: 'A', lastName: 'B', [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors.some((e) => e.field === field)).toBe(true);
    expect(await Lead.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it.each(['New', 'Contacted', 'Qualified', 'Proposal', 'Won', 'Lost'])(
    'accepts the valid status "%s"',
    async (status) => {
      const res = await api()
        .post('/api/leads')
        .set('Authorization', asMember())
        .send({ firstName: 'A', lastName: 'B', status });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe(status);
    }
  );

  it.each(['Cold Outreach', 'Event', 'Social', 'Website', 'Referral', 'Other'])(
    'accepts the valid source "%s"',
    async (source) => {
      const res = await api()
        .post('/api/leads')
        .set('Authorization', asMember())
        .send({ firstName: 'A', lastName: 'B', source });

      expect(res.status).toBe(201);
    }
  );

  it('rejects a negative value', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({ firstName: 'A', lastName: 'B', value: -50 });

    expect(res.status).toBe(400);
  });

  it('rejects a malformed assignedTo id with 400, not 500', async () => {
    const res = await api()
      .post('/api/leads')
      .set('Authorization', asMember())
      .send({ firstName: 'A', lastName: 'B', assignedTo: 'not-an-objectid' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/leads/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/leads/:id', () => {
  it('returns the lead with its related tasks', async () => {
    const lead = await factory.createLead(T.orgId, { company: 'Detail Co' });
    await factory.createTask(T.orgId, {
      title: 'Follow up',
      relatedTo: lead._id,
      relatedModel: 'Lead',
    });

    const res = await api().get(`/api/leads/${lead._id}`).set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.lead.company).toBe('Detail Co');
    expect(res.body.data.tasks).toHaveLength(1);
    expect(res.body.data.tasks[0].title).toBe('Follow up');
  });

  it('exposes the fullName virtual and an `id`, not an `_id`', async () => {
    const lead = await factory.createLead(T.orgId, { firstName: 'Ada', lastName: 'Byron' });

    const res = await api().get(`/api/leads/${lead._id}`).set('Authorization', asMember());

    expect(res.body.data.lead.fullName).toBe('Ada Byron');
    expect(res.body.data.lead.id).toBe(lead._id.toString());
    expect(res.body.data.lead._id).toBeUndefined();
    expect(res.body.data.lead.__v).toBeUndefined();
  });

  it('404s for an id that does not exist', async () => {
    const res = await api()
      .get(`/api/leads/${factory.missingId()}`)
      .set('Authorization', asMember());

    expect(res.status).toBe(404);
  });

  it('400s for a malformed id, rather than crashing', async () => {
    const res = await api().get('/api/leads/not-an-objectid').set('Authorization', asMember());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });

  it('404s for a soft-deleted lead', async () => {
    const lead = await factory.createLead(T.orgId, { isDeleted: true });

    const res = await api().get(`/api/leads/${lead._id}`).set('Authorization', asMember());

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/leads/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/leads/:id', () => {
  it('updates the allowed fields', async () => {
    const lead = await factory.createLead(T.orgId, { company: 'Before' });

    const res = await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', asMember())
      .send({ company: 'After', value: 999, notes: 'Called them' });

    expect(res.status).toBe(200);
    expect(res.body.data.company).toBe('After');
    expect(res.body.data.value).toBe(999);
    expect(res.body.data.notes).toBe('Called them');
  });

  it('leaves fields that were not sent alone', async () => {
    const lead = await factory.createLead(T.orgId, { company: 'Keep Me', value: 77 });

    await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', asMember())
      .send({ notes: 'only notes' });

    const after = await Lead.findById(lead._id);
    expect(after.company).toBe('Keep Me');
    expect(after.value).toBe(77);
  });

  it('ignores fields that are not on the allow-list', async () => {
    // isDeleted is not patchable: soft-deletion goes through DELETE, which is
    // manager-gated. Accepting it here would let a member delete by PATCH.
    const lead = await factory.createLead(T.orgId);

    await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', asMember())
      .send({ isDeleted: true, createdAt: '1999-01-01T00:00:00.000Z' });

    const after = await Lead.findById(lead._id);
    expect(after.isDeleted).toBe(false);
    expect(after.createdAt.getFullYear()).not.toBe(1999);
  });

  it('appends an activity log entry when the status changes', async () => {
    const lead = await factory.createLead(T.orgId, { status: 'New' });

    const res = await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', asMember())
      .send({ status: 'Qualified' });

    expect(res.body.data.status).toBe('Qualified');
    expect(res.body.data.activityLog).toHaveLength(1);
    expect(res.body.data.activityLog[0].note).toBe('Status updated to Qualified');
  });

  it('does not append a log entry when the status is resent unchanged', async () => {
    const lead = await factory.createLead(T.orgId, { status: 'New' });

    const res = await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', asMember())
      .send({ status: 'New', company: 'Something Else' });

    expect(res.body.data.activityLog).toHaveLength(0);
  });

  it('rejects an invalid status enum and leaves the record untouched', async () => {
    const lead = await factory.createLead(T.orgId, { status: 'New' });

    const res = await api()
      .patch(`/api/leads/${lead._id}`)
      .set('Authorization', asMember())
      .send({ status: 'Nonsense' });

    expect(res.status).toBe(400);
    expect((await Lead.findById(lead._id)).status).toBe('New');
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .patch(`/api/leads/${factory.missingId()}`)
      .set('Authorization', asMember())
      .send({ company: 'X' });

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/leads/:id/status
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/leads/:id/status', () => {
  it('moves the status and records it', async () => {
    const lead = await factory.createLead(T.orgId, { status: 'New' });

    const res = await api()
      .patch(`/api/leads/${lead._id}/status`)
      .set('Authorization', asMember())
      .send({ status: 'Won' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Won');
    expect(res.body.data.activityLog[0].note).toBe('Status moved to Won');
  });

  it('advances statusChangedAt', async () => {
    const lead = await factory.createLead(T.orgId, {
      status: 'New',
      statusChangedAt: new Date('2020-01-01'),
    });

    await api()
      .patch(`/api/leads/${lead._id}/status`)
      .set('Authorization', asMember())
      .send({ status: 'Contacted' });

    const after = await Lead.findById(lead._id);
    expect(after.statusChangedAt.getFullYear()).toBeGreaterThan(2020);
  });

  it('requires a status in the body', async () => {
    const lead = await factory.createLead(T.orgId);

    const res = await api()
      .patch(`/api/leads/${lead._id}/status`)
      .set('Authorization', asMember())
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects an invalid status', async () => {
    const lead = await factory.createLead(T.orgId, { status: 'New' });

    const res = await api()
      .patch(`/api/leads/${lead._id}/status`)
      .set('Authorization', asMember())
      .send({ status: 'Invented' });

    expect(res.status).toBe(400);
    expect((await Lead.findById(lead._id)).status).toBe('New');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/leads/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/leads/:id', () => {
  it('soft-deletes rather than removing the document', async () => {
    const lead = await factory.createLead(T.orgId);

    const res = await api()
      .delete(`/api/leads/${lead._id}`)
      .set('Authorization', T.auth('manager'));

    expect(res.status).toBe(200);

    const after = await Lead.findById(lead._id);
    expect(after).not.toBeNull();
    expect(after.isDeleted).toBe(true);
  });

  it('removes the lead from the list afterwards', async () => {
    const lead = await factory.createLead(T.orgId);
    await factory.createLead(T.orgId);

    await api().delete(`/api/leads/${lead._id}`).set('Authorization', T.auth('manager'));

    const list = await api().get('/api/leads').set('Authorization', asMember());
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.leads.map((l) => l.id)).not.toContain(lead._id.toString());
  });

  it('404s on a second delete of the same lead', async () => {
    const lead = await factory.createLead(T.orgId);

    await api().delete(`/api/leads/${lead._id}`).set('Authorization', T.auth('manager'));
    const again = await api()
      .delete(`/api/leads/${lead._id}`)
      .set('Authorization', T.auth('manager'));

    expect(again.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/leads — pagination
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/leads — pagination', () => {
  /** 25 leads, numbered so ordering is checkable. */
  async function seed(count = 25) {
    for (let i = 0; i < count; i++) {
      // Sequential rather than Promise.all: createdAt is the default sort key
      // and parallel inserts would land in the same millisecond, making the
      // page-boundary assertions below non-deterministic.
      await factory.createLead(T.orgId, {
        firstName: `Lead${String(i).padStart(2, '0')}`,
        company: 'PageCo',
      });
    }
  }

  it('defaults to page 1 with a limit of 20', async () => {
    await seed(25);

    const res = await api().get('/api/leads').set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(20);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.total).toBe(25);
    expect(res.body.data.totalPages).toBe(2);
  });

  it('honours an explicit page and limit', async () => {
    await seed(25);

    const res = await api()
      .get('/api/leads')
      .query({ page: 2, limit: 10 })
      .set('Authorization', asMember());

    expect(res.body.data.leads).toHaveLength(10);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.totalPages).toBe(3);
  });

  it('returns the remainder on the final page', async () => {
    await seed(25);

    const res = await api()
      .get('/api/leads')
      .query({ page: 3, limit: 10 })
      .set('Authorization', asMember());

    expect(res.body.data.leads).toHaveLength(5);
  });

  it('returns an empty page past the end, not an error', async () => {
    await seed(5);

    const res = await api()
      .get('/api/leads')
      .query({ page: 99, limit: 10 })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(0);
    expect(res.body.data.total).toBe(5);
  });

  it('never overlaps records between consecutive pages', async () => {
    // The assertion that actually protects the user: a skip/limit off-by-one
    // shows up as a record appearing twice, or never.
    await seed(25);

    const seen = new Set();
    for (const page of [1, 2, 3]) {
      const res = await api()
        .get('/api/leads')
        .query({ page, limit: 10 })
        .set('Authorization', asMember());

      for (const lead of res.body.data.leads) {
        expect(seen.has(lead.id)).toBe(false);
        seen.add(lead.id);
      }
    }
    expect(seen.size).toBe(25);
  });

  it('reports totalPages as 1 when there are no results at all', async () => {
    const res = await api().get('/api/leads').set('Authorization', asMember());

    expect(res.body.data.total).toBe(0);
    expect(res.body.data.totalPages).toBe(1);
  });

  it('excludes soft-deleted leads from the count', async () => {
    await seed(5);
    await Lead.updateOne({ organizationId: T.orgId }, { isDeleted: true });

    const res = await api().get('/api/leads').set('Authorization', asMember());

    expect(res.body.data.total).toBe(4);
  });

  it('sorts by createdAt descending by default', async () => {
    await seed(5);

    const res = await api().get('/api/leads').set('Authorization', asMember());
    const dates = res.body.data.leads.map((l) => new Date(l.createdAt).getTime());

    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('honours an ascending sort', async () => {
    await seed(5);

    const res = await api()
      .get('/api/leads')
      .query({ sortBy: 'createdAt', sortOrder: 'asc' })
      .set('Authorization', asMember());

    const dates = res.body.data.leads.map((l) => new Date(l.createdAt).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/leads — search and filter
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/leads — search and filter', () => {
  beforeEach(async () => {
    await factory.createLead(T.orgId, {
      firstName: 'Alice',
      lastName: 'Anderson',
      email: 'alice@acme.test',
      company: 'Acme Corp',
      status: 'New',
      source: 'Website',
      assignedTo: T.users.manager._id,
    });
    await factory.createLead(T.orgId, {
      firstName: 'Bob',
      lastName: 'Brown',
      email: 'bob@globex.test',
      company: 'Globex',
      status: 'Won',
      source: 'Referral',
      assignedTo: T.users.member._id,
    });
    await factory.createLead(T.orgId, {
      firstName: 'Carol',
      lastName: 'Clark',
      email: 'carol@acme.test',
      company: 'Acme Corp',
      status: 'Qualified',
      source: 'Website',
    });
  });

  it('filters by status', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ status: 'Won' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.leads[0].firstName).toBe('Bob');
  });

  it('filters by source', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ source: 'Website' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(2);
    expect(res.body.data.leads.every((l) => l.source === 'Website')).toBe(true);
  });

  it('filters by assignee', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ assignedTo: T.users.manager._id.toString() })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.leads[0].firstName).toBe('Alice');
  });

  it('combines filters as AND, not OR', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ source: 'Website', status: 'New' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.leads[0].firstName).toBe('Alice');
  });

  it('searches across first name, last name, email and company', async () => {
    const cases = [
      ['Alice', 1],
      ['Brown', 1],
      ['globex.test', 1],
      ['Acme', 2],
    ];

    for (const [search, expected] of cases) {
      const res = await api()
        .get('/api/leads')
        .query({ search })
        .set('Authorization', asMember());

      expect(res.body.data.total).toBe(expected);
    }
  });

  it('searches case-insensitively', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ search: 'aLiCe' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
  });

  it('matches on a substring, not only a whole field', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ search: 'cme Cor' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(2);
  });

  it('returns an empty result set for a term that matches nothing', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ search: 'nobody-matches-this' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.leads).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('treats regex metacharacters as literal text', async () => {
    // `.*` unescaped matches everything, which would make the search box do the
    // exact opposite of filtering. utils/escapeRegex is what prevents it.
    const res = await api()
      .get('/api/leads')
      .query({ search: '.*' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('combines search with a filter', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ search: 'Acme', status: 'Qualified' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.leads[0].firstName).toBe('Carol');
  });

  it('applies pagination on top of a search', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ search: 'Acme', limit: 1, page: 2 })
      .set('Authorization', asMember());

    expect(res.body.data.leads).toHaveLength(1);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.totalPages).toBe(2);
  });

  it('rejects a malformed assignedTo filter with 400, not 500', async () => {
    const res = await api()
      .get('/api/leads')
      .query({ assignedTo: 'not-an-objectid' })
      .set('Authorization', asMember());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });

  it('ignores an unknown status filter value rather than erroring', async () => {
    // A filter value outside the enum simply matches nothing; it is a query, not
    // a write, so there is nothing to validate against.
    const res = await api()
      .get('/api/leads')
      .query({ status: 'NotAStatus' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/leads/users
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/leads/users', () => {
  it('returns the organization roster for the assignee picker', async () => {
    const res = await api().get('/api/leads/users').set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0]).toHaveProperty('firstName');
    expect(res.body.data[0]).toHaveProperty('email');
  });

  it('never includes password hashes or 2FA secrets', async () => {
    const res = await api().get('/api/leads/users').set('Authorization', asMember());

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('twoFASecret');
    expect(serialized).not.toContain('twoFABackupCodes');
  });

  it('is not shadowed by the /:id route', async () => {
    // `/users` is registered before `/:id`. If that order were reversed, this
    // request would be read as "the lead whose id is `users`" and 400 on a cast
    // error — a routing bug that only shows up as a broken dropdown.
    const res = await api().get('/api/leads/users').set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
