// ─────────────────────────────────────────────────────────────────────────────
// e2e/fixtures/test-fixtures.ts — shared helpers and page objects.
//
// Everything specs need in common lives here: the seeded credentials, a real
// UI login, unique record names, and the handful of selectors that have to be
// coupled to markup because the app exposes no test ids.
//
// ── On unique names ───────────────────────────────────────────────────────────
// All specs share ONE API process and ONE database — the stack is started once
// in global-setup.ts. Rather than truncating the database between tests (which
// would fight with Playwright's parallelism model and delete the seeded users),
// every record a test creates is given a name unique to that test run. Every
// assertion then targets that name, so a shared database never makes a result
// ambiguous and tests cannot see each other's leftovers.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

const ARTIFACTS = path.resolve(__dirname, '..', '.artifacts');

export interface SeededUser {
  id: string;
  email: string;
  password: string;
  role: Role;
  firstName: string;
  lastName: string;
}

export type Role = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export interface E2EState {
  organization: { id: string; name: string; slug: string };
  rivalOrganization: { id: string; name: string };
  users: Record<Role, SeededUser>;
  password: string;
  apiPort: number;
  proxyPort: number;
  webPort: number;
  apiBaseUrl: string;
  backendLog: string;
}

/** Whatever global-setup.ts recorded about the running stack. */
export function state(): E2EState {
  const file = path.join(ARTIFACTS, 'state.json');
  if (!fs.existsSync(file)) {
    throw new Error(
      `${file} is missing — the Playwright globalSetup did not run. ` +
        'Run the suite with `npx playwright test`, not by importing a spec directly.'
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The API origin the browser talks to (the rate-limit proxy). */
export const apiBase = () => state().apiBaseUrl;

/** A string unique to this moment, for naming records. */
let seq = 0;
export function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}${seq}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Authentication
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sign in through the real login form and wait for the dashboard.
 *
 * Deliberately NOT a storageState shortcut. The app keeps its auth snapshot in
 * sessionStorage (which Playwright's storageState does not capture) alongside an
 * httpOnly refresh cookie, so a saved-state fixture would be reconstructing half
 * the session by hand and quietly diverging from what a real sign-in produces.
 * Driving the form is both simpler and the thing worth testing.
 */
export async function loginAs(page: Page, role: Role): Promise<SeededUser> {
  const user = state().users[role];

  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The redirect target is the dashboard; waiting on the URL rather than on a
  // spinner keeps this from racing the lazy route chunk.
  await page.waitForURL(/\/dashboard(\?.*)?$/, { timeout: 45_000 });
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  return user;
}

/** Sign out by clearing the client session and reloading. */
export async function resetSession(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.evaluate(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* a fresh context can refuse storage access; nothing to clear anyway */
    }
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// Navigation
// ═════════════════════════════════════════════════════════════════════════════

/** Go to an in-app route and wait for the lazy chunk to paint. */
export async function goToPage(page: Page, route: string, heading: RegExp | string) {
  await page.goto(route);
  await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
    timeout: 45_000,
  });
}

/**
 * Reload the page without tripping the refresh-token collision.
 *
 * Every full page load re-bootstraps the session with POST /auth/refresh. Two of
 * those inside the same wall-clock second are issued identical refresh tokens
 * (the JWT payload is just `{ sub }` plus a one-second-resolution `iat`), their
 * stored hashes collide, and the second one 401s — which signs the user out and
 * drops the test on the login page.
 *
 * That defect is real and pinned from both sides:
 *   · backend/tests/auth.test.js — "KNOWN GAP: refresh token uniqueness"
 *   · e2e/auth.spec.ts — "rapid full-page navigation signs the user out"
 *
 * This pause is the workaround that keeps unrelated assertions measuring what
 * they are meant to measure. Remove it once a `jti` is added to the refresh
 * payload.
 */
export async function reloadSafely(page: Page) {
  await page.waitForTimeout(1_200);
  await page.reload();
}

// ═════════════════════════════════════════════════════════════════════════════
// Leads
// ═════════════════════════════════════════════════════════════════════════════

export const leadsPage = (page: Page) => ({
  // .first() is required, not defensive: there can be up to three "Add Lead"
  // buttons on screen — one in the global TopNavbar, one in the page toolbar, and
  // one in the empty-state prompt — so a bare getByRole is a strict-mode
  // violation. The scoped locators below exist because those three are gated
  // differently, and telling them apart is the whole point of the RBAC UI spec.
  addButton: () => page.getByRole('button', { name: 'Add Lead' }).first(),

  /** The "Add Lead" button in the global header. Rendered for EVERY role. */
  navbarAddButton: () => page.locator('header').getByRole('button', { name: 'Add Lead' }),

  /** The "Add Lead" button(s) inside the page body — correctly permission-gated. */
  pageAddButtons: () => page.locator('main').getByRole('button', { name: 'Add Lead' }),
  drawer: () => page.getByRole('dialog', { name: 'Add new lead' }),
  table: () => page.locator('table'),
  searchBox: () => page.getByPlaceholder(/search/i).first(),

  /** Fill and submit the Add Lead drawer. */
  async addLead(fields: {
    firstName: string;
    lastName: string;
    email?: string;
    company?: string;
    value?: string;
  }) {
    await page.getByRole('button', { name: 'Add Lead' }).first().click();

    const drawer = page.getByRole('dialog', { name: 'Add new lead' });
    await expect(drawer).toBeVisible();

    await drawer.locator('#firstName').fill(fields.firstName);
    await drawer.locator('#lastName').fill(fields.lastName);
    if (fields.email) await drawer.locator('#email').fill(fields.email);
    if (fields.company) await drawer.locator('#company').fill(fields.company);
    if (fields.value) await drawer.locator('#value').fill(fields.value);

    await drawer.getByRole('button', { name: 'Add lead' }).click();
    await expect(drawer).toBeHidden({ timeout: 30_000 });
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// Pipeline
// ═════════════════════════════════════════════════════════════════════════════

/** Column order as rendered by PipelinePage's STAGES array. */
export const STAGES = [
  'Lead',
  'Qualified',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
] as const;

export type Stage = (typeof STAGES)[number];

export const pipelinePage = (page: Page) => ({
  /**
   * A stage column's droppable region.
   *
   * Located by Tailwind class rather than by an accessible name because the drop
   * zone is a bare div — PipelinePage attaches dnd-kit's setNodeRef to it and
   * gives it no role or label. Index maps to the STAGES order above. This is the
   * one selector in the suite genuinely coupled to styling, so it is kept in a
   * single place: if the board markup changes, only this line moves.
   */
  dropZone(stage: Stage): Locator {
    return page.locator('div.min-h-\\[420px\\]').nth(STAGES.indexOf(stage));
  },

  /** The drag handle on a card, which carries a real aria-label. */
  dragHandle(dealTitle: string): Locator {
    return page.getByRole('button', { name: `Drag ${dealTitle} to another stage` });
  },

  card(dealTitle: string): Locator {
    return page.getByText(dealTitle, { exact: true }).first();
  },

  /** Create a deal via the column's "+" button and the New deal dialog. */
  async addDeal(stage: Stage, title: string, value: string) {
    await page.getByRole('button', { name: `Add deal to ${stage}` }).click();

    const dialog = page.getByRole('dialog', { name: 'New deal' });
    await expect(dialog).toBeVisible();

    await dialog.locator('#deal-title').fill(title);
    await dialog.locator('#deal-value').fill(value);
    await dialog.getByRole('button', { name: 'Create deal' }).click();

    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  },

  /**
   * Drag a card into another stage column.
   *
   * dnd-kit uses a PointerSensor with `activationConstraint: { distance: 5 }`,
   * so a single jump from source to target does NOT start a drag — the sensor
   * needs a pointermove that crosses the threshold while the pointer is down,
   * and the collision detector needs further moves over the target before the
   * drop registers. Hence the deliberate sequence: press, nudge past the
   * threshold, travel in steps, settle on the target, release.
   */
  async dragCardToStage(dealTitle: string, stage: Stage) {
    const handle = this.dragHandle(dealTitle);
    await expect(handle).toBeVisible();

    const target = this.dropZone(stage);
    await expect(target).toBeVisible();

    // toBeVisible() is satisfied by an element that is rendered but scrolled out
    // of view, and the board is a horizontal scroller ~1760px wide — so the Won
    // and Lost columns sit off-screen at common viewport widths. Measuring
    // without scrolling first yields coordinates outside the viewport and the
    // drag silently goes nowhere. The specs that drive drags also widen the
    // viewport so source and target can be on screen together.
    await target.scrollIntoViewIfNeeded();
    await handle.scrollIntoViewIfNeeded();

    const from = await handle.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error(`Could not measure drag from "${dealTitle}" to ${stage}`);

    const startX = from.x + from.width / 2;
    const startY = from.y + from.height / 2;
    // Aim near the top of the column so the drop lands inside the zone even
    // once cards already occupy it.
    const endX = to.x + to.width / 2;
    const endY = to.y + 60;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Cross the 5px activation threshold first, as its own move.
    await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
    await page.mouse.move(endX, endY, { steps: 20 });
    // A second settle move on the target: dnd-kit resolves the droppable from
    // the latest pointer position, and a release immediately after a long travel
    // can land before collision detection has run.
    await page.mouse.move(endX, endY + 6, { steps: 4 });
    await page.mouse.up();
  },
});

// ═════════════════════════════════════════════════════════════════════════════
// Backend log reader — the only channel for an email verification token
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Pull a fresh email-verification token out of the API's stdout.
 *
 * Verification tokens are stored SHA-256 hashed, so the value a user clicks
 * cannot be read back out of the database. With no SMTP configured the API
 * prints its EMAIL DEBUG block — including the raw token — to stdout, which
 * global-setup.ts tees to a file. Reading it there is the honest equivalent of
 * opening the email, and it lets the spec drive the REAL /verify-email route
 * instead of flipping a flag in Mongo.
 */
export async function verificationTokenFor(email: string, timeoutMs = 30_000): Promise<string> {
  const logPath = state().backendLog;
  const deadline = Date.now() + timeoutMs;
  const wanted = email.toLowerCase();

  while (Date.now() < deadline) {
    if (fs.existsSync(logPath)) {
      const log = fs.readFileSync(logPath, 'utf8');

      // Blocks look like:
      //   Recipient : someone@example.com
      //   ...
      //   Token     : <64 hex chars>
      // Scan from the end so a re-registration finds the newest token.
      const blocks = log.split('================ EMAIL DEBUG ================').reverse();

      for (const block of blocks) {
        if (!block.toLowerCase().includes(wanted)) continue;
        const match = block.match(/Token\s*:\s*([a-f0-9]{32,})/i);
        if (match) return match[1];
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(
    `No verification token for ${email} appeared in ${logPath} within ${timeoutMs}ms.`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Layout assertions, used by the responsive spec
// ═════════════════════════════════════════════════════════════════════════════

/** Horizontal overflow of the document, in px. Zero means no sideways scroll. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return Math.max(0, el.scrollWidth - el.clientWidth);
  });
}

/**
 * Elements whose box extends past the right edge of the viewport.
 *
 * Reported with enough detail to act on — a bare "something overflows" is not a
 * bug report. Elements inside a deliberately scrollable container are excluded,
 * because a wide table that scrolls inside `overflow-x: auto` is correct design,
 * not a regression.
 */
export async function elementsOverflowingViewport(page: Page): Promise<
  Array<{ tag: string; cls: string; right: number; text: string }>
> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const out: Array<{ tag: string; cls: string; right: number; text: string }> = [];

    const scrollsHorizontally = (el: Element) => {
      const style = getComputedStyle(el);
      return (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        el.scrollWidth > el.clientWidth + 1
      );
    };

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      // Fixed elements that are intentionally off-screen (closed drawers,
      // sidebars translated out of view) are not overflow.
      if (style.position === 'fixed') continue;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      // Inside a legitimate horizontal scroller? Not a layout break.
      let ancestor: Element | null = el.parentElement;
      let inScroller = false;
      while (ancestor && ancestor !== document.body) {
        if (scrollsHorizontally(ancestor)) {
          inScroller = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (inScroller) continue;

      // 2px of tolerance for sub-pixel rounding and ring/shadow outsets.
      if (rect.right > vw + 2) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: String((el as HTMLElement).className || '').slice(0, 120),
          right: Math.round(rect.right),
          text: (el.textContent || '').trim().slice(0, 60),
        });
      }
    }

    return out;
  });
}

/**
 * Pairs of visible, non-nested elements whose boxes intersect.
 *
 * Restricted to text-bearing leaf elements and to a meaningful overlap area,
 * because "boxes intersect" is normal for the vast majority of the DOM —
 * positioned decoration, backgrounds, icons inside buttons. What this looks for
 * is two pieces of TEXT sitting on top of each other, which is what a reader
 * would call broken.
 */
export async function overlappingTextPairs(page: Page): Promise<
  Array<{ a: string; b: string; overlap: number }>
> {
  return page.evaluate(() => {
    const isLeafText = (el: Element) =>
      el.children.length === 0 && (el.textContent || '').trim().length > 2;

    const nodes = Array.from(document.querySelectorAll('body *'))
      .filter(isLeafText)
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.1) {
          return false;
        }
        // Absolutely/fixed positioned text is often a deliberate overlay
        // (badges, tooltips), so it is out of scope for this check.
        return s.position === 'static' || s.position === 'relative';
      })
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 4 && rect.height > 4);

    const label = (el: Element) =>
      `${el.tagName.toLowerCase()}"${(el.textContent || '').trim().slice(0, 30)}"`;

    const out: Array<{ a: string; b: string; overlap: number }> = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i];
        const B = nodes[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;

        const x = Math.min(A.rect.right, B.rect.right) - Math.max(A.rect.left, B.rect.left);
        const y = Math.min(A.rect.bottom, B.rect.bottom) - Math.max(A.rect.top, B.rect.top);
        if (x <= 2 || y <= 2) continue;

        const area = x * y;
        const smaller = Math.min(A.rect.width * A.rect.height, B.rect.width * B.rect.height);
        // More than a third of the smaller element buried under the other.
        if (area > smaller * 0.34) {
          out.push({ a: label(A.el), b: label(B.el), overlap: Math.round(area) });
        }
      }
    }

    return out.slice(0, 12);
  });
}
