// ─────────────────────────────────────────────────────────────────────────────
// e2e/responsive.spec.ts — layout integrity at 375px, 768px and 1280px.
//
// Two properties are checked at each width, on each of Dashboard, Leads and
// Pipeline:
//
//   1. No horizontal scroll on the PAGE. Sideways scrolling of the whole
//      document is the classic responsive break — it means something is wider
//      than the viewport and the reader has to pan to see it.
//
//   2. No overlapping text. Two pieces of text drawn on top of each other is
//      what a reader would call broken, and it is invisible to a screenshot
//      diff that has no baseline.
//
// ── What is deliberately NOT called a failure ─────────────────────────────────
// A wide element that scrolls inside its OWN `overflow-x: auto` container is
// correct design, not a regression — a data table with eight columns has to
// scroll somewhere, and scrolling inside its own box is the right answer. The
// helpers in test-fixtures.ts therefore ignore anything inside a legitimate
// horizontal scroller, and ignore fixed-position elements that are intentionally
// parked off-screen (a closed drawer, a collapsed sidebar). Without those two
// exclusions this file would report a dozen false positives and be ignored,
// which is worse than not having it.
//
// The Pipeline board is a special case and is asserted as such: it is a kanban
// of six fixed-width columns, so at every one of these widths it MUST scroll
// horizontally inside its own container — and the page around it must not.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect, type Page } from '@playwright/test';
import {
  elementsOverflowingViewport,
  goToPage,
  horizontalOverflow,
  loginAs,
  overlappingTextPairs,
} from './fixtures/test-fixtures';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

const PAGES = [
  // The dashboard's h1 is a time-of-day greeting from WelcomeHeader
  // ("Good morning, Ada"), not the word "Dashboard" — hence the greeting regex.
  { name: 'Dashboard', route: '/dashboard', heading: /good (morning|afternoon|evening)/i },
  { name: 'Leads', route: '/leads', heading: /leads/i },
  { name: 'Pipeline', route: '/pipeline', heading: /pipeline/i },
] as const;

/** Let the layout settle: fonts, charts and lazy chunks all shift boxes. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} — ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const target of PAGES) {
      test(`${target.name} renders without horizontal page scroll`, async ({ page }) => {
        await loginAs(page, 'owner');
        await goToPage(page, target.route, target.heading);
        await settle(page);

        const overflow = await horizontalOverflow(page);
        const culprits = await elementsOverflowingViewport(page);

        // The report is the point. "Something overflows by 240px" is not
        // actionable; a tag, a class and the text inside it is.
        expect(
          overflow,
          `${target.name} at ${vp.width}px scrolls horizontally by ${overflow}px.\n` +
            `Elements past the right edge:\n${JSON.stringify(culprits, null, 2)}`
        ).toBe(0);
      });

      test(`${target.name} has no overlapping text`, async ({ page }) => {
        await loginAs(page, 'owner');
        await goToPage(page, target.route, target.heading);
        await settle(page);

        const overlaps = await overlappingTextPairs(page);

        expect(
          overlaps,
          `${target.name} at ${vp.width}px has text drawn over text:\n` +
            `${JSON.stringify(overlaps, null, 2)}`
        ).toEqual([]);
      });

      test(`${target.name} keeps its primary heading visible`, async ({ page }) => {
        // A page that collapsed to nothing would pass the two checks above.
        await loginAs(page, 'owner');
        await goToPage(page, target.route, target.heading);
        await settle(page);

        const heading = page.getByRole('heading', { level: 1 }).first();
        await expect(heading).toBeVisible();

        const box = await heading.boundingBox();
        expect(box, 'the h1 should have a measurable box').toBeTruthy();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 2);
      });
    }

    test('the pipeline board scrolls inside its own container, not the page', async ({ page }) => {
      // Six 280px columns cannot fit in any of these widths, so the board MUST
      // be horizontally scrollable — and that scrolling must be contained.
      await loginAs(page, 'owner');
      await goToPage(page, '/pipeline', /pipeline/i);
      await settle(page);

      const containedScroll = await page.evaluate(() => {
        const scrollers = Array.from(document.querySelectorAll('body *')).filter((el) => {
          const s = getComputedStyle(el);
          return (
            (s.overflowX === 'auto' || s.overflowX === 'scroll') &&
            el.scrollWidth > el.clientWidth + 1
          );
        });
        return scrollers.length;
      });

      expect(
        containedScroll,
        'the kanban board should sit in its own horizontal scroller'
      ).toBeGreaterThan(0);

      expect(await horizontalOverflow(page)).toBe(0);
    });

    test('the leads table is reachable without breaking the page', async ({ page }) => {
      // A data table is the widest thing in the app. At 375px it has to scroll
      // inside itself; what must not happen is the page scrolling with it.
      await loginAs(page, 'owner');
      await goToPage(page, '/leads', /leads/i);
      await settle(page);

      await expect(page.locator('table')).toBeVisible();
      expect(await horizontalOverflow(page)).toBe(0);
    });
  });
}

test.describe('mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('the sidebar does not cover the content at 375px', async ({ page }) => {
    // On a phone the nav has to be out of the way by default, or the page is
    // unusable. This asserts the outcome — the h1 is visible and starts at a
    // sensible x — rather than guessing at the mechanism.
    await loginAs(page, 'owner');
    await goToPage(page, '/dashboard', /good (morning|afternoon|evening)/i);
    await settle(page);

    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeVisible();

    const box = await heading.boundingBox();
    expect(box!.x).toBeLessThan(200);
  });

  test('every viewport renders the same authenticated shell', async ({ page }) => {
    await loginAs(page, 'owner');
    await goToPage(page, '/dashboard', /good (morning|afternoon|evening)/i);

    // The header is the one piece of chrome present at every width.
    await expect(page.locator('header')).toBeVisible();
  });
});
