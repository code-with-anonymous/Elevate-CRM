// ─────────────────────────────────────────────────────────────────────────────
// e2e/rate-limit-proxy.cjs — a transparent reverse proxy in front of the E2E API
// that gives every request a distinct client IP.
//
// ── Why this exists ───────────────────────────────────────────────────────────
// The API rate-limits POST /auth/login to 5 attempts per 15 minutes and all of
// /api to 100 requests per 15 minutes, bucketed per client IP. A full E2E run is
// several hundred requests from one machine, so without this the suite starts
// 429-ing partway through and every later failure is a phantom rather than a
// finding.
//
// ── Why a separate process rather than the Vite dev proxy ─────────────────────
// The obvious approach — serve /api from the app's own origin through Vite's
// proxy — is refused by the application, correctly. apiBaseUrl.ts treats an API
// URL that resolves to the app's own origin as a fatal misconfiguration, because
// on Vercel that means the static host is answering /api with index.html. So the
// API has to be on a different origin, which puts it back behind CORS, and
// config/cors.js allows only Content-Type and Authorization as request headers —
// a browser-set X-Forwarded-For would fail preflight.
//
// Injecting the header HERE, server-side, sidesteps both problems: the browser
// never sends it, and the backend (spawned with TRUST_PROXY=true, exactly as it
// runs on Render) reads it as the client address.
//
// ── What this trades away, stated plainly ─────────────────────────────────────
// Rate limiting is effectively OFF inside the E2E environment. That behaviour is
// not going untested: backend/tests/security.test.js drives each limiter to its
// 429 and separately asserts that X-Forwarded-For CANNOT be used to escape the
// bucket when trust-proxy is off, which is the configuration that ships.
//
// A different port is deliberately used for the app and the API so the browser
// sees two origins. Cookies ignore the port, so localhost:5174 and localhost:5101
// remain SAME-SITE and the SameSite=Lax refresh cookie is still sent.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const http = require('node:http');

const PORT = Number(process.env.PROXY_PORT || 5101);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.TARGET_PORT || 5100);

let counter = 0;

/**
 * A distinct address per request, drawn from 198.51.100.0/24 — a range reserved
 * by RFC 5737 for documentation, so it can never collide with anything real.
 * Widened across the third octet because a run makes more than 254 requests.
 */
function nextClientIp() {
  counter += 1;
  const third = Math.floor(counter / 254) % 256;
  const fourth = (counter % 254) + 1;
  return `198.51.${third}.${fourth}`;
}

const server = http.createServer((req, res) => {
  const headers = { ...req.headers };

  // Set, never append. express-rate-limit with `trust proxy: 1` reads the
  // LAST-but-one hop, so a list here would not do what it looks like it does.
  headers['x-forwarded-for'] = nextClientIp();
  headers['x-forwarded-proto'] = 'http';
  headers.host = `${TARGET_HOST}:${TARGET_PORT}`;

  const upstream = http.request(
    { host: TARGET_HOST, port: TARGET_PORT, method: req.method, path: req.url, headers },
    (upstreamRes) => {
      // Headers pass through verbatim, which is what keeps CORS and
      // Set-Cookie working exactly as the backend intended.
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
    }
    res.end(JSON.stringify({ success: false, message: `proxy error: ${err.message}` }));
  });

  req.pipe(upstream);
});

// No host argument, so Node binds dual-stack (:: plus 0.0.0.0). Binding
// '127.0.0.1' explicitly looks tighter but breaks on Windows, where `localhost`
// resolves to ::1 first — the browser and the setup health check both then get
// ECONNREFUSED against an IPv4-only listener.
server.listen(PORT, () => {
  console.log(`[proxy] :${PORT} -> ${TARGET_HOST}:${TARGET_PORT} (rotating X-Forwarded-For)`);
});
