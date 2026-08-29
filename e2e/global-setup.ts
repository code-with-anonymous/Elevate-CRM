// ─────────────────────────────────────────────────────────────────────────────
// e2e/global-setup.ts — bring up the whole stack for the Playwright run.
//
// Four processes, started in order:
//   1. mongodb-memory-server  — so the suite never touches a real database.
//   2. the Express API        — spawned against that in-memory Mongo.
//   3. a rate-limit proxy     — in front of the API, giving each request its own
//                               client IP so the login and general limiters do
//                               not fail the run. See e2e/rate-limit-proxy.cjs
//                               for what that trades away and where the limiters
//                               are actually tested.
//   4. the Vite dev server    — the app itself, on a separate origin.
//
// This does the orchestration itself rather than using Playwright's `webServer`
// option, because the API cannot start until the in-memory Mongo has a URI to
// hand it, and the seed has to land between the two. Doing it here keeps that
// ordering explicit instead of depending on how Playwright interleaves
// globalSetup with webServer startup.
//
// The API is spawned with a DEV build target on purpose: apiBaseUrl.ts treats a
// localhost API in a PRODUCTION bundle as a fatal misconfiguration (correctly —
// localhost there is the visitor's own machine), so an E2E run has to use the
// dev server.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');
const ARTIFACTS = path.join(__dirname, '.artifacts');

export const API_PORT = Number(process.env.E2E_API_PORT || 5100);
/** The origin the browser talks to: the proxy, not the API directly. */
export const PROXY_PORT = Number(process.env.E2E_PROXY_PORT || 5101);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5174);

const BACKEND_LOG = path.join(ARTIFACTS, 'backend.log');
const FRONTEND_LOG = path.join(ARTIFACTS, 'frontend.log');
const PROXY_LOG = path.join(ARTIFACTS, 'proxy.log');
const PIDS = path.join(ARTIFACTS, 'pids.json');

/** Poll a URL until it answers, or give up. */
async function waitForHttp(url: string, label: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (res.status < 500) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const log = label === 'API' ? BACKEND_LOG : label === 'Proxy' ? PROXY_LOG : FRONTEND_LOG;
  const tail = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-3000) : '(no log)';
  throw new Error(
    `${label} did not become ready at ${url} within ${timeoutMs}ms (${String(lastErr)}).\n` +
      `--- last of ${log} ---\n${tail}`
  );
}

/**
 * Environment for the spawned API.
 *
 * Every sensitive variable is set to '' rather than left absent. server.js calls
 * dotenv.config(), and dotenv fills in any key that is MISSING while skipping
 * one that is already present — so omitting SMTP_HOST here would hand the real
 * backend/.env credentials to the test run and mail real people. The backend
 * Jest suite hit exactly that, and this is the same guard.
 */
function apiEnv(mongoUri: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(API_PORT),
    MONGODB_URI: mongoUri,

    ACCESS_TOKEN_SECRET: 'e2e-access-secret',
    REFRESH_TOKEN_SECRET: 'e2e-refresh-secret',
    ACCESS_TOKEN_EXPIRES: '15m',
    REFRESH_TOKEN_EXPIRES: '7d',

    // Cheap hashing — the seed uses 4 rounds too, so logins stay fast.
    BCRYPT_ROUNDS: '4',

    // The app's origin, so config/cors.js whitelists it. The API answers on a
    // different PORT, but a port is not part of a cookie's site — so
    // localhost:5174 and localhost:5101 stay same-site and the SameSite=Lax
    // refresh cookie is still sent on POST /auth/refresh.
    CLIENT_URL: `http://localhost:${WEB_PORT}`,
    EXTRA_CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
    CROSS_SITE_COOKIES: '',

    // Trust the X-Forwarded-For that e2e/rate-limit-proxy.cjs injects — the same
    // setting the API runs with on Render. See that file for why it is needed and
    // what it deliberately trades away.
    TRUST_PROXY: 'true',

    // No outbound mail, no billed AI calls. Blanked, not deleted — see above.
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    EMAIL_FROM: 'e2e@example.test',
    GEMINI_API_KEY: '',

    DNS_SERVERS: '',
  };
}

function tee(child: ChildProcess, logPath: string) {
  const stream = fs.createWriteStream(logPath, { flags: 'w' });
  child.stdout?.pipe(stream);
  child.stderr?.pipe(stream);
}

export default async function globalSetup() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  // ── 1. In-memory MongoDB ───────────────────────────────────────────────────
  const mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });

  // The database name is baked into the URI rather than passed as a connect
  // option, so the seed and the API cannot end up in different databases.
  // config/db.js calls mongoose.connect(uri) with no dbName, so whatever is in
  // the URI path is what the API uses — and getUri() with no argument yields a
  // URI the driver resolves to "test", which is NOT where a seed using
  // { dbName: ... } would have written. That mismatch shows up as a perfectly
  // healthy API rejecting every seeded login with 401.
  const mongoUri = mongod.getUri('elevatecrm_e2e');

  // ── 2. Seed ────────────────────────────────────────────────────────────────
  const seed = spawnSync(process.execPath, [path.join(__dirname, 'seed.cjs')], {
    cwd: ROOT,
    env: { ...process.env, MONGODB_URI: mongoUri },
    encoding: 'utf8',
  });
  if (seed.status !== 0) {
    await mongod.stop();
    throw new Error(`Seeding failed:\n${seed.stdout}\n${seed.stderr}`);
  }
  process.stdout.write(seed.stdout);

  // ── 3. API ─────────────────────────────────────────────────────────────────
  const api = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND,
    env: apiEnv(mongoUri),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  tee(api, BACKEND_LOG);

  // ── 4. Rate-limit proxy ────────────────────────────────────────────────────
  const proxy = spawn(process.execPath, [path.join(__dirname, 'rate-limit-proxy.cjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PROXY_PORT: String(PROXY_PORT),
      TARGET_HOST: '127.0.0.1',
      TARGET_PORT: String(API_PORT),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  tee(proxy, PROXY_LOG);

  // ── 5. Web ─────────────────────────────────────────────────────────────────
  const web = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      'vite',
      '--config',
      path.join(FRONTEND, 'vite.e2e.config.ts'),
      '--port',
      String(WEB_PORT),
      '--strictPort',
    ],
    {
      cwd: FRONTEND,
      env: {
        ...process.env,
        // Stops the app config's `open: true` from launching a real browser.
        BROWSER: 'none',
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_PORT: String(WEB_PORT),
        // The PROXY origin, not the API's. A different port from the app, so
        // apiBaseUrl.ts does not see it as the app's own origin.
        VITE_API_BASE_URL: `http://localhost:${PROXY_PORT}/api`,
        VITE_ENABLE_DEVTOOLS: 'false',
        VITE_GOOGLE_CLIENT_ID: 'e2e-google-client-id-not-used',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    }
  );
  tee(web, FRONTEND_LOG);

  fs.writeFileSync(PIDS, JSON.stringify({ api: api.pid, proxy: proxy.pid, web: web.pid }));

  // Handles for globalTeardown — same Node process, so this survives.
  (globalThis as any).__E2E__ = { mongod, api, proxy, web };

  try {
    await waitForHttp(`http://127.0.0.1:${API_PORT}/health`, 'API');
    // Prove the proxy hop works before a single test runs — otherwise every spec
    // fails with an opaque network error instead of one clear setup failure. An
    // unauthenticated /api/leads answers 401, which is a fine sign of life.
    await waitForHttp(`http://localhost:${PROXY_PORT}/api/leads`, 'Proxy', 30_000);
    await waitForHttp(`http://localhost:${WEB_PORT}/`, 'Web');
  } catch (err) {
    await globalTeardownInner();
    throw err;
  }

  const state = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, 'seed.json'), 'utf8'));
  fs.writeFileSync(
    path.join(ARTIFACTS, 'state.json'),
    JSON.stringify(
      {
        ...state,
        apiPort: API_PORT,
        proxyPort: PROXY_PORT,
        webPort: WEB_PORT,
        apiBaseUrl: `http://localhost:${PROXY_PORT}/api`,
        backendLog: BACKEND_LOG,
      },
      null,
      2
    )
  );

  console.log(
    `[e2e] API :${API_PORT} -> proxy :${PROXY_PORT}, app :${WEB_PORT}, Mongo in memory.`
  );
}

/** Shared by globalTeardown and the failure path above. */
export async function globalTeardownInner() {
  const state = (globalThis as any).__E2E__ as
    | { mongod: MongoMemoryServer; api: ChildProcess; proxy: ChildProcess; web: ChildProcess }
    | undefined;

  const kill = (child?: ChildProcess) => {
    if (!child?.pid) return;
    if (process.platform === 'win32') {
      // A bare child.kill() leaves the vite process behind when it was started
      // through npx, because npx is the direct child and vite is its grandchild.
      // /T takes the whole tree.
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  };

  kill(state?.api);
  kill(state?.proxy);
  kill(state?.web);

  if (state?.mongod) {
    await state.mongod.stop().catch(() => {});
  }
}
