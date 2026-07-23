// ─────────────────────────────────────────────────────────────────────────────
// config/env.js — Validate and export all environment variables at startup
// Throws immediately if required vars are missing
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const required = [
  'MONGODB_URI',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  NODE_ENV:              process.env.NODE_ENV || 'development',
  PORT:                  parseInt(process.env.PORT || '5000', 10),
  MONGODB_URI:           process.env.MONGODB_URI,
  CLIENT_URL:            process.env.CLIENT_URL || 'http://localhost:5173',

  // JWT
  ACCESS_TOKEN_SECRET:   process.env.ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES:  process.env.ACCESS_TOKEN_EXPIRES  || '15m',
  REFRESH_TOKEN_SECRET:  process.env.REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_EXPIRES: process.env.REFRESH_TOKEN_EXPIRES || '7d',

  // Email — Brevo SMTP (optional; falls back to console logger when absent)
  SMTP_HOST:             process.env.SMTP_HOST ,
  SMTP_PORT:             process.env.SMTP_PORT,
  SMTP_USER:             process.env.SMTP_USER,
  SMTP_PASS:             process.env.SMTP_PASS ,
  EMAIL_FROM:            process.env.EMAIL_FROM || 'mrrayyan200@mail.com',

  // Bcrypt
  BCRYPT_ROUNDS:         parseInt(process.env.BCRYPT_ROUNDS || '12', 10),

  // Helpers
  IS_PROD:               process.env.NODE_ENV === 'production',
  IS_DEV:                process.env.NODE_ENV === 'development',
};
