// ─────────────────────────────────────────────────────────────────────────────
// src/services/api/apiBaseUrl.ts
// Resolves — and validates — the API origin.
//
// VITE_* variables are read at BUILD time, not run time. Vercel bakes them into
// the bundle during `npm run build`, so a variable added in the dashboard after
// a deploy does nothing until you redeploy. That single fact causes most
// first-deploy confusion, so the checks below run once at module load and say
// out loud what is wrong instead of letting requests fail opaquely.
//
// The dev fallback to localhost is deliberate and stays. What must NOT survive
// into a production bundle is that same fallback, because `localhost:5000` in a
// deployed app resolves to the VISITOR'S OWN MACHINE — every request fails with
// ERR_CONNECTION_REFUSED and nothing in the browser hints that a build variable
// was missing on the server that built it.
// ─────────────────────────────────────────────────────────────────────────────

const DEV_FALLBACK = 'http://localhost:5000/api';

/**
 * Report a fatal misconfiguration and stop.
 *
 * This module is imported before React mounts, so a bare `throw` here produces a
 * blank white page and ErrorBoundary never sees it — the only clue is in the
 * console, which is exactly where a deployment problem is least likely to be
 * looked for. Paint the reason into the page first, then throw.
 */
function fatalConfig(message: string): never {
  if (typeof document !== 'undefined') {
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;padding:24px;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;' +
      'white-space:pre-wrap;color:#b91c1c;background:#fef2f2;min-height:100vh';
    pre.textContent = ['Configuration error', '', message].join('\n');
    // Replace rather than append: whatever is in #root is a half-built app.
    const mount = document.getElementById('root') ?? document.body;
    mount.replaceChildren(pre);
  }
  throw new Error(message);
}

function resolve(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configured) {
    if (import.meta.env.PROD) {
      // Fatal, not a warning: without a base URL every request in the app is
      // meaningless, so failing once at load beats one opaque failure per call.
      fatalConfig(
        'VITE_API_BASE_URL is not set in this build. Set it in Vercel → ' +
          'Project → Settings → Environment Variables (e.g. ' +
          'https://your-api.onrender.com/api), then REDEPLOY — Vite inlines ' +
          'this value at build time, so saving the variable alone changes nothing.'
      );
    }
    return DEV_FALLBACK;
  }

  if (import.meta.env.PROD && /localhost|127\.0\.0\.1/i.test(configured)) {
    fatalConfig(
      `VITE_API_BASE_URL is "${configured}" in a production build. localhost ` +
        "resolves to each visitor's own machine, not your server. Point it at " +
        'the deployed API origin and redeploy.'
    );
  }

  // Mixed content: a browser on an https:// page silently blocks http://
  // subresource requests. The network tab shows the request as blocked with no
  // server involvement, which reads like the API being down.
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    configured.startsWith('http://')
  ) {
    console.error(
      `[api] VITE_API_BASE_URL is "${configured}" (http) but this page is ` +
        'https. The browser will block every API call as mixed content. Use an ' +
        'https URL for the API.'
    );
  }

  // The API pointed at the app's OWN origin.
  //
  // This is the mistake that costs the most time, because it does not look like
  // a mistake: the URL is https, it is a real domain, and something answers. But
  // Vercel serves a static bundle here and vercel.json rewrites every unmatched
  // path to /index.html, so (measured against a live deployment):
  //
  //   GET  /api/leads      -> 200 text/html   the SPA shell, not JSON
  //   POST /api/auth/login -> 405             static hosts refuse POST
  //
  // Neither response mentions configuration, and 405 in particular sends people
  // hunting through route definitions that are fine.
  //
  // The API is a separate Express service and must live on its own origin.
  if (typeof window !== 'undefined') {
    // Parse inside the try, DECIDE outside it.
    //
    // The first version of this check wrapped everything — including the
    // fatalConfig() call — in the try/catch, so the catch swallowed the very
    // error it existed to raise. The failure mode was subtle and worth
    // remembering: the red panel was painted, the throw was eaten, execution
    // continued to the return below, React mounted over the warning, and the
    // only surviving symptom was a 405 from POSTing at a static host. Nothing
    // in the console mentioned configuration at all.
    //
    // Rule of thumb: a catch must never span the throw it is protecting.
    let isOwnOrigin = false;
    try {
      isOwnOrigin =
        new URL(configured, window.location.href).origin === window.location.origin;
    } catch {
      // Unparseable URL — the checks above already cover that case.
      isOwnOrigin = false;
    }

    if (isOwnOrigin) {
      fatalConfig(
        `VITE_API_BASE_URL is "${configured}", which is this app's own origin ` +
          `(${window.location.origin}).\n\n` +
          'Nothing serves the API here — Vercel hosts the static frontend, and ' +
          'vercel.json rewrites unknown paths to index.html, so GET /api/* returns ' +
          'the HTML page and POST /api/* returns 405 Method Not Allowed.\n\n' +
          'Deploy the Express backend separately (Render, Railway, Fly) and set ' +
          'VITE_API_BASE_URL to THAT origin, ending in /api — then redeploy.'
      );
    }
  }

  // A trailing slash turns axios paths into `//auth/login` on some servers.
  return configured.replace(/\/+$/, '');
}

/** Validated API base URL, including the `/api` suffix. */
export const API_BASE_URL = resolve();

/** Server origin without the `/api` suffix — for /health and other root paths. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');
