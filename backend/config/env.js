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

  // ── Platform ────────────────────────────────────────────────────────────────
  // True when a managed host is terminating TLS in front of us, which is a fact
  // about the runtime and NOT about NODE_ENV — a Render service with NODE_ENV
  // unset is still behind Render's proxy. app.js uses this to decide
  // `trust proxy`, so express-rate-limit keeps bucketing by real client IP even
  // on a deploy where NODE_ENV was forgotten.
  //
  // RENDER is injected by Render itself; the others cover the usual suspects.
  BEHIND_PROXY:          Boolean(
                           process.env.RENDER ||
                           process.env.FLY_APP_NAME ||
                           process.env.DYNO ||
                           process.env.RAILWAY_ENVIRONMENT ||
                           process.env.TRUST_PROXY === 'true'
                         ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Deployment sanity checks
//
// These run once at boot and only WARN — a misconfigured split deployment still
// starts and serves traffic, it just breaks in a way that is very hard to
// diagnose from the browser. Naming the problem in the server log is worth more
// than refusing to start.
// ─────────────────────────────────────────────────────────────────────────────

const cfg = module.exports;

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const isLocal = (host) => !host || /^(localhost|127\.0\.0\.1)(:|$)/.test(host);

// Run the checks on any hosted deploy, not only when NODE_ENV says production.
//
// A Render service with NODE_ENV unset defaults to 'development' here, which
// used to skip this whole block — so the one deploy most likely to be
// misconfigured was also the only one that said nothing about it. `GET /health`
// reporting `"env":"development"` from a public URL is the tell.
if (cfg.IS_PROD || cfg.BEHIND_PROXY) {
  const clientHost = hostOf(cfg.CLIENT_URL);

  // NODE_ENV unset on a hosted service. More than cosmetic: IS_PROD gates
  // `trust proxy`, morgan's log format, and the Secure flag on the refresh
  // cookie when CROSS_SITE_COOKIES is off.
  if (!cfg.IS_PROD) {
    console.warn(
      [
        `[config] NODE_ENV is "${cfg.NODE_ENV}" on a hosted deploy.`,
        '         Set NODE_ENV=production in the service environment — it gates',
        '         proxy trust, production logging, and the Secure cookie flag.',
      ].join('\n')
    );
  }

  // CLIENT_URL still on its localhost default. CORS will refuse the deployed
  // frontend, and every reset-password / invitation email will link to a machine
  // the recipient does not have.
  if (isLocal(clientHost)) {
    console.warn(
      [
        `[config] CLIENT_URL is "${cfg.CLIENT_URL}" in production.`,
        '         CORS will block your deployed frontend, and links in outgoing',
        '         emails will point at localhost. Set it to the deployed app',
        '         origin, with no trailing slash.',
      ].join('\n')
    );
  } else if (!cfg.CROSS_SITE_COOKIES) {
    // The frontend is on a real domain but cookies are same-site.
    //
    // A SameSite=Lax cookie is NOT sent on a cross-site POST, so with the app on
    // vercel.app and this API on onrender.com, POST /auth/refresh arrives with
    // no refresh cookie. Login appears to work, then the user is signed out the
    // moment their access token expires — which reads as broken auth rather than
    // as a cookie policy.
    console.warn(
      [
        `[config] CLIENT_URL is "${cfg.CLIENT_URL}" but CROSS_SITE_COOKIES=false.`,
        '         If the app and this API are on DIFFERENT domains, the refresh',
        '         cookie will not be sent and users will be signed out as soon as',
        '         their access token expires. Set CROSS_SITE_COOKIES=true.',
        '         Ignore this only if both are served from the same domain.',
      ].join('\n')
    );
  }

  // SameSite=None requires Secure, which browsers only honour over https.
  if (cfg.CROSS_SITE_COOKIES && !String(cfg.CLIENT_URL).startsWith('https://')) {
    console.warn(
      [
        '[config] CROSS_SITE_COOKIES=true sends SameSite=None; Secure, which',
        `         browsers accept only over https. CLIENT_URL is "${cfg.CLIENT_URL}".`,
      ].join('\n')
    );
  }

  if (cfg.ALLOW_VERCEL_PREVIEWS) {
    console.warn(
      [
        '[config] ALLOW_VERCEL_PREVIEWS=true trusts EVERY *.vercel.app origin,',
        "         including other people's projects. Fine while iterating; turn",
        '         it off once the production domain is settled.',
      ].join('\n')
    );
  }
}
