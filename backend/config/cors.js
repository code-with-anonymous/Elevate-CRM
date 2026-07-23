// ─────────────────────────────────────────────────────────────────────────────
// config/cors.js — CORS options with dynamic whitelist
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const env = require('./env');

const whitelist = new Set([
  env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
]);

const corsOptions = {
  origin(origin, callback) {
    // Allow same-origin / server-to-server (no Origin header)
    if (!origin || whitelist.has(origin)) {
      callback(null, true);
    } else {
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
