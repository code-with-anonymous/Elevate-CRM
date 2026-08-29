# Testing — ElevateCRM

Two suites, run independently.

| Suite | Where | Runner | Command |
| --- | --- | --- | --- |
| Backend API | `backend/tests/` | Jest + Supertest + mongodb-memory-server | `cd backend && npm test` |
| Frontend E2E | `e2e/` | Playwright (Chromium) | `npx playwright test` |

Neither suite touches a real database or sends real email. Both spin up their own
in-memory MongoDB and blank the SMTP and Gemini credentials before the app loads.

---

## Backend

```bash
cd backend
npm test                    # all suites
npm test -- --coverage      # with coverage
npm test -- multitenancy    # one file
npm test -- --silent        # quieter (suppresses the app's own console output)
```

### What is where

| File | Covers |
| --- | --- |
| `tests/multitenancy.test.js` | **Organization isolation.** The largest file in the suite. Every CRM resource, every role, every route — read, write, delete, list, count, search, filter, paginate, plus the aggregate endpoints and the token claim itself. |
| `tests/rbac.test.js` | Role guards, driven as a route × role matrix so a new guarded route is one line. Plus the target-level rules in `team.controller` (owner protection, no acting at or above your own level). |
| `tests/auth.test.js` | Register, verify, login, 2FA, refresh rotation, logout, password reset and change, sessions. |
| `tests/security.test.js` | NoSQL/SQL injection, XSS storage, rate limiting, JWT handling, information disclosure, payload limits. |
| `tests/leads.test.js` `deals.test.js` `tasks.test.js` | CRUD, validation, enums, pagination, search and filtering per resource. |

### How the harness works

- `tests/globalSetup.js` starts **one** `mongodb-memory-server` for the whole run.
  Each Jest worker connects to it with its own database name.
- `tests/setup/testEnv.js` runs before any application module is required, because
  `config/env.js` throws at import time if its secrets are missing.
  **Sensitive variables are set to `''`, never deleted** — `app.js` calls
  `dotenv.config()`, and dotenv fills in any key that is *missing* while skipping
  one that is already present. Deleting `SMTP_HOST` handed the real
  `backend/.env` credentials to the test run, and the first version of this suite
  opened an authenticated session to the live Brevo SMTP server.
  `tests/setup/afterEnv.js` asserts this has not regressed and refuses to run if
  real credentials are visible.
- `tests/setup/afterEnv.js` wipes collections after each test (wipe, not drop —
  dropping would remove the unique index on `User.email` that several
  duplicate-key assertions depend on) and **resets the rate limiters**. The
  limiters are per-IP module singletons and every request comes from loopback, so
  without that reset the suite starts 429-ing partway through and every later
  failure is a phantom.
- `tests/helpers/factory.js` builds tenants, users at every role, and records.
  Access tokens are minted with the same payload shape `auth.service` produces.
- `tests/helpers/mailbox.js` spies on the email service to capture verification,
  reset and invite tokens. Those are stored SHA-256 hashed, so the argument to the
  mailer is the only place the raw value exists — this is not a shortcut around
  the product, it is the product's only channel for them.

### `it.failing` — known defects

Some tests use `it.failing`, which **passes while the body throws** and **fails
once the body starts passing**. Each one is both a record of a confirmed defect
and the regression guard that tells you a fix landed. When one goes red, delete
the `.failing` and keep the assertion.

They are grouped in `describe('KNOWN GAP: …')` blocks with the mechanism written
out. See `AUDIT.md` for the findings.

---

## Frontend E2E

```bash
npx playwright test                       # all specs
npx playwright test --reporter=html       # HTML report -> playwright-report/
npx playwright show-report                # open the last report
npx playwright test e2e/rbac-ui.spec.ts   # one spec
npx playwright test --headed --debug      # watch it run
```

First run only: `npx playwright install chromium`.

### What is where

| File | Covers |
| --- | --- |
| `e2e/auth.spec.ts` | Register → verify email (real token) → login → dashboard. Unverified login blocked, wrong password refused, route guards, session durability. |
| `e2e/lead-lifecycle.spec.ts` | The core loop: lead → deal → Won → contact, including the pipeline drag. |
| `e2e/rbac-ui.spec.ts` | What each of the five roles can see and reach. |
| `e2e/responsive.spec.ts` | Layout integrity at 375 / 768 / 1280 px on Dashboard, Leads and Pipeline. |
| `e2e/smoke.spec.ts` | A harness sanity check: the API answers and login works. |

### How the harness works

`e2e/global-setup.ts` starts four processes, in order, and tears them all down
afterwards:

1. **mongodb-memory-server** — the URI carries the database name, so the seed and
   the API cannot end up in different databases.
2. **The Express API** on `:5100`, seeded by `e2e/seed.cjs` with one organization
   holding a user at every role (`owner@e2e.test` … `viewer@e2e.test`, password
   `Password123`) plus a second "Rival Org" so isolation is observable.
3. **`e2e/rate-limit-proxy.cjs`** on `:5101` — a transparent reverse proxy that
   gives every request a distinct `X-Forwarded-For`. Read that file before
   changing it; the short version is that the API's rate limits (5 logins per 15
   minutes, 100 requests per 15 minutes, per IP) would otherwise fail the run,
   and the header has to be injected server-side because `config/cors.js` allows
   only `Content-Type` and `Authorization` from the browser.
   **Rate limiting is therefore effectively off inside E2E** — it is tested
   directly, including the fact that `X-Forwarded-For` cannot bypass it in the
   shipping configuration, in `backend/tests/security.test.js`.
4. **The Vite dev server** on `:5174`, via `frontend/vite.e2e.config.ts` (a new
   test-support file, not an edit to the app's own config). A *dev* server is
   required: `apiBaseUrl.ts` treats a localhost API in a production bundle as a
   fatal misconfiguration, correctly.

Notes worth knowing before editing specs:

- **`workers: 1`.** All specs share one API and one database. Records are also
  named uniquely per test (`unique()`), so a shared database never makes an
  assertion ambiguous.
- **Login is driven through the form**, not restored from `storageState`. The app
  keeps its auth snapshot in `sessionStorage`, which `storageState` does not
  capture, so a saved-state fixture would be reconstructing half a session by
  hand.
- **Drag and drop** uses real pointer events in a deliberate sequence (press,
  cross the 5px activation threshold, travel, settle, release), because dnd-kit's
  `PointerSensor` ignores a single jump. The specs that drag also widen the
  viewport to 1920px, since the board is ~1760px wide and the Won column is
  otherwise off-screen.
- **`test.fail()`** marks a known defect: it passes while the assertion fails and
  fails once it is fixed. Same convention as `it.failing` on the backend.

### Artifacts

Everything lands under `e2e/.artifacts/` — `backend.log`, `frontend.log`,
`proxy.log`, `seed.json`, `state.json`, and per-test traces, screenshots and
videos on failure. `backend.log` is also how `auth.spec.ts` reads the email
verification token.
