// ─────────────────────────────────────────────────────────────────────────────
// config/cors.js — CORS options with dynamic whitelist
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const env = require('./env');

// Exact-match origins. CLIENT_URL is the production app; the localhosts cover
// vite dev (5173), vite preview (4173), and CRA-style (3000).
const whitelist = new Set([
  env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://elevate-crm-ai.vercel.app/',
  ...env.EXTRA_CORS_ORIGINS,
]);

// Vercel gives every preview deployment its own hostname
// (my-app-git-branch-team.vercel.app), so an exact whitelist blocks all of them
// and previews can't talk to the API at all.
//
// Anchored on both ends — a bare `.includes('vercel.app')` would also match
// `https://vercel.app.attacker.com`.
const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function isAllowed(origin) {
  if (whitelist.has(origin)) return true;
  if (env.ALLOW_VERCEL_PREVIEWS && VERCEL_PREVIEW.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    // Allow same-origin / server-to-server (no Origin header)
    if (!origin || isAllowed(origin)) {
      callback(null, true);
    } else {
      // Logged, because a blocked origin shows up in the browser as an opaque
      // "CORS error" with no indication of which origin was refused.
      console.warn(`[CORS] blocked origin: ${origin}`);
      callback(new Error(`CORS: origin "${origin}" not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400,
};

module.exports = corsOptions;
