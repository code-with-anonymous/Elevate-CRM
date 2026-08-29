// ─────────────────────────────────────────────────────────────────────────────
// tests/setup/afterEnv.js — per-worker DB lifecycle + rate-limiter reset.
// (jest `setupFilesAfterEnv`)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const mongoose = require('mongoose');
const { resetRateLimiters } = require('../helpers/rateLimit');

jest.setTimeout(60_000);

beforeAll(async () => {
  const uri = process.env.MONGO_URI_TEST;
  if (!uri) {
    throw new Error(
      'MONGO_URI_TEST is not set — tests/globalSetup.js did not run. ' +
        'Run the suite through `npm test`, not by invoking jest on a single file ' +
        'without the project config.'
    );
  }

  // One database per Jest worker. Test files run in parallel processes against
  // the same mongod, so without this a collection wipe in one file would delete
  // another file's fixtures mid-assertion.
  const dbName = `elevatecrm_test_w${process.env.JEST_WORKER_ID || '1'}`;

  await mongoose.connect(uri, { dbName });

  // Guard, not decoration. tests/setup/testEnv.js used to `delete` the SMTP
  // variables, which let dotenv refill them from backend/.env when app.js loaded
  // — and the suite authenticated against the live Brevo SMTP server on its
  // first run. If that regresses, fail here rather than mail real people.
  const env = require('../../config/env');
  if (env.SMTP_HOST || env.SMTP_USER || env.SMTP_PASS) {
    throw new Error(
      'Refusing to run: real SMTP credentials are visible to the test process ' +
        `(SMTP_HOST="${env.SMTP_HOST}"). tests/setup/testEnv.js must BLANK these, not delete them.`
    );
  }
  if (env.GEMINI_API_KEY) {
    throw new Error('Refusing to run: a live GEMINI_API_KEY is visible to the test process.');
  }
});

afterEach(async () => {
  // Wipe rather than drop: dropping a collection also drops its indexes, and
  // several assertions depend on the unique index on User.email producing a
  // duplicate-key error.
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );

  // The limiters are module-level singletons created when app.js was required,
  // so their counters survive across tests. generalLimiter allows 100 requests
  // per 15 minutes per IP and every request in this suite comes from the same
  // loopback address — without this reset the suite starts 429-ing partway
  // through and every later failure is a phantom.
  await resetRateLimiters();
});

afterAll(async () => {
  await mongoose.connection.close();
});
