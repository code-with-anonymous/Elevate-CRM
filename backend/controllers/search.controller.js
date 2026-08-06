// ─────────────────────────────────────────────────────────────────────────────
// controllers/search.controller.js — global search across Leads/Contacts/Tasks
//
// Three parallel finds, capped at 5 each. Not $unionWith: results are GROUPED
// by type in the response (the palette renders them under headings), so there
// is nothing to gain from interleaving them in the database and then splitting
// them apart again in JS.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const Lead = require('../models/Lead');
const Contact = require('../models/Contact');
const Task = require('../models/Task');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');

const PER_TYPE_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

/**
 * Escape regex metacharacters before interpolating user input.
 *
 * Without this, a query of `.*` matches every record, and `(((` throws an
 * unhandled SyntaxError out of the RegExp constructor. The existing
 * leads.controller search has the same shape and the same gap — worth fixing
 * there too.
 */
function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── GET /api/search?q= ────────────────────────────────────────────────────────
const search = asyncHandler(async (req, res) => {
  const raw = String(req.query.q || '').trim();

  // Short queries match nearly everything, which is slow and useless. Return an
  // empty result rather than a 400 — the palette calls this on every keystroke,
  // and an error toast per character would be unusable.
  if (raw.length < MIN_QUERY_LENGTH) {
    return ApiResponse.ok(res, 'Search results', {
      query: raw,
      groups: { leads: [], contacts: [], tasks: [] },
      total: 0,
    });
  }

  const rx = new RegExp(escapeRegex(raw), 'i');
  const orgId = req.organizationId;

  const [leads, contacts, tasks] = await Promise.all([
    Lead.find({
      organizationId: orgId,
      isDeleted: { $ne: true },
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }, { company: rx }],
    })
      .select('firstName lastName email company status value')
      .limit(PER_TYPE_LIMIT)
      .lean(),

    Contact.find({
      organizationId: orgId,
      isDeleted: { $ne: true },
      $or: [{ firstName: rx }, { lastName: rx }, { email: rx }, { company: rx }],
    })
      .select('firstName lastName email company jobTitle status')
      .limit(PER_TYPE_LIMIT)
      .lean(),

    Task.find({
      organizationId: orgId,
      $or: [{ title: rx }, { description: rx }],
    })
      .select('title status priority dueDate')
      .limit(PER_TYPE_LIMIT)
      .lean(),
  ]);

  // Normalized to one shape per hit — the palette renders a single row
  // component and shouldn't branch on type to find a label.
  const groups = {
    leads: leads.map((l) => ({
      id: l._id.toString(),
      type: 'lead',
      title: `${l.firstName} ${l.lastName}`.trim(),
      subtitle: l.company || l.email || null,
      badge: l.status,
      href: `/leads/${l._id}`,
    })),
    contacts: contacts.map((c) => ({
      id: c._id.toString(),
      type: 'contact',
      title: `${c.firstName} ${c.lastName}`.trim(),
      subtitle: c.jobTitle || c.company || c.email || null,
      badge: c.status,
      // No contact detail route exists — the list page is the honest target.
      href: '/contacts',
    })),
    tasks: tasks.map((t) => ({
      id: t._id.toString(),
      type: 'task',
      title: t.title,
      subtitle: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
      badge: t.status,
      href: '/tasks',
    })),
  };

  return ApiResponse.ok(res, 'Search results', {
    query: raw,
    groups,
    total: groups.leads.length + groups.contacts.length + groups.tasks.length,
  });
});

module.exports = { search };
