// ─────────────────────────────────────────────────────────────────────────────
// e2e/lead-lifecycle.spec.ts — the core product loop, end to end.
//
//   sign in → add a Lead in the drawer → see it in the Leads table
//           → create a Deal on the Pipeline board
//           → move it through the stages to Won
//           → find the Contact that Won produced
//
// ── What this spec found ──────────────────────────────────────────────────────
// Two steps of that loop are broken in the client, and both are pinned below
// with test.fail() so the suite stays green while the defects stay recorded:
//
//   · Dragging a deal to another stage NEVER PERSISTS. The card moves on screen,
//     no request is sent, and a reload puts it back. usePipelineDrag's onDragOver
//     writes the target stage into the React Query cache, then onDragEnd reads
//     that same (already-mutated) cache and early-returns on
//     `targetStage === original.stage`, so the mutation is never called.
//
//   · A newly added Lead does not appear in the table until a reload.
//     AddLeadDrawer declares its own useMutation and invalidates only the two
//     dashboard queries — never ['leads'] — and useLeadsList has a two-minute
//     staleTime, so the lead can stay invisible for minutes.
//
// So the loop cannot be walked by pointer alone. The first test below walks it
// with the stage move issued directly against the API, which keeps the whole
// chain under test and localises the defect to the drag handler rather than
// leaving the whole loop unverified.
//
// ── A structural note on the funnel ───────────────────────────────────────────
// The brief describes dragging "the lead" through the pipeline. In the app as
// built, the board holds DEALS: Lead and Deal are separate collections, and it is
// a DEAL reaching Won that auto-creates a Contact. A Lead set to Won creates
// nothing. The New Deal dialog also offers no way to link a Deal to a Lead — the
// API accepts a leadId, the form does not collect one — so the two halves of the
// funnel cannot be joined from the UI, and the Contact that Won produces is named
// after the deal rather than the person. Noted in the audit report.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect, type APIRequestContext } from '@playwright/test';
import {
  apiBase,
  goToPage,
  leadsPage,
  loginAs,
  pipelinePage,
  reloadSafely,
  state,
  unique,
} from './fixtures/test-fixtures';

// The board lays out six 280px columns plus gaps — about 1760px — so at 1280px
// the Won and Lost columns are off-screen and a drag towards them aims outside
// the viewport. 1920x1080 is a common real resolution and wide enough to hold
// the whole board. Narrow viewports are covered on purpose in responsive.spec.ts.
test.use({ viewport: { width: 1920, height: 1080 } });

/** An access token for the seeded owner, for the steps the UI cannot complete. */
async function ownerToken(request: APIRequestContext): Promise<string> {
  const owner = state().users.owner;
  const res = await request.post(`${apiBase()}/auth/login`, {
    data: { email: owner.email, password: owner.password },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.tokens.accessToken;
}

test.describe('Core loop: lead → deal → won → contact', () => {
  test('the full loop, with the stage move issued through the API', async ({ page, request }) => {
    // One run-unique token threads the whole journey, so every assertion targets
    // records this test created. The stack shares one database across all specs,
    // which is what makes that necessary.
    const id = unique('loop');
    const lead = {
      firstName: 'Grace',
      lastName: `Hopper-${id}`,
      email: `${id}@example.test`,
      company: `Acme-${id}`,
      value: '48000',
    };
    const dealTitle = `Deal ${lead.company}`;

    // ── 1. Sign in ───────────────────────────────────────────────────────────
    await loginAs(page, 'owner');

    // ── 2. Add a lead through the drawer ─────────────────────────────────────
    await goToPage(page, '/leads', /leads/i);

    const leads = leadsPage(page);
    await expect(leads.addButton()).toBeVisible();
    await leads.addLead(lead);

    // ── 3. It appears in the Leads table ─────────────────────────────────────
    // The reload is the workaround for the missing ['leads'] invalidation — see
    // the header, and the test.fail() that pins it below. Reloading also proves
    // the lead was genuinely persisted rather than rendered from a local cache.
    await reloadSafely(page);

    const leadRow = leads.table().locator('tr', { hasText: lead.lastName });
    await expect(leadRow).toBeVisible({ timeout: 30_000 });
    await expect(leadRow).toContainText(lead.company);
    await expect(leadRow).toContainText('48,000');

    // ── 4. Create the deal on the pipeline board ─────────────────────────────
    await goToPage(page, '/pipeline', /pipeline/i);

    const pipeline = pipelinePage(page);
    await pipeline.addDeal('Negotiation', dealTitle, lead.value);
    await expect(pipeline.dropZone('Negotiation')).toContainText(dealTitle);

    // ── 5. Move it to Won ────────────────────────────────────────────────────
    // Through the API, because the drag does not persist. This is still the real
    // endpoint the board is meant to call (PATCH /deals/:id/stage), so the
    // server-side half of the loop — including the Won hook — is under test.
    const token = await ownerToken(request);
    const list = await request.get(`${apiBase()}/deals?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const deal = (await list.json()).data.deals.find(
      (d: { title: string }) => d.title === dealTitle
    );
    expect(deal, `deal "${dealTitle}" should exist after being created in the UI`).toBeTruthy();

    const moved = await request.patch(`${apiBase()}/deals/${deal.id}/stage`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { stage: 'Won' },
    });
    expect(moved.status()).toBe(200);

    // The board reflects it.
    await reloadSafely(page);
    await expect(pipeline.dropZone('Won')).toContainText(dealTitle, { timeout: 30_000 });

    // ── 6. Won produced a Contact ────────────────────────────────────────────
    // The tail of the loop, and the part easiest to break unnoticed because it
    // happens server-side inside the stage-move handler.
    await goToPage(page, '/contacts', /contacts/i);
    await expect(page.getByText(dealTitle, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('a lead added in the drawer is persisted', async ({ page }) => {
    const id = unique('persist');
    const lead = { firstName: 'Ada', lastName: `Byron-${id}`, company: `Analytical-${id}` };

    await loginAs(page, 'owner');
    await goToPage(page, '/leads', /leads/i);

    const leads = leadsPage(page);
    await leads.addLead(lead);

    // A success toast is shown immediately…
    await expect(page.getByText(/lead added successfully/i)).toBeVisible({ timeout: 20_000 });

    // …and the record really is there, once the list is refetched.
    await reloadSafely(page);
    await expect(leads.table().locator('tr', { hasText: lead.lastName })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('KNOWN BUG: a newly added lead should appear without a reload', async ({ page }) => {
    // test.fail() inverts the result: this PASSES while the assertion fails, and
    // starts FAILING once fixed — at which point delete this line.
    //
    // The bug: AddLeadDrawer declares its own useMutation whose onSuccess
    // invalidates only ['dashboard','stats'] and ['dashboard','lead-activity'].
    // It never invalidates ['leads'], which is the key useLeadsList reads — and
    // that query has staleTime: 2 * 60 * 1000, so the new lead can stay
    // invisible for two minutes. The repo already contains a useCreateLead hook
    // that invalidates ['leads'] correctly; the drawer does not use it.
    test.fail();

    const id = unique('norefresh');
    const lead = { firstName: 'Should', lastName: `Appear-${id}` };

    await loginAs(page, 'owner');
    await goToPage(page, '/leads', /leads/i);

    const leads = leadsPage(page);
    await leads.addLead(lead);

    await expect(leads.table().locator('tr', { hasText: lead.lastName })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('dragging a deal moves the card on screen', async ({ page }) => {
    // The visual half of the drag genuinely works, and this pins that so the
    // known bug below cannot be misread as "drag and drop is entirely dead".
    const id = unique('visual');
    const dealTitle = `Visual ${id}`;

    await loginAs(page, 'owner');
    await goToPage(page, '/pipeline', /pipeline/i);

    const pipeline = pipelinePage(page);
    await pipeline.addDeal('Lead', dealTitle, '2500');
    await expect(pipeline.dropZone('Lead')).toContainText(dealTitle);

    await pipeline.dragCardToStage(dealTitle, 'Qualified');

    await expect(pipeline.dropZone('Qualified')).toContainText(dealTitle, { timeout: 30_000 });
    await expect(pipeline.dropZone('Lead')).not.toContainText(dealTitle);
  });

  test('KNOWN BUG: a dragged stage move should persist', async ({ page }) => {
    // test.fail() — see the note above. This is the most serious defect the E2E
    // suite found.
    //
    // The bug: usePipelineDrag.onDragOver optimistically writes the target stage
    // into the React Query cache while the pointer is still down. onDragEnd then
    // recomputes `original` from `deals` — which is derived from that same,
    // already-mutated cache — and returns early on
    // `targetStage === original.stage`. The comparison is therefore always true
    // for a real move, `move()` is never called, and NO request is sent at all.
    //
    // What a user sees: the card moves, the board looks correct, and the change
    // is gone the next time the deals query is refetched or the page reloaded.
    // Pipeline stage is the product's headline feature, and nothing about the
    // interaction hints that the move was discarded.
    test.fail();

    const id = unique('persistdrag');
    const dealTitle = `Persist ${id}`;

    await loginAs(page, 'owner');
    await goToPage(page, '/pipeline', /pipeline/i);

    const pipeline = pipelinePage(page);
    await pipeline.addDeal('Lead', dealTitle, '4000');

    await pipeline.dragCardToStage(dealTitle, 'Qualified');
    await expect(pipeline.dropZone('Qualified')).toContainText(dealTitle, { timeout: 30_000 });

    // The assertion that fails: after a reload the card is back in Lead.
    await reloadSafely(page);
    await expect(pipeline.dropZone('Qualified')).toContainText(dealTitle, { timeout: 20_000 });
  });

  test('KNOWN BUG: dragging a deal to Won should create a Contact', async ({ page }) => {
    // test.fail() — the downstream consequence of the drag defect above. The
    // server creates the Contact inside the stage-move handler, so a stage move
    // that never reaches the server produces no Contact. The first test in this
    // file proves the server side works when the request is actually sent.
    test.fail();

    const id = unique('wondrag');
    const dealTitle = `WonByDrag ${id}`;

    await loginAs(page, 'owner');
    await goToPage(page, '/pipeline', /pipeline/i);

    const pipeline = pipelinePage(page);
    await pipeline.addDeal('Negotiation', dealTitle, '7500');
    await pipeline.dragCardToStage(dealTitle, 'Won');
    await expect(pipeline.dropZone('Won')).toContainText(dealTitle, { timeout: 30_000 });

    await goToPage(page, '/contacts', /contacts/i);
    await expect(page.getByText(dealTitle, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the leads table search filters to a single lead', async ({ page }) => {
    const id = unique('search');
    const lead = {
      firstName: 'Searchable',
      lastName: `Lead-${id}`,
      company: `Findable-${id}`,
    };

    await loginAs(page, 'owner');
    await goToPage(page, '/leads', /leads/i);

    const leads = leadsPage(page);
    await leads.addLead(lead);
    // Reload for the missing invalidation — see the known bug above.
    await reloadSafely(page);
    await expect(leads.table().locator('tr', { hasText: lead.lastName })).toBeVisible({
      timeout: 30_000,
    });

    // A term matching only this lead keeps it.
    await leads.searchBox().fill(lead.company);
    await expect(leads.table().locator('tr', { hasText: lead.lastName })).toBeVisible({
      timeout: 30_000,
    });

    // A term matching nothing empties the table. This is the assertion that would
    // catch an unescaped regex, whose failure mode is that everything matches.
    await leads.searchBox().fill(`no-such-lead-${id}`);
    await expect(leads.table().locator('tr', { hasText: lead.lastName })).toBeHidden({
      timeout: 30_000,
    });
  });

  test('the pipeline card shows the deal value', async ({ page }) => {
    const id = unique('value');
    const dealTitle = `Valued ${id}`;

    await loginAs(page, 'owner');
    await goToPage(page, '/pipeline', /pipeline/i);

    const pipeline = pipelinePage(page);
    await pipeline.addDeal('Lead', dealTitle, '12500');

    await expect(pipeline.dropZone('Lead')).toContainText(dealTitle);
    await expect(pipeline.dropZone('Lead')).toContainText(/12,500|12500/);
  });
});
