// ─────────────────────────────────────────────────────────────────────────────
// tests/helpers/factory.js — fixture builders.
//
// Users and records are written straight to Mongo rather than driven through
// the HTTP API. Two reasons: /auth/login is capped at 5 attempts per 15 minutes
// per IP, and a registered user starts unverified so could not log in anyway.
//
// Access tokens are minted with the SAME payload shape auth.service.buildTokenPair
// produces — { sub, role, organizationId, permissions } signed with
// ACCESS_TOKEN_SECRET and issuer 'elevate-crm'. If that payload ever changes,
// these fixtures must change with it or the RBAC suites stop testing reality.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const env = require('../../config/env');
const User = require('../../models/User');
const Organization = require('../../models/Organization');
const Lead = require('../../models/Lead');
const Deal = require('../../models/Deal');
const Contact = require('../../models/Contact');
const Task = require('../../models/Task');
const tokenService = require('../../services/token.service');
const { derivePermissions } = require('../../config/permissions');

/** The password every fixture user shares. Satisfies the register validators. */
const DEFAULT_PASSWORD = 'Password123';

let seq = 0;
const uniq = (prefix) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

/** Mint an access token exactly as a real login would. */
function accessTokenFor(user) {
  return tokenService.generateAccessToken({
    sub: user._id.toString(),
    role: user.role,
    organizationId: user.organizationId.toString(),
    permissions: derivePermissions(user),
  });
}

/**
 * Create an organization and its owner.
 * @returns {Promise<{org, owner, ownerToken}>}
 */
async function createOrganization({ name = uniq('Org'), plan = 'free' } = {}) {
  const slug = await Organization.generateSlug(name);
  const org = new Organization({ name, slug, plan, ownerId: null, memberCount: 1 });

  const owner = await buildUser({ organizationId: org._id, role: 'owner' });
  org.ownerId = owner._id;
  await org.save();

  return { org, owner, ownerToken: accessTokenFor(owner) };
}

/**
 * Create a user document. Verified and active by default so it can be used
 * immediately; pass overrides to exercise the unhappy paths.
 */
async function buildUser({
  organizationId,
  role = 'member',
  email = null,
  password = DEFAULT_PASSWORD,
  isEmailVerified = true,
  isActive = true,
  is2FAEnabled = false,
  twoFASecret = null,
  firstName = 'Test',
  lastName = 'User',
  ...rest
} = {}) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);

  return User.create({
    organizationId,
    firstName,
    lastName,
    email: email || `${uniq('user')}@example.com`,
    passwordHash,
    role,
    isEmailVerified,
    isActive,
    is2FAEnabled,
    twoFASecret,
    ...rest,
  });
}

/**
 * A full tenant: the org plus one user at every role, each with a token.
 *
 * @returns {Promise<Tenant>} `.users.viewer`, `.tokens.viewer`, `.org`, …
 */
async function createTenant({ name } = {}) {
  const { org, owner, ownerToken } = await createOrganization({ name });

  const roles = ['admin', 'manager', 'member', 'viewer'];
  const users = { owner };
  const tokens = { owner: ownerToken };

  for (const role of roles) {
    const user = await buildUser({
      organizationId: org._id,
      role,
      firstName: role[0].toUpperCase() + role.slice(1),
      lastName: 'Fixture',
    });
    users[role] = user;
    tokens[role] = accessTokenFor(user);
  }

  return {
    org,
    orgId: org._id,
    users,
    tokens,
    /** Convenience: `tenant.auth('viewer')` → 'Bearer eyJ…' */
    auth: (role = 'owner') => `Bearer ${tokens[role]}`,
    accessTokenFor,
  };
}

// ── Record builders ───────────────────────────────────────────────────────────
// Every one takes an explicit organizationId. That is the whole point of the
// multitenancy suite: fixtures must be able to place a record in the *wrong*
// tenant on purpose.

async function createLead(organizationId, overrides = {}) {
  return Lead.create({
    organizationId,
    firstName: 'Lead',
    lastName: uniq('Last'),
    email: `${uniq('lead')}@example.com`,
    company: 'Acme Inc',
    source: 'Website',
    status: 'New',
    value: 1000,
    ...overrides,
  });
}

async function createDeal(organizationId, overrides = {}) {
  return Deal.create({
    organizationId,
    title: uniq('Deal'),
    value: 5000,
    stage: 'Lead',
    currency: 'USD',
    ...overrides,
  });
}

async function createContact(organizationId, overrides = {}) {
  return Contact.create({
    organizationId,
    firstName: 'Contact',
    lastName: uniq('Last'),
    email: `${uniq('contact')}@example.com`,
    company: 'Globex',
    status: 'active',
    ...overrides,
  });
}

async function createTask(organizationId, overrides = {}) {
  return Task.create({
    organizationId,
    title: uniq('Task'),
    priority: 'Medium',
    status: 'Open',
    ...overrides,
  });
}

/** A syntactically valid ObjectId that matches nothing. */
const missingId = () => new mongoose.Types.ObjectId().toString();

module.exports = {
  DEFAULT_PASSWORD,
  accessTokenFor,
  createOrganization,
  buildUser,
  createTenant,
  createLead,
  createDeal,
  createContact,
  createTask,
  missingId,
  uniq,
};
