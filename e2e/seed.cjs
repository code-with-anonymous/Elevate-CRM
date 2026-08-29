// ─────────────────────────────────────────────────────────────────────────────
// e2e/seed.cjs — seed the E2E database with one organization and one user per
// role, all verified and active.
//
// Run as a child process by e2e/global-setup.ts, with MONGODB_URI pointing at
// the in-memory server.
//
// The application's OWN models and bcrypt settings are used, resolved out of
// backend/node_modules, so a schema change breaks the seed loudly instead of
// producing documents the app cannot read. `require.resolve` with an explicit
// `paths` is what keeps this to a single mongoose instance: the model files
// resolve mongoose from the same directory, so they register on the connection
// opened below rather than on a second copy of the library.
//
// Users are written directly rather than registered through the API because a
// registered user starts UNVERIFIED and so cannot log in — and because
// POST /auth/register is itself under test in auth.spec.ts, which should be
// exercising it for the first time, not re-running it as setup.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const BACKEND = path.resolve(__dirname, '..', 'backend');
const fromBackend = (id) => require(require.resolve(id, { paths: [BACKEND] }));

const mongoose = fromBackend('mongoose');
const bcrypt = fromBackend('bcryptjs');

const User = require(path.join(BACKEND, 'models', 'User'));
const Organization = require(path.join(BACKEND, 'models', 'Organization'));

/** Shared by every seeded account. Satisfies the register/reset validators. */
const PASSWORD = 'Password123';

const ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('seed.cjs: MONGODB_URI is not set');

  // No dbName override: the database is part of the URI that global-setup.ts
  // hands both this script and the API, which is what keeps them in the same one.
  await mongoose.connect(uri);

  // Idempotent: a re-run against a live server starts from a clean slate rather
  // than colliding on the unique index on User.email.
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  // ── The organization under test ────────────────────────────────────────────
  const orgName = 'E2E Test Org';
  const slug = await Organization.generateSlug(orgName);
  const org = new Organization({ name: orgName, slug, ownerId: null, memberCount: ROLES.length });

  const users = {};

  for (const role of ROLES) {
    const user = await User.create({
      organizationId: org._id,
      firstName: role[0].toUpperCase() + role.slice(1),
      lastName: 'E2E',
      email: `${role}@e2e.test`,
      passwordHash,
      role,
      isEmailVerified: true,
      isActive: true,
    });

    if (role === 'owner') org.ownerId = user._id;

    users[role] = {
      id: user._id.toString(),
      email: user.email,
      password: PASSWORD,
      role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  await org.save();

  // ── A second organization, so isolation is observable from the UI ──────────
  // Nothing belonging to this org may ever appear in the app while signed in as
  // the org above.
  const otherName = 'Rival Org';
  const otherSlug = await Organization.generateSlug(otherName);
  const otherOrg = new Organization({
    name: otherName,
    slug: otherSlug,
    ownerId: null,
    memberCount: 1,
  });
  const otherOwner = await User.create({
    organizationId: otherOrg._id,
    firstName: 'Rival',
    lastName: 'Owner',
    email: 'owner@rival.test',
    passwordHash,
    role: 'owner',
    isEmailVerified: true,
    isActive: true,
  });
  otherOrg.ownerId = otherOwner._id;
  await otherOrg.save();

  const state = {
    organization: { id: org._id.toString(), name: orgName, slug },
    rivalOrganization: { id: otherOrg._id.toString(), name: otherName },
    users,
    password: PASSWORD,
  };

  const outPath = path.join(__dirname, '.artifacts', 'seed.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(state, null, 2));

  await mongoose.disconnect();

  console.log(`[seed] ${ROLES.length} users in "${orgName}" + 1 rival org -> ${outPath}`);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
