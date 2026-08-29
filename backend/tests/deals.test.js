// ─────────────────────────────────────────────────────────────────────────────
// tests/deals.test.js — CRUD, validation, pagination, search, stage movement.
//
// Note the envelope difference from leads: deals.controller.js writes res.json()
// by hand, so a list is { success, data: { deals, total, page, limit } } — with
// `limit` rather than the `totalPages` that utils/ApiResponse produces for
// leads. The tests assert what this controller actually returns.
//
// Tenant isolation is in multitenancy.test.js; role guards are in rbac.test.js.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { api } = require('./helpers/api');
const factory = require('./helpers/factory');
const Deal = require('../models/Deal');
const Contact = require('../models/Contact');

const VALID_STAGES = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'];

let T;

beforeEach(async () => {
  T = await factory.createTenant({ name: 'Deals Org' });
});

const asMember = () => T.auth('member');

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/deals
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/deals', () => {
  it('creates a deal scoped to the caller\'s organization', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'Enterprise renewal', value: 25000, currency: 'gbp' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Enterprise renewal');
    expect(res.body.data.value).toBe(25000);
    // The schema upper-cases currency.
    expect(res.body.data.currency).toBe('GBP');

    const stored = await Deal.findById(res.body.data.id);
    expect(stored.organizationId.toString()).toBe(T.orgId.toString());
  });

  it('defaults the stage to Lead and leaves closedAt unset', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'Fresh deal', value: 100 });

    expect(res.body.data.stage).toBe('Lead');
    expect(res.body.data.closedAt).toBeNull();
    expect(res.body.data.currency).toBe('USD');
  });

  it.each(['title', 'value'])('rejects a missing %s', async (field) => {
    const body = { title: 'A deal', value: 500 };
    delete body[field];

    const res = await api().post('/api/deals').set('Authorization', asMember()).send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors.some((e) => e.field === field)).toBe(true);
    expect(await Deal.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it('rejects a negative value', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'Refund', value: -1 });

    expect(res.status).toBe(400);
  });

  it('accepts a zero value', async () => {
    // min: 0, so zero is legal — a pipeline can hold a deal of unknown size.
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'TBD', value: 0 });

    expect(res.status).toBe(201);
    expect(res.body.data.value).toBe(0);
  });

  it('rejects an invalid stage', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'A deal', value: 1, stage: 'Almost There' });

    expect(res.status).toBe(400);
    expect(await Deal.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it.each(VALID_STAGES)('accepts the valid stage "%s"', async (stage) => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: `Deal at ${stage}`, value: 10, stage });

    expect(res.status).toBe(201);
    expect(res.body.data.stage).toBe(stage);
  });

  it('rejects a non-numeric value', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'A deal', value: 'twenty thousand' });

    expect(res.status).toBe(400);
  });

  it('accepts an expected close date', async () => {
    const res = await api()
      .post('/api/deals')
      .set('Authorization', asMember())
      .send({ title: 'Dated', value: 1, expectedCloseDate: '2027-06-30' });

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.expectedCloseDate).getUTCFullYear()).toBe(2027);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/deals/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/deals/:id', () => {
  it('returns the deal with its assignee and lead populated', async () => {
    const lead = await factory.createLead(T.orgId, { company: 'Linked Co' });
    const deal = await factory.createDeal(T.orgId, {
      assignedTo: T.users.manager._id,
      leadId: lead._id,
    });

    const res = await api().get(`/api/deals/${deal._id}`).set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.assignedTo.email).toBe(T.users.manager.email);
    expect(res.body.data.leadId.company).toBe('Linked Co');
  });

  it('serialises an `id` and drops `_id` and `__v`', async () => {
    const deal = await factory.createDeal(T.orgId);

    const res = await api().get(`/api/deals/${deal._id}`).set('Authorization', asMember());

    expect(res.body.data.id).toBe(deal._id.toString());
    expect(res.body.data._id).toBeUndefined();
    expect(res.body.data.__v).toBeUndefined();
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .get(`/api/deals/${factory.missingId()}`)
      .set('Authorization', asMember());

    expect(res.status).toBe(404);
  });

  it('400s for a malformed id', async () => {
    const res = await api().get('/api/deals/nonsense').set('Authorization', asMember());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/deals/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/deals/:id', () => {
  it('updates the allowed fields', async () => {
    const deal = await factory.createDeal(T.orgId, { title: 'Before', value: 1 });

    const res = await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ title: 'After', value: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('After');
    expect(res.body.data.value).toBe(5000);
  });

  it('ignores fields outside the allow-list', async () => {
    const deal = await factory.createDeal(T.orgId);

    await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ closedAt: '1999-01-01T00:00:00.000Z' });

    // closedAt is derived from the stage, never set by the client.
    expect((await Deal.findById(deal._id)).closedAt).toBeNull();
  });

  it('rejects an invalid stage before writing anything', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Lead' });

    const res = await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ stage: 'Nearly Won' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid stage');
    expect((await Deal.findById(deal._id)).stage).toBe('Lead');
  });

  it('rejects a negative value and leaves the deal untouched', async () => {
    const deal = await factory.createDeal(T.orgId, { value: 100 });

    const res = await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ value: -5 });

    expect(res.status).toBe(400);
    expect((await Deal.findById(deal._id)).value).toBe(100);
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .patch(`/api/deals/${factory.missingId()}`)
      .set('Authorization', asMember())
      .send({ title: 'X' });

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/deals/:id/stage — the pipeline drag-and-drop endpoint
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/deals/:id/stage', () => {
  it('moves a deal between stages', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Lead' });

    const res = await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Negotiation' });

    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe('Negotiation');
  });

  it('stamps closedAt when the deal is won', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });

    const res = await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    expect(res.status).toBe(200);
    expect(res.body.data.closedAt).not.toBeNull();
  });

  it('stamps closedAt when the deal is lost', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Lost' });

    expect((await Deal.findById(deal._id)).closedAt).not.toBeNull();
  });

  it('does not move closedAt once it has been set', async () => {
    const original = new Date('2025-01-01T00:00:00.000Z');
    const deal = await factory.createDeal(T.orgId, { stage: 'Won', closedAt: original });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Lost' });

    expect((await Deal.findById(deal._id)).closedAt.getTime()).toBe(original.getTime());
  });

  it('requires a stage in the body', async () => {
    const deal = await factory.createDeal(T.orgId);

    const res = await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid stage');
  });

  it('rejects an invalid stage', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Lead' });

    const res = await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Winning' });

    expect(res.status).toBe(400);
    expect((await Deal.findById(deal._id)).stage).toBe('Lead');
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .patch(`/api/deals/${factory.missingId()}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    expect(res.status).toBe(404);
  });

  // ── Won → Contact conversion ─────────────────────────────────────────────
  // This is the tail of the core product loop, so it gets its own coverage.

  it('auto-creates a Contact when the deal is first won', async () => {
    const deal = await factory.createDeal(T.orgId, { title: 'Big Win', stage: 'Negotiation' });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const contact = await Contact.findOne({ organizationId: T.orgId, dealId: deal._id });
    expect(contact).not.toBeNull();
    expect(contact.status).toBe('active');
    expect(contact.notes).toContain('Big Win');
  });

  it('copies the linked lead\'s details onto the new Contact', async () => {
    const lead = await factory.createLead(T.orgId, {
      firstName: 'Won',
      lastName: 'Customer',
      email: 'won@example.com',
      company: 'Winner Ltd',
      phone: '+441234567890',
    });
    const deal = await factory.createDeal(T.orgId, { leadId: lead._id, stage: 'Negotiation' });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const contact = await Contact.findOne({ dealId: deal._id });
    expect(contact.firstName).toBe('Won');
    expect(contact.lastName).toBe('Customer');
    expect(contact.email).toBe('won@example.com');
    expect(contact.company).toBe('Winner Ltd');
    expect(contact.leadId.toString()).toBe(lead._id.toString());
  });

  it('falls back to the deal title when there is no linked lead', async () => {
    const deal = await factory.createDeal(T.orgId, { title: 'Unlinked Deal', stage: 'Lead' });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const contact = await Contact.findOne({ dealId: deal._id });
    expect(contact.firstName).toBe('Unlinked Deal');
    expect(contact.lastName).toBe('');
    expect(contact.leadId).toBeNull();
  });

  it('does not create a duplicate Contact when Won is re-applied', async () => {
    // Dragging a card onto the same column twice, or a retried request, must not
    // produce two customer records.
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });

    for (let i = 0; i < 3; i++) {
      await api()
        .patch(`/api/deals/${deal._id}/stage`)
        .set('Authorization', asMember())
        .send({ stage: 'Won' });
    }

    expect(await Contact.countDocuments({ dealId: deal._id })).toBe(1);
  });

  it('creates no Contact for any stage other than Won', async () => {
    const deal = await factory.createDeal(T.orgId);

    for (const stage of ['Qualified', 'Proposal Sent', 'Negotiation', 'Lost']) {
      await api()
        .patch(`/api/deals/${deal._id}/stage`)
        .set('Authorization', asMember())
        .send({ stage });
    }

    expect(await Contact.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it('puts the new Contact in the same organization as the deal', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const contact = await Contact.findOne({ dealId: deal._id });
    expect(contact.organizationId.toString()).toBe(T.orgId.toString());
  });

  it('the new Contact appears on GET /api/contacts', async () => {
    const deal = await factory.createDeal(T.orgId, { title: 'Visible Win', stage: 'Negotiation' });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const res = await api().get('/api/contacts').set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.contacts).toHaveLength(1);
    expect(res.body.data.contacts[0].firstName).toBe('Visible Win');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/deals/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/deals/:id', () => {
  it('hard-deletes the document', async () => {
    // Deals have no isDeleted flag — unlike leads and contacts, this really does
    // remove the row.
    const deal = await factory.createDeal(T.orgId);

    const res = await api()
      .delete(`/api/deals/${deal._id}`)
      .set('Authorization', T.auth('manager'));

    expect(res.status).toBe(200);
    expect(await Deal.findById(deal._id)).toBeNull();
  });

  it('404s on a second delete', async () => {
    const deal = await factory.createDeal(T.orgId);

    await api().delete(`/api/deals/${deal._id}`).set('Authorization', T.auth('manager'));
    const again = await api()
      .delete(`/api/deals/${deal._id}`)
      .set('Authorization', T.auth('manager'));

    expect(again.status).toBe(404);
  });

  it('leaves the auto-created Contact behind', async () => {
    // Deleting the deal must not delete the customer it produced.
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });
    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    await api().delete(`/api/deals/${deal._id}`).set('Authorization', T.auth('manager'));

    expect(await Contact.countDocuments({ dealId: deal._id })).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/deals — pagination
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/deals — pagination', () => {
  async function seed(count) {
    for (let i = 0; i < count; i++) {
      await factory.createDeal(T.orgId, {
        title: `Deal ${String(i).padStart(2, '0')}`,
        value: (i + 1) * 100,
      });
    }
  }

  it('defaults to page 1 with a limit of 100 — the kanban wants everything', async () => {
    await seed(5);

    const res = await api().get('/api/deals').set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.deals).toHaveLength(5);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(100);
    expect(res.body.data.total).toBe(5);
  });

  it('honours an explicit page and limit', async () => {
    await seed(12);

    const res = await api()
      .get('/api/deals')
      .query({ page: 2, limit: 5 })
      .set('Authorization', asMember());

    expect(res.body.data.deals).toHaveLength(5);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.limit).toBe(5);
    expect(res.body.data.total).toBe(12);
  });

  it('returns the remainder on the final page', async () => {
    await seed(12);

    const res = await api()
      .get('/api/deals')
      .query({ page: 3, limit: 5 })
      .set('Authorization', asMember());

    expect(res.body.data.deals).toHaveLength(2);
  });

  it('never overlaps records between consecutive pages', async () => {
    await seed(12);

    const seen = new Set();
    for (const page of [1, 2, 3]) {
      const res = await api()
        .get('/api/deals')
        .query({ page, limit: 5 })
        .set('Authorization', asMember());

      for (const deal of res.body.data.deals) {
        expect(seen.has(deal.id)).toBe(false);
        seen.add(deal.id);
      }
    }
    expect(seen.size).toBe(12);
  });

  it('returns an empty page past the end', async () => {
    await seed(3);

    const res = await api()
      .get('/api/deals')
      .query({ page: 50, limit: 5 })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.deals).toHaveLength(0);
    expect(res.body.data.total).toBe(3);
  });

  it('sorts by newest first by default', async () => {
    await seed(4);

    const res = await api().get('/api/deals').set('Authorization', asMember());
    const dates = res.body.data.deals.map((d) => new Date(d.createdAt).getTime());

    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('honours an explicit sort field', async () => {
    await seed(4);

    const res = await api()
      .get('/api/deals')
      .query({ sort: 'value' })
      .set('Authorization', asMember());

    const values = res.body.data.deals.map((d) => d.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/deals — search and filter
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/deals — search and filter', () => {
  beforeEach(async () => {
    await factory.createDeal(T.orgId, {
      title: 'Acme renewal',
      stage: 'Won',
      value: 1000,
      assignedTo: T.users.manager._id,
    });
    await factory.createDeal(T.orgId, {
      title: 'Globex expansion',
      stage: 'Negotiation',
      value: 2000,
      assignedTo: T.users.member._id,
    });
    await factory.createDeal(T.orgId, {
      title: 'Acme upsell',
      stage: 'Negotiation',
      value: 3000,
    });
  });

  it('filters by stage', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ stage: 'Negotiation' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(2);
    expect(res.body.data.deals.every((d) => d.stage === 'Negotiation')).toBe(true);
  });

  it('filters by assignee', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ assignedTo: T.users.manager._id.toString() })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.deals[0].title).toBe('Acme renewal');
  });

  it('searches the title', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ search: 'Acme' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(2);
  });

  it('searches case-insensitively', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ search: 'gLoBeX' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
  });

  it('combines a search with a stage filter', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ search: 'Acme', stage: 'Negotiation' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.deals[0].title).toBe('Acme upsell');
  });

  it('treats regex metacharacters as literal text', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ search: '.*' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('survives an unbalanced-parenthesis search without a 500', async () => {
    // `(((` is not a valid pattern: unescaped it throws a SyntaxError out of the
    // RegExp constructor, or Mongo rejects the whole query.
    const res = await api()
      .get('/api/deals')
      .query({ search: '(((' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('returns nothing for a term that matches no deal', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ search: 'no-such-deal-anywhere' })
      .set('Authorization', asMember());

    expect(res.body.data.deals).toHaveLength(0);
  });

  it('400s on a malformed assignedTo filter', async () => {
    const res = await api()
      .get('/api/deals')
      .query({ assignedTo: 'not-an-id' })
      .set('Authorization', asMember());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// KNOWN GAP — closedAt is only stamped by the /stage route.
//
// `it.failing` passes while the body throws and fails once it starts passing.
//
// The defect: moveDealStage (PATCH /:id/stage) deliberately uses findOne + save
// so the pre-save hook fires and stamps closedAt. updateDeal (PATCH /:id) uses
// findOneAndUpdate, which does NOT run document middleware — so setting a deal
// to Won through the ordinary edit form leaves closedAt null.
//
// Why it matters: closedAt is the field the money reports key off.
// dashboard.service and reports.service both bucket revenue by closedAt, so a
// deal won through the edit form is invisible to weekly revenue, the revenue
// trend, and sales performance — while showing as Won everywhere else. It reads
// as "the dashboard is wrong", not as a stage bug.
//
// Reported to the maintainer rather than fixed; the brief was tests only.
// ═════════════════════════════════════════════════════════════════════════════

describe('KNOWN GAP: closedAt on PATCH /api/deals/:id', () => {
  it.failing('winning a deal through the generic PATCH should stamp closedAt', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });

    const res = await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe('Won');
    expect((await Deal.findById(deal._id)).closedAt).not.toBeNull();
  });

  it.failing('losing a deal through the generic PATCH should stamp closedAt', async () => {
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation' });

    await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ stage: 'Lost' });

    expect((await Deal.findById(deal._id)).closedAt).not.toBeNull();
  });

  it.failing('a deal won through the generic PATCH should count as weekly revenue', async () => {
    // The user-visible symptom, asserted through the dashboard rather than the
    // model, so it is obvious what actually breaks. getStats buckets weekly
    // revenue on `stage: 'Won', closedAt >= startOfWeek`, so a null closedAt
    // drops the deal out of the number entirely.
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation', value: 5000 });

    await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const res = await api().get('/api/dashboard/stats').set('Authorization', asMember());

    expect(res.body.data.weeklyRevenue.amount).toBe(5000);
  });

  it.failing('a deal won through the generic PATCH should appear in the revenue trend buckets', async () => {
    // `totalWon` on this endpoint matches on stage alone, so it is NOT affected.
    // The month-by-month `trend` array groups by closedAt, so it is.
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation', value: 5000 });

    await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const res = await api()
      .get('/api/dashboard/revenue-trend')
      .set('Authorization', asMember());

    // The current month is the last bucket.
    const currentMonth = res.body.data.trend[res.body.data.trend.length - 1];
    expect(currentMonth.value).toBe(5000);
  });

  it.failing('a deal won through the generic PATCH should appear in the activity log', async () => {
    // activity.controller matches on `closedAt: { $ne: null }`, so a deal won
    // this way is silently absent from the team's activity feed.
    const deal = await factory.createDeal(T.orgId, {
      title: 'Quietly Won',
      stage: 'Negotiation',
      value: 5000,
    });

    await api()
      .patch(`/api/deals/${deal._id}`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    const res = await api().get('/api/activity-log').set('Authorization', asMember());

    expect(JSON.stringify(res.body)).toContain('Quietly Won');
  });

  it('the /stage route, by contrast, does stamp it — this is the working path', async () => {
    // Deliberately a passing test, sitting next to the failing ones: it pins the
    // difference between the two routes so the gap above cannot be misread as
    // "closedAt never works".
    const deal = await factory.createDeal(T.orgId, { stage: 'Negotiation', value: 5000 });

    await api()
      .patch(`/api/deals/${deal._id}/stage`)
      .set('Authorization', asMember())
      .send({ stage: 'Won' });

    expect((await Deal.findById(deal._id)).closedAt).not.toBeNull();
  });
});
