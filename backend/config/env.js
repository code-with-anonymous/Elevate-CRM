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

  // ── Google Gemini ───────────────────────────────────────────────────────────
  // Powers the AI lead summary and email drafting on POST /api/leads/:id/ai-*.
  //
  // OPTIONAL, and deliberately NOT in the `required` array above: with no key
  // the server boots normally and those two routes answer 503 AI_NOT_CONFIGURED.
  // Everything else is unaffected, so a missing key never costs you a deploy.
  //
  // Unlike email.service.js, there is no stub fallback here on purpose — a
  // console-logged email is honest, but a fabricated risk score is not, and reps
  // would act on it.
  GEMINI_API_KEY:        process.env.GEMINI_API_KEY || '',

  // Kept in config so a Google model deprecation is an env change, not a deploy.
  // Verify a replacement supports generateContent before switching:
  //   curl -H "x-goog-api-key: $KEY" https://generativelanguage.googleapis.com/v1beta/models
  GEMINI_MODEL:          process.env.GEMINI_MODEL || 'gemini-2.5-flash',

  // ── Cookie policy ───────────────────────────────────────────────────────────
  // Set CROSS_SITE_COOKIES=true when the API and the app are on DIFFERENT
  // registrable domains — e.g. app on *.vercel.app, API on *.onrender.com.
  //
  // Why it matters: the refresh token is an httpOnly cookie. SameSite=Strict
  // (the old hardcoded prod value) is never sent on a cross-site request, so
  // POST /auth/refresh would arrive with no cookie, 401, and sign the user out
  // ~15 minutes after every login. Cross-site needs SameSite=None + Secure.
  //
  // Leave it FALSE if you put both on one domain (app.example.com +
  // api.example.com share example.com, so they're same-site). Lax is both
  // simpler and stricter — prefer that setup if you can.
  CROSS_SITE_COOKIES:    process.env.CROSS_SITE_COOKIES === 'true',

  // Comma-separated extra origins for CORS, e.g. a staging domain.
  EXTRA_CORS_ORIGINS:    (process.env.EXTRA_CORS_ORIGINS || '')
                           .split(',')
                           .map((o) => o.trim())
                           .filter(Boolean),

  // Allow Vercel preview deployments (https://<branch-hash>.vercel.app) through
  // CORS. Convenient while iterating; turn it off if the API holds real data,
  // since it trusts every project on vercel.app.
  ALLOW_VERCEL_PREVIEWS: process.env.ALLOW_VERCEL_PREVIEWS === 'true',

  // ── DNS ─────────────────────────────────────────────────────────────────────
  // Force a specific DNS resolver for this process, e.g. DNS_SERVERS=1.1.1.1,8.8.8.8
  //
  // Why this exists: a `mongodb+srv://` URI requires an SRV record lookup, and
  // many consumer ISP routers act as a DNS proxy that answers A and TXT queries
  // but returns NODATA for SRV. The driver then dies with
  // `querySrv ENODATA _mongodb._tcp.<cluster>` even though the network is fine.
  //
  // Leave this UNSET normally — config/db.js detects that exact failure and
  // retries on public resolvers by itself. Set it only to pin the resolver
  // explicitly (which also skips the failed first attempt, saving a few seconds
  // on a network you already know is broken).
  DNS_SERVERS:           (process.env.DNS_SERVERS || '')
                           .split(',')
                           .map((s) => s.trim())
                           .filter(Boolean),

  // Set to 'false' to forbid the automatic public-resolver retry described above
  // — e.g. on a locked-down network where outbound DNS to 1.1.1.1 is not allowed
  // and you would rather fail fast than wait for it to time out.
  DNS_SRV_FALLBACK:      process.env.DNS_SRV_FALLBACK !== 'false',

  // Helpers
  IS_PROD:               process.env.NODE_ENV === 'production',
  IS_DEV:                process.env.NODE_ENV === 'development',
};
