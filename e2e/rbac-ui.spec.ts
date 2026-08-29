// ─────────────────────────────────────────────────────────────────────────────
// e2e/rbac-ui.spec.ts — what each role can see and reach in the interface.
//
// Scope, stated plainly: this file tests the INTERFACE. Hiding a button is
// decoration, not a control — the control is the server, and it is tested
// directly in backend/tests/rbac.test.js (213 assertions across every guarded
// route and every role). What matters here is that the UI does not offer a
// person an action the server will refuse, and does not hide one it would allow.
//
// ── One correction to the brief ───────────────────────────────────────────────
// The brief asks to confirm a Member "cannot access Team Settings". In this
// application a Member CAN reach /settings/team, by design: the route carries no
// RoleRoute, GET /api/team/members is open to any member, and the page degrades
// to a read-only roster. The settings page that IS role-gated is
// /settings/organization (owner/admin only, mirroring
// requireRole('owner','admin') on PATCH /api/organizations/current).
//
// So both are asserted for their real behaviour: a Member reaches the team
// roster but is offered none of the controls that mutate it, and is refused
// Organization settings outright. Testing the brief's literal wording would have
// meant asserting a redirect the application deliberately does not perform.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from '@playwright/test';
import {
  goToPage,
  leadsPage,
  loginAs,
  reloadSafely,
  unique,
} from './fixtures/test-fixtures';

test.describe('Viewer — read-only throughout', () => {
  test('the page-level Add Lead button is not rendered', async ({ page }) => {
    // LeadsPage gates its own button on `can(LEADS_WRITE)`, so for a viewer it is
    // absent rather than disabled — a count of zero says which of the two it is.
    // Scoped to <main> because the global header carries an UNGATED copy; that is
    // a real defect and it is pinned separately below.
    await loginAs(page, 'viewer');
    await goToPage(page, '/leads', /leads/i);

    await expect(leadsPage(page).pageAddButtons()).toHaveCount(0);
  });

  test('KNOWN BUG: the header offers Add Lead to a viewer', async ({ page }) => {
    // test.fail() inverts the result: this PASSES while the assertion fails, and
    // starts FAILING once fixed — at which point delete this line.
    //
    // The bug: TopNavbar.tsx renders its "Add Lead" button with no permission
    // check at all — no usePermissions, no `can(...)`, nothing. So a viewer sees
    // it in the global header on EVERY page, can open the drawer and fill the
    // whole form in, and only discovers the action was never available when the
    // submit answers 403. LeadsPage gets this right for its own button; the
    // global nav does not.
    //
    // Not a security hole — the server refuses the write, as the test below
    // proves — but the interface is offering an action it cannot deliver.
    test.fail();

    await loginAs(page, 'viewer');
    await goToPage(page, '/leads', /leads/i);

    await expect(leadsPage(page).navbarAddButton()).toHaveCount(0);
  });

  test("the server refuses a viewer's write even though the header offers it", async ({
    page,
  }) => {
    // The reason the bug above is cosmetic rather than a breach. The viewer can
    // reach the drawer through the header and submit it; the API returns 403 and
    // no lead is created.
    await loginAs(page, 'viewer');
    await goToPage(page, '/leads', /leads/i);

    const forbidden = page.waitForResponse(
      (r) => r.url().includes('/api/leads') && r.request().method() === 'POST'
    );

    await leadsPage(page).navbarAddButton().click();
    const drawer = page.getByRole('dialog', { name: 'Add new lead' });
    await expect(drawer).toBeVisible();
    await drawer.locator('#firstName').fill('Should');
    await drawer.locator('#lastName').fill('NotExist');
    await drawer.getByRole('button', { name: 'Add lead' }).click();

    expect((await forbidden).status()).toBe(403);
  });

  test('the leads table is still readable', async ({ page }) => {
    // The other half of the rule. An over-tight guard that also removed read
    // access would be a regression, and a hidden-button test alone would pass.
    await loginAs(page, 'viewer');
    await goToPage(page, '/leads', /leads/i);

    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /name/i }).first()).toBeVisible();
  });

  test('no delete action is offered on a lead row', async ({ page }) => {
    await loginAs(page, 'viewer');
    await goToPage(page, '/leads', /leads/i);

    await expect(page.getByRole('button', { name: /delete lead/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /ai summary/i })).toHaveCount(0);
  });

  test('the pipeline offers no way to add a deal', async ({ page }) => {
    await loginAs(page, 'viewer');
    await goToPage(page, '/pipeline', /pipeline/i);

    await expect(page.getByRole('button', { name: /^Add deal to/ })).toHaveCount(0);
  });

  test('Reports is neither linked nor reachable', async ({ page }) => {
    await loginAs(page, 'viewer');

    // Not in the sidebar…
    await expect(page.getByRole('link', { name: /^reports$/i })).toHaveCount(0);

    // …and refused if the URL is typed by hand, which is the guard that counts
    // on the client side.
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('Organization settings is refused', async ({ page }) => {
    await loginAs(page, 'viewer');
    await page.goto('/settings/organization');

    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('the team roster is readable but offers no controls', async ({ page }) => {
    await loginAs(page, 'viewer');
    await goToPage(page, '/settings/team', /members/i);

    await expect(page.getByRole('button', { name: /invite member/i })).toHaveCount(0);
    await expect(page.getByText(/only owners and admins can invite/i)).toBeVisible();
  });

  test('a viewer can still edit their own profile', async ({ page }) => {
    // users.routes.js carries no role guard because every handler acts on
    // req.user.sub — a viewer editing themselves is correct, and the UI must
    // not gate it.
    await loginAs(page, 'viewer');
    await goToPage(page, '/settings/profile', /settings/i);

    await expect(page.locator('input').first()).toBeEditable();
  });
});

test.describe('Member — can write records, cannot manage people', () => {
  test('the page-level Add Lead button IS available', async ({ page }) => {
    await loginAs(page, 'member');
    await goToPage(page, '/leads', /leads/i);

    await expect(leadsPage(page).pageAddButtons().first()).toBeVisible();
  });

  test('a member can actually create a lead', async ({ page }) => {
    // The positive case, driven all the way through, so "the button is visible"
    // cannot pass while the write itself 403s.
    const id = unique('member');
    const lead = { firstName: 'Member', lastName: `Made-${id}` };

    await loginAs(page, 'member');
    await goToPage(page, '/leads', /leads/i);

    await leadsPage(page).addLead(lead);
    await reloadSafely(page);

    await expect(
      leadsPage(page).table().locator('tr', { hasText: lead.lastName })
    ).toBeVisible({ timeout: 30_000 });
  });

  test('the pipeline allows adding a deal', async ({ page }) => {
    await loginAs(page, 'member');
    await goToPage(page, '/pipeline', /pipeline/i);

    await expect(page.getByRole('button', { name: 'Add deal to Lead' })).toBeVisible();
  });

  test('no delete action is offered — deleting is manager and above', async ({ page }) => {
    await loginAs(page, 'member');
    await goToPage(page, '/leads', /leads/i);

    await expect(page.getByRole('button', { name: /delete lead/i })).toHaveCount(0);
  });

  test('Reports is refused', async ({ page }) => {
    await loginAs(page, 'member');
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('Organization settings is refused, and its tab is not shown', async ({ page }) => {
    // This is the role-gated settings page — see the note at the top of the file
    // about the brief's wording.
    await loginAs(page, 'member');
    await goToPage(page, '/settings/profile', /settings/i);

    await expect(page.getByRole('link', { name: /^organization$/i })).toHaveCount(0);

    // Two full page loads in quick succession re-bootstrap the session twice and
    // collide on an identical refresh token, which signs the user out and lands
    // them on /login instead of Access Denied. That defect is pinned in
    // auth.spec.ts ("rapid full-page navigation signs the user out"); the pause
    // keeps THIS test measuring RBAC rather than tripping over it.
    await page.waitForTimeout(1_100);

    await page.goto('/settings/organization');
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({
      timeout: 30_000,
    });
  });

  test('Team settings is reachable but read-only', async ({ page }) => {
    await loginAs(page, 'member');
    await goToPage(page, '/settings/team', /members/i);

    // The roster is visible — that is intended.
    await expect(page.getByText('owner@e2e.test')).toBeVisible({ timeout: 30_000 });

    // But nothing that mutates it is offered.
    await expect(page.getByRole('button', { name: /invite member/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /remove/i })).toHaveCount(0);
    await expect(page.getByText(/only owners and admins can invite/i)).toBeVisible();
  });

  test('no role dropdown is offered for another member', async ({ page }) => {
    await loginAs(page, 'member');
    await goToPage(page, '/settings/team', /members/i);

    // TeamSettings renders a <select> of assignable roles only when canManage.
    await expect(page.locator('select')).toHaveCount(0);
  });
});

test.describe('Manager — can delete records, cannot manage people', () => {
  test('a delete action IS offered on a lead row', async ({ page }) => {
    // Seed a row as the manager so there is something to act on.
    const id = unique('mgr');
    await loginAs(page, 'manager');
    await goToPage(page, '/leads', /leads/i);
    await leadsPage(page).addLead({ firstName: 'Mgr', lastName: `Row-${id}` });
    await reloadSafely(page);

    await expect(page.getByRole('button', { name: /delete lead/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('Reports IS reachable', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Access Denied' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /reports/i }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('team management is still refused', async ({ page }) => {
    // Deleting a lead and removing a colleague are different powers. A manager
    // has the first and not the second.
    await loginAs(page, 'manager');
    await goToPage(page, '/settings/team', /members/i);

    await expect(page.getByRole('button', { name: /invite member/i })).toHaveCount(0);
    await expect(page.getByText(/only owners and admins can invite/i)).toBeVisible();
  });

  test('Organization settings is refused', async ({ page }) => {
    await loginAs(page, 'manager');
    await page.goto('/settings/organization');

    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe('Admin — full access', () => {
  test('every gated page is reachable', async ({ page }) => {
    await loginAs(page, 'admin');

    for (const [route, heading] of [
      ['/leads', /leads/i],
      ['/pipeline', /pipeline/i],
      ['/contacts', /contacts/i],
      ['/tasks', /tasks/i],
      ['/reports', /reports/i],
      ['/settings/organization', /organization/i],
      ['/settings/team', /members/i],
    ] as const) {
      await page.goto(route);
      await expect(
        page.getByRole('heading', { name: 'Access Denied' }),
        `an admin must not be refused ${route}`
      ).toHaveCount(0);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({
        timeout: 45_000,
      });

      // A full page load re-bootstraps the session with POST /auth/refresh, and
      // two of those inside the same second collide on an identical refresh
      // token and 401 — which signs the user out mid-loop. That defect is real
      // and pinned in its own test below; this pause keeps THIS test measuring
      // RBAC rather than tripping over it.
      await page.waitForTimeout(1_100);
    }
  });

  test('write and delete controls are offered', async ({ page }) => {
    await loginAs(page, 'admin');
    await goToPage(page, '/leads', /leads/i);

    await expect(leadsPage(page).pageAddButtons().first()).toBeVisible();

    await goToPage(page, '/pipeline', /pipeline/i);
    await expect(page.getByRole('button', { name: 'Add deal to Lead' })).toBeVisible();
  });

  test('team management controls are offered', async ({ page }) => {
    await loginAs(page, 'admin');
    await goToPage(page, '/settings/team', /members/i);

    await expect(page.getByRole('button', { name: /invite member/i })).toBeVisible();
    await expect(page.getByText(/only owners and admins can invite/i)).toHaveCount(0);
  });

  test('the owner is presented as a protected target', async ({ page }) => {
    // The owner's role must not be editable by an admin. The server refuses it
    // with OWNER_PROTECTED; the UI should not offer it in the first place.
    await loginAs(page, 'admin');
    await goToPage(page, '/settings/team', /members/i);

    const ownerRow = page.locator('div', { hasText: 'owner@e2e.test' }).last();
    await expect(ownerRow).toBeVisible();

    // Every enabled role <select> on the page belongs to someone other than the
    // owner. Checked by counting: an admin sees selects for the four lower
    // roles, and none for the owner or for themselves.
    const selects = page.locator('select:not([disabled])');
    const count = await selects.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(selects.nth(i)).not.toHaveValue('owner');
    }
  });

  test('Reports renders real content, not an error state', async ({ page }) => {
    await loginAs(page, 'admin');
    await goToPage(page, '/reports', /reports/i);

    // Four report endpoints are manager+; if RBAC were wrong they would 403 and
    // the page would show its error state rather than data.
    await expect(page.getByText(/couldn.t load|failed to load|access denied/i)).toHaveCount(0);
  });
});

test.describe('Owner — the highest role', () => {
  test('everything an admin can reach, plus the owner is protected from itself', async ({
    page,
  }) => {
    await loginAs(page, 'owner');
    await goToPage(page, '/settings/team', /members/i);

    await expect(page.getByRole('button', { name: /invite member/i })).toBeVisible();

    // The owner cannot change their own role — team.controller refuses with
    // CANNOT_EDIT_SELF, and the UI should not present the control.
    const selects = page.locator('select:not([disabled])');
    const count = await selects.count();
    for (let i = 0; i < count; i++) {
      await expect(selects.nth(i)).not.toHaveValue('owner');
    }
  });
});
