// ─────────────────────────────────────────────────────────────────────────────
// tests/tasks.test.js — CRUD, validation, pagination, filtering, completion.
//
// Envelope, as written by tasks.controller.js:
//   list   → { success, data: { tasks, total, page, limit } }
//   single → { success, data: <task> }
//
// Tenant isolation is in multitenancy.test.js; role guards are in rbac.test.js.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { api } = require('./helpers/api');
const factory = require('./helpers/factory');
const Task = require('../models/Task');

let T;

beforeEach(async () => {
  T = await factory.createTenant({ name: 'Tasks Org' });
});

const asMember = () => T.auth('member');

/** Yesterday / tomorrow, for the overdue filter. */
const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/tasks
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/tasks', () => {
  it('creates a task scoped to the caller\'s organization', async () => {
    const res = await api().post('/api/tasks').set('Authorization', asMember()).send({
      title: 'Call the prospect back',
      description: 'They asked about pricing',
      priority: 'High',
      dueDate: '2027-03-01',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Call the prospect back');
    expect(res.body.data.priority).toBe('High');

    const stored = await Task.findById(res.body.data.id);
    expect(stored.organizationId.toString()).toBe(T.orgId.toString());
  });

  it('applies defaults for the fields left out', async () => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'Minimal task' });

    expect(res.status).toBe(201);
    expect(res.body.data.priority).toBe('Medium');
    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.dueDate).toBeNull();
    expect(res.body.data.completedAt).toBeNull();
    expect(res.body.data.assignedTo).toBeNull();
  });

  it('rejects a missing title', async () => {
    const res = await api().post('/api/tasks').set('Authorization', asMember()).send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('title');
    expect(await Task.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it('rejects an empty-string title', async () => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(await Task.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it.each([
    ['priority', 'Urgent'],
    ['status', 'Halfway'],
    ['relatedModel', 'Invoice'],
  ])('rejects an invalid %s enum value', async (field, value) => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'A task', [field]: value });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors.some((e) => e.field === field)).toBe(true);
    expect(await Task.countDocuments({ organizationId: T.orgId })).toBe(0);
  });

  it.each(['High', 'Medium', 'Low'])('accepts the valid priority "%s"', async (priority) => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'A task', priority });

    expect(res.status).toBe(201);
    expect(res.body.data.priority).toBe(priority);
  });

  it.each(['Open', 'In Progress', 'Done'])('accepts the valid status "%s"', async (status) => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'A task', status });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe(status);
  });

  it('stamps completedAt when created directly as Done', async () => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'Already finished', status: 'Done' });

    expect(res.body.data.completedAt).not.toBeNull();
  });

  it('links to a lead through the polymorphic reference', async () => {
    const lead = await factory.createLead(T.orgId, { firstName: 'Linked', lastName: 'Lead' });

    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'Chase lead', relatedTo: lead._id.toString(), relatedModel: 'Lead' });

    expect(res.status).toBe(201);
    expect(res.body.data.relatedTo.firstName).toBe('Linked');
    expect(res.body.data.relatedModel).toBe('Lead');
  });

  it('returns the assignee populated', async () => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'Assigned', assignedTo: T.users.manager._id.toString() });

    expect(res.body.data.assignedTo.email).toBe(T.users.manager.email);
  });

  it('400s on a malformed assignedTo id rather than 500', async () => {
    const res = await api()
      .post('/api/tasks')
      .set('Authorization', asMember())
      .send({ title: 'A task', assignedTo: 'not-an-objectid' });

    expect(res.status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/tasks/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/tasks/:id', () => {
  it('returns the task with its relations populated', async () => {
    const lead = await factory.createLead(T.orgId, { company: 'Related Co' });
    const task = await factory.createTask(T.orgId, {
      title: 'With relations',
      assignedTo: T.users.member._id,
      relatedTo: lead._id,
      relatedModel: 'Lead',
    });

    const res = await api().get(`/api/tasks/${task._id}`).set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('With relations');
    expect(res.body.data.assignedTo.email).toBe(T.users.member.email);
    expect(res.body.data.relatedTo.company).toBe('Related Co');
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .get(`/api/tasks/${factory.missingId()}`)
      .set('Authorization', asMember());

    expect(res.status).toBe(404);
  });

  it('400s for a malformed id', async () => {
    const res = await api().get('/api/tasks/nope').set('Authorization', asMember());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/tasks/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/tasks/:id', () => {
  it('updates the allowed fields', async () => {
    const task = await factory.createTask(T.orgId, { title: 'Before' });

    const res = await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ title: 'After', priority: 'High', description: 'Now urgent' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('After');
    expect(res.body.data.priority).toBe('High');
    expect(res.body.data.description).toBe('Now urgent');
  });

  it('stamps completedAt when the status moves to Done', async () => {
    const task = await factory.createTask(T.orgId, { status: 'Open' });

    const res = await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ status: 'Done' });

    expect(res.body.data.status).toBe('Done');
    expect(res.body.data.completedAt).not.toBeNull();
  });

  it('clears completedAt when a Done task is reopened', async () => {
    // Reopening is the case that matters: a stale completedAt on an open task
    // would show up as a completed task in every report that counts by date.
    const task = await factory.createTask(T.orgId, {
      status: 'Done',
      completedAt: new Date(),
    });

    const res = await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ status: 'Open' });

    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.completedAt).toBeNull();
  });

  it('clears completedAt when moved to In Progress', async () => {
    const task = await factory.createTask(T.orgId, {
      status: 'Done',
      completedAt: new Date(),
    });

    const res = await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ status: 'In Progress' });

    expect(res.body.data.completedAt).toBeNull();
  });

  it('does not move completedAt when Done is re-sent', async () => {
    const original = new Date('2025-06-01T00:00:00.000Z');
    const task = await factory.createTask(T.orgId, { status: 'Done', completedAt: original });

    await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ status: 'Done' });

    expect((await Task.findById(task._id)).completedAt.getTime()).toBe(original.getTime());
  });

  it('leaves unsent fields alone', async () => {
    const task = await factory.createTask(T.orgId, { title: 'Keep', priority: 'High' });

    await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ description: 'only this' });

    const after = await Task.findById(task._id);
    expect(after.title).toBe('Keep');
    expect(after.priority).toBe('High');
  });

  it('rejects an invalid status and leaves the task untouched', async () => {
    const task = await factory.createTask(T.orgId, { status: 'Open' });

    const res = await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ status: 'Nearly Done' });

    expect(res.status).toBe(400);
    expect((await Task.findById(task._id)).status).toBe('Open');
  });

  it('rejects an invalid priority', async () => {
    const task = await factory.createTask(T.orgId, { priority: 'Medium' });

    const res = await api()
      .patch(`/api/tasks/${task._id}`)
      .set('Authorization', asMember())
      .send({ priority: 'Critical' });

    expect(res.status).toBe(400);
    expect((await Task.findById(task._id)).priority).toBe('Medium');
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .patch(`/api/tasks/${factory.missingId()}`)
      .set('Authorization', asMember())
      .send({ title: 'X' });

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PATCH /api/tasks/:id/complete
// ═════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/tasks/:id/complete', () => {
  it('marks the task Done and stamps completedAt', async () => {
    const task = await factory.createTask(T.orgId, { status: 'Open' });

    const res = await api()
      .patch(`/api/tasks/${task._id}/complete`)
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Done');
    expect(res.body.data.completedAt).not.toBeNull();
  });

  it('is idempotent', async () => {
    const task = await factory.createTask(T.orgId);

    await api().patch(`/api/tasks/${task._id}/complete`).set('Authorization', asMember());
    const second = await api()
      .patch(`/api/tasks/${task._id}/complete`)
      .set('Authorization', asMember());

    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('Done');
  });

  it('is available to a member — ticking your own box is a write, not a delete', async () => {
    const task = await factory.createTask(T.orgId);

    const res = await api()
      .patch(`/api/tasks/${task._id}/complete`)
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
  });

  it('404s for an unknown id', async () => {
    const res = await api()
      .patch(`/api/tasks/${factory.missingId()}/complete`)
      .set('Authorization', asMember());

    expect(res.status).toBe(404);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DELETE /api/tasks/:id
// ═════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/tasks/:id', () => {
  it('hard-deletes the document', async () => {
    // Tasks carry no isDeleted flag, so this really removes the row.
    const task = await factory.createTask(T.orgId);

    const res = await api()
      .delete(`/api/tasks/${task._id}`)
      .set('Authorization', T.auth('manager'));

    expect(res.status).toBe(200);
    expect(await Task.findById(task._id)).toBeNull();
  });

  it('404s on a second delete', async () => {
    const task = await factory.createTask(T.orgId);

    await api().delete(`/api/tasks/${task._id}`).set('Authorization', T.auth('manager'));
    const again = await api()
      .delete(`/api/tasks/${task._id}`)
      .set('Authorization', T.auth('manager'));

    expect(again.status).toBe(404);
  });

  it('does not touch the related record', async () => {
    const lead = await factory.createLead(T.orgId);
    const task = await factory.createTask(T.orgId, {
      relatedTo: lead._id,
      relatedModel: 'Lead',
    });

    await api().delete(`/api/tasks/${task._id}`).set('Authorization', T.auth('manager'));

    const leadRes = await api().get(`/api/leads/${lead._id}`).set('Authorization', asMember());
    expect(leadRes.status).toBe(200);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/tasks — pagination
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/tasks — pagination', () => {
  async function seed(count) {
    for (let i = 0; i < count; i++) {
      // dueDate is the default sort key, so give each task a distinct one —
      // otherwise page boundaries are decided by Mongo's natural order and the
      // no-overlap assertion below becomes non-deterministic.
      await factory.createTask(T.orgId, {
        title: `Task ${String(i).padStart(2, '0')}`,
        dueDate: daysFromNow(i + 1),
      });
    }
  }

  it('defaults to page 1 with a limit of 50', async () => {
    await seed(5);

    const res = await api().get('/api/tasks').set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(5);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(50);
    expect(res.body.data.total).toBe(5);
  });

  it('honours an explicit page and limit', async () => {
    await seed(12);

    const res = await api()
      .get('/api/tasks')
      .query({ page: 2, limit: 5 })
      .set('Authorization', asMember());

    expect(res.body.data.tasks).toHaveLength(5);
    expect(res.body.data.page).toBe(2);
    expect(res.body.data.total).toBe(12);
  });

  it('returns the remainder on the final page', async () => {
    await seed(12);

    const res = await api()
      .get('/api/tasks')
      .query({ page: 3, limit: 5 })
      .set('Authorization', asMember());

    expect(res.body.data.tasks).toHaveLength(2);
  });

  it('never overlaps records between consecutive pages', async () => {
    await seed(12);

    const seen = new Set();
    for (const page of [1, 2, 3]) {
      const res = await api()
        .get('/api/tasks')
        .query({ page, limit: 5 })
        .set('Authorization', asMember());

      for (const task of res.body.data.tasks) {
        expect(seen.has(task.id)).toBe(false);
        seen.add(task.id);
      }
    }
    expect(seen.size).toBe(12);
  });

  it('returns an empty page past the end', async () => {
    await seed(3);

    const res = await api()
      .get('/api/tasks')
      .query({ page: 20, limit: 5 })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(0);
    expect(res.body.data.total).toBe(3);
  });

  it('sorts by dueDate ascending by default — soonest first', async () => {
    await seed(5);

    const res = await api().get('/api/tasks').set('Authorization', asMember());
    const dates = res.body.data.tasks.map((t) => new Date(t.dueDate).getTime());

    expect(dates).toEqual([...dates].sort((a, b) => a - b));
  });

  it('honours an explicit sort field', async () => {
    await seed(4);

    const res = await api()
      .get('/api/tasks')
      .query({ sort: '-dueDate' })
      .set('Authorization', asMember());

    const dates = res.body.data.tasks.map((t) => new Date(t.dueDate).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /api/tasks — filtering and search
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /api/tasks — filtering and search', () => {
  let lead;

  beforeEach(async () => {
    lead = await factory.createLead(T.orgId);

    await factory.createTask(T.orgId, {
      title: 'Call Acme about renewal',
      status: 'Open',
      priority: 'High',
      dueDate: daysFromNow(-3), // overdue
      assignedTo: T.users.manager._id,
    });
    await factory.createTask(T.orgId, {
      title: 'Email Globex the proposal',
      status: 'In Progress',
      priority: 'Medium',
      dueDate: daysFromNow(5),
      assignedTo: T.users.member._id,
    });
    await factory.createTask(T.orgId, {
      title: 'Archive Acme paperwork',
      status: 'Done',
      priority: 'Low',
      dueDate: daysFromNow(-10), // past due but already Done
      completedAt: new Date(),
      relatedTo: lead._id,
      relatedModel: 'Lead',
    });
  });

  it('filters by status', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ status: 'Open' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].title).toContain('Call Acme');
  });

  it('filters by priority', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ priority: 'Low' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].priority).toBe('Low');
  });

  it('filters by assignee', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ assignedTo: T.users.manager._id.toString() })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].title).toContain('Call Acme');
  });

  it('filters by the related record', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ relatedTo: lead._id.toString() })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].title).toContain('Archive Acme');
  });

  it('filters to overdue tasks, excluding ones already Done', async () => {
    // Two tasks are past their due date, but one is Done — a completed task is
    // not overdue, and showing it as such is how a follow-up list becomes noise.
    const res = await api()
      .get('/api/tasks')
      .query({ overdue: 'true' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].title).toContain('Call Acme');
  });

  it('does not apply the overdue filter for any value other than "true"', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ overdue: 'false' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(3);
  });

  it('the overdue filter takes precedence over an explicit status filter', async () => {
    // Documenting real precedence: the handler assigns filter.status AFTER the
    // status filter, so `overdue=true&status=Done` is read as overdue, not Done.
    const res = await api()
      .get('/api/tasks')
      .query({ overdue: 'true', status: 'Done' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].status).not.toBe('Done');
  });

  it('searches the title', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ search: 'Acme' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(2);
  });

  it('searches case-insensitively', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ search: 'gLoBeX' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
  });

  it('combines search with a filter', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ search: 'Acme', status: 'Done' })
      .set('Authorization', asMember());

    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tasks[0].title).toContain('Archive');
  });

  it('treats regex metacharacters as literal text', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ search: '.*' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('survives a catastrophic-backtracking pattern without hanging', async () => {
    // `(a+)+$` is a classic ReDoS. Escaped, it is just a literal string that
    // matches nothing; unescaped it would pin a CPU core.
    const res = await api()
      .get('/api/tasks')
      .query({ search: '(a+)+$' })
      .set('Authorization', asMember());

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
  });

  it('returns nothing for a term matching no task', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ search: 'no-such-task' })
      .set('Authorization', asMember());

    expect(res.body.data.tasks).toHaveLength(0);
  });

  it('400s on a malformed assignedTo filter', async () => {
    const res = await api()
      .get('/api/tasks')
      .query({ assignedTo: 'not-an-id' })
      .set('Authorization', asMember());

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ID');
  });
});
