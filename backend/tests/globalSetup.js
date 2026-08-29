// ─────────────────────────────────────────────────────────────────────────────
// tests/globalSetup.js — one in-memory MongoDB for the whole run.
//
// Jest executes each test FILE in its own worker process. Starting a server per
// worker would download/boot mongod several times over, so one instance is
// started here and every worker connects to it using a database name keyed on
// JEST_WORKER_ID (see setup/afterEnv.js) — shared process, isolated data.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  const mongod = await MongoMemoryServer.create({
    binary: { version: '7.0.14' },
  });

  // Workers inherit process.env from the globalSetup context.
  process.env.MONGO_URI_TEST = mongod.getUri();

  // Stash the handle for globalTeardown.
  globalThis.__MONGOD__ = mongod;
};
