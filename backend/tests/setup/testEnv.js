// ─────────────────────────────────────────────────────────────────────────────
// tests/setup/testEnv.js — runs BEFORE the test framework and before any
// application module is required (jest `setupFiles`).
//
// config/env.js throws at require-time when MONGODB_URI / ACCESS_TOKEN_SECRET /
// REFRESH_TOKEN_SECRET are absent, and app.js calls dotenv.config() the moment
// it is required. dotenv does NOT overwrite variables that are already set, so
// assigning them here is what keeps the suite off the real Atlas cluster in
// backend/.env — nothing in the tests ever calls connectDB(), but the URI must
// still not be the production one if a stray import ever did.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

process.env.NODE_ENV = 'test';

// globalSetup publishes the in-memory server URI here. Fall back to a dummy so
// requiring config/env.js never throws even if a file is run in isolation.
process.env.MONGODB_URI = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/elevatecrm-test';

process.env.ACCESS_TOKEN_SECRET  = 'test-access-secret-do-not-use-in-production';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-do-not-use-in-production';
process.env.ACCESS_TOKEN_EXPIRES  = '15m';
process.env.REFRESH_TOKEN_EXPIRES = '7d';

// Keep bcrypt cheap. The app default is 12 rounds, which is correct in
// production and roughly 300ms per hash — multiplied across hundreds of fixture
// users it dominates the entire suite runtime.
process.env.BCRYPT_ROUNDS = '4';

process.env.CLIENT_URL = 'http://localhost:5173';

// Blanked, NOT deleted — and the difference is not cosmetic.
//
// app.js runs `require('dotenv').config()` at require-time, which is AFTER this
// file. dotenv skips any key already present in process.env but happily fills in
// one that is absent, so `delete process.env.SMTP_HOST` handed the real
// backend/.env credentials straight back and the first run of this suite opened
// an authenticated session to the live Brevo SMTP server. Assigning '' keeps the
// key present, so dotenv leaves it alone and email.service.js falls back to its
// console-logging stub.
process.env.SMTP_HOST = '';
process.env.SMTP_PORT = '';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.EMAIL_FROM = 'test@example.com';

// Same reasoning: absent would be refilled from .env, and the two AI routes
// would then call (and bill) Google. Empty means 503 AI_NOT_CONFIGURED.
process.env.GEMINI_API_KEY = '';

// Not behind a proxy in tests, so `trust proxy` stays off: req.ip is the socket
// address and X-Forwarded-For cannot be spoofed past the rate limiter.
process.env.RENDER = '';
process.env.FLY_APP_NAME = '';
process.env.DYNO = '';
process.env.RAILWAY_ENVIRONMENT = '';
process.env.TRUST_PROXY = '';
process.env.CROSS_SITE_COOKIES = '';

// Keep the DNS fallback in config/db.js from ever engaging.
process.env.DNS_SERVERS = '';
