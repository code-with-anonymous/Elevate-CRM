// ─────────────────────────────────────────────────────────────────────────────
// tests/helpers/api.js — supertest wiring plus the response-shape adapters.
//
// The four CRM resources do NOT share a response envelope. leads.controller.js
// goes through utils/ApiResponse ({ success, message, data }), while deals,
// contacts and tasks write res.json() by hand ({ success, data }). A list is
// keyed by its own resource name in every case, and a single-record read is
// `data.lead` for leads but bare `data` for the other three.
//
// The adapters below exist so the multitenancy and CRUD suites can iterate over
// all four resources with one body of assertions instead of four near-copies —
// and so a future envelope change breaks in ONE place.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const supertest = require('supertest');
const app = require('../../app');

const api = () => supertest(app);

/** `Authorization` header value for a raw token. */
const bearer = (token) => `Bearer ${token}`;

/** Records serialise with a virtual `id` and no `_id`; fixtures have `_id`. */
const idOf = (record) => String(record?.id ?? record?._id ?? record);

// ── Resource descriptors ──────────────────────────────────────────────────────

const Lead = require('../../models/Lead');
const Deal = require('../../models/Deal');
const Contact = require('../../models/Contact');
const Task = require('../../models/Task');

/**
 * @typedef {object} ResourceSpec
 * @property {string}   name        Singular label used in test titles.
 * @property {string}   path        Collection URL.
 * @property {string}   listKey     Key holding the array inside `data`.
 * @property {import('mongoose').Model} model  For asserting DB state directly.
 * @property {Function} build       (factory, orgId, overrides) => Promise<doc>
 * @property {Function} readList    (body) => array
 * @property {Function} readOne     (body) => record
 * @property {object}   validPatch  A body that WOULD succeed in-tenant.
 * @property {object}   validCreate A body that succeeds as a create.
 * @property {string}   searchField Field the ?search= filter covers, used to
 *                                  prove a cross-tenant record cannot be
 *                                  surfaced by searching for its own contents.
 * @property {boolean}  softDelete  DELETE flips isDeleted instead of removing.
 * @property {string}   [enumField] A field with a schema enum, for validation.
 * @property {string}   [enumValid]
 */

/** @type {Record<string, ResourceSpec>} */
const RESOURCES = {
  leads: {
    name: 'Lead',
    path: '/api/leads',
    listKey: 'leads',
    model: Lead,
    build: (factory, orgId, overrides) => factory.createLead(orgId, overrides),
    readList: (body) => body.data.leads,
    readOne: (body) => body.data.lead,
    validPatch: { company: 'Patched Company' },
    validCreate: { firstName: 'New', lastName: 'Lead' },
    searchField: 'company',
    softDelete: true,
    enumField: 'status',
    enumValid: 'Qualified',
  },
  deals: {
    name: 'Deal',
    path: '/api/deals',
    listKey: 'deals',
    model: Deal,
    build: (factory, orgId, overrides) => factory.createDeal(orgId, overrides),
    readList: (body) => body.data.deals,
    readOne: (body) => body.data,
    validPatch: { title: 'Patched Deal' },
    validCreate: { title: 'New Deal', value: 250 },
    searchField: 'title',
    softDelete: false,
    enumField: 'stage',
    enumValid: 'Negotiation',
  },
  contacts: {
    name: 'Contact',
    path: '/api/contacts',
    listKey: 'contacts',
    model: Contact,
    build: (factory, orgId, overrides) => factory.createContact(orgId, overrides),
    readList: (body) => body.data.contacts,
    readOne: (body) => body.data,
    validPatch: { company: 'Patched Contact Co' },
    validCreate: { firstName: 'New', lastName: 'Contact' },
    searchField: 'company',
    softDelete: true,
    enumField: 'status',
    enumValid: 'inactive',
  },
  tasks: {
    name: 'Task',
    path: '/api/tasks',
    listKey: 'tasks',
    model: Task,
    build: (factory, orgId, overrides) => factory.createTask(orgId, overrides),
    readList: (body) => body.data.tasks,
    readOne: (body) => body.data,
    validPatch: { title: 'Patched Task' },
    validCreate: { title: 'New Task' },
    searchField: 'title',
    softDelete: false,
    enumField: 'priority',
    enumValid: 'High',
  },
};

const ALL_RESOURCES = Object.values(RESOURCES);

/**
 * Extract the refresh-token cookie from a response, ready to send back.
 * Returns null when the response set no such cookie.
 */
function refreshCookieFrom(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return null;
  const cookie = raw.find((c) => c.startsWith('refreshToken='));
  if (!cookie) return null;
  return cookie.split(';')[0]; // "refreshToken=<jwt>"
}

/** The bare JWT out of a refresh cookie string. */
function refreshTokenValue(cookie) {
  if (!cookie) return null;
  return decodeURIComponent(cookie.split('=').slice(1).join('='));
}

module.exports = {
  api,
  app,
  bearer,
  idOf,
  RESOURCES,
  ALL_RESOURCES,
  refreshCookieFrom,
  refreshTokenValue,
};
