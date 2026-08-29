// ─────────────────────────────────────────────────────────────────────────────
// e2e/auth.spec.ts — register → verify email → login → dashboard.
//
// The verification step uses the REAL token and the real /verify-email route.
// Verification tokens are stored SHA-256 hashed, so the value a user clicks
// cannot be read back out of the database; with no SMTP configured the API
// prints it to stdout, which global-setup.ts tees to a file. Reading it from
// there is the honest equivalent of opening the email — and it means this spec
// exercises the actual verification endpoint rather than flipping a flag in
// Mongo and calling it verified.
// ─────────────────────────────────────────────────────────────────────────────
import { test, expect } from '@playwright/test';
import {
  loginAs,
  resetSession,
  state,
  unique,
  verificationTokenFor,
} from './fixtures/test-fixtures';

/**
 * A registration that satisfies every validator on the form AND the API.
 *
 * The special character is required by the CLIENT only. authSchemas.ts demands
 * one; the API's own passwordRules in auth.routes.js ask for 8 characters, an
 * uppercase letter and a digit, and nothing more. The client being the stricter
 * of the two is safe, but the two policies disagree — noted in the audit report.
 */
function newAccount() {
  const id = unique('e2e');
  return {
    organizationName: `Org ${id}`,
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `${id}@example.test`,
    password: 'Password123!',
  };
}

async function fillRegistrationForm(
  page: import('@playwright/test').Page,
  account: ReturnType<typeof newAccount>
) {
  await page.goto('/register');
  await expect(page.locator('#organizationName')).toBeVisible();

  await page.locator('#organizationName').fill(account.organizationName);
  await page.locator('#firstName').fill(account.firstName);
  await page.locator('#lastName').fill(account.lastName);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirmPassword').fill(account.password);
  // ui/checkbox.tsx is a native <input type="checkbox">, so .check() drives it
  // and react-hook-form's register() sees the change.
  await page.getByRole('checkbox').first().check();
}

test.describe('Registration and sign-in', () => {
  test('full journey: register → verify email → login → dashboard loads', async ({ page }) => {
    const account = newAccount();

    // ── 1. Register ──────────────────────────────────────────────────────────
    await fillRegistrationForm(page, account);
    await page.getByRole('button', { name: 'Create Account' }).click();

    // RegisterPage navigates to /verify-email, but it never calls setAuth — so
    // VerifyEmailPage sees an unauthenticated visitor with no token in the query
    // and redirects straight to /login. The user therefore ends up on the login
    // page. That is the behaviour as it stands; the "Check your inbox" screen it
    // was supposed to reach is pinned as a known bug below.
    await page.waitForURL(/\/(login|verify-email)$/, { timeout: 45_000 });

    // ── 2. Verify the email with the real token ──────────────────────────────
    // The account was genuinely created and a verification mail genuinely sent,
    // whatever the UI showed — this is what proves it.
    const token = await verificationTokenFor(account.email);
    expect(token).toMatch(/^[a-f0-9]{32,}$/);

    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByRole('heading', { name: 'Email Verified!' })).toBeVisible({
      timeout: 30_000,
    });

    // ── 3. Sign in with the new credentials ──────────────────────────────────
    // The real point of the journey: the account works as an ordinary login now
    // that it is verified.
    await resetSession(page);

    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // ── 4. Dashboard loads with real content ─────────────────────────────────
    await page.waitForURL(/\/dashboard$/, { timeout: 45_000 });
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    // A dashboard that renders its shell but no data would still pass a URL
    // check, so assert something that only arrives from the API.
    await expect(page.getByText(account.firstName, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });

    // And the sidebar — proof the authenticated layout mounted, not an error page.
    await expect(page.getByRole('link', { name: /leads/i }).first()).toBeVisible();
  });

  test('KNOWN BUG: after registering, the user should see "Check your inbox"', async ({ page }) => {
    // test.fail() inverts the result: this PASSES while the assertion below
    // fails, and starts FAILING once the bug is fixed — at which point delete
    // this line and keep the assertion.
    //
    // The bug: RegisterPage's onSuccess throws the whole response away. The API
    // returns { user, organization, tokens } and sets a refresh cookie, but the
    // mutation calls neither setAuth nor anything else — it only navigates to
    // /verify-email. VerifyEmailPage's first branch is
    // `if (!isAuthenticated && !token) return <Navigate to={LOGIN} />`, so the
    // brand-new user is bounced to the login page with NO message: no "we sent
    // you an email", no resend button, no indication the account exists. The
    // "Check your inbox" screen is unreachable from registration, and the
    // tokens the server issued are discarded.
    test.fail();

    const account = newAccount();
    await fillRegistrationForm(page, account);
    await page.getByRole('button', { name: 'Create Account' }).click();

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('an unverified account cannot sign in', async ({ page }) => {
    // Registered but never verified. This is the guard that makes the
    // verification step above meaningful rather than decorative.
    const account = newAccount();

    await fillRegistrationForm(page, account);
    await page.getByRole('button', { name: 'Create Account' }).click();
    // See the known bug above: registration lands on /login, not /verify-email.
    await page.waitForURL(/\/(login|verify-email)$/, { timeout: 45_000 });

    await resetSession(page);

    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/verify your email/i)).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a wrong password is refused and no session is established', async ({ page }) => {
    // Asserts the outcome that matters — refused, still on /login, no way
    // through to the app. The MESSAGE the user is shown is wrong, and that is
    // pinned separately in the test below.
    const owner = state().users.owner;

    await page.goto('/login');
    await page.locator('#email').fill(owner.email);
    await page.locator('#password').fill('DefinitelyWrong123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Some error is surfaced, and the form stays put.
    await expect(page.locator('.text-destructive').first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);

    // And the session really was not created.
    await page.goto('/leads');
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
  });

  test('KNOWN BUG: a wrong password should say so, not report a missing refresh token', async ({
    page,
  }) => {
    // test.fail() inverts the result: this PASSES while the assertion below
    // fails, and starts FAILING the moment the bug is fixed — at which point
    // delete this line and keep the assertion.
    //
    // The bug: axiosInstance's response interceptor treats EVERY 401 as an
    // expired access token and fires a silent refresh, with no exemption for the
    // auth endpoints themselves. A failed POST /auth/login (401
    // INVALID_CREDENTIALS) therefore triggers POST /auth/refresh, which fails
    // with 401 NO_REFRESH_TOKEN because an anonymous visitor has no refresh
    // cookie — and it is THAT error which reaches login.mutate's onError. So
    // every failed login shows the internal string "No refresh token provided"
    // instead of "Invalid email or password".
    test.fail();

    const owner = state().users.owner;

    await page.goto('/login');
    await page.locator('#email').fill(owner.email);
    await page.locator('#password').fill('DefinitelyWrong123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 20_000 });
  });

  test('registration rejects a weak password before submitting', async ({ page }) => {
    const account = newAccount();

    await page.goto('/register');
    await page.locator('#organizationName').fill(account.organizationName);
    await page.locator('#firstName').fill(account.firstName);
    await page.locator('#lastName').fill(account.lastName);
    await page.locator('#email').fill(account.email);
    await page.locator('#password').fill('weak');
    await page.locator('#confirmPassword').fill('weak');
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Create Account' }).click();

    // Client-side zod validation, so this never reaches the API.
    await expect(page.getByText(/at least 8 characters/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('a protected route bounces an anonymous visitor to login', async ({ page }) => {
    await resetSession(page);
    await page.goto('/leads');

    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('a signed-in user is redirected away from the login page', async ({ page }) => {
    await loginAs(page, 'owner');

    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });
});

test.describe('Session durability', () => {
  test('KNOWN BUG: rapid full-page navigation signs the user out', async ({ page }) => {
    // test.fail() inverts the result: this PASSES while the assertion below
    // fails, and starts FAILING once fixed — at which point delete this line.
    //
    // This is the front-end symptom of a back-end defect, pinned from the other
    // side in backend/tests/auth.test.js ("KNOWN GAP: refresh token uniqueness").
    //
    // token.service.generateRefreshToken signs only `{ sub }`, so the sole
    // varying field in the JWT is `iat` — at one-second resolution. Two refresh
    // tokens issued to the same user inside the same second are byte-identical
    // and their stored SHA-256 hashes collide. Rotation then eats itself: the
    // first refresh revokes the old row and inserts a new one with the SAME
    // hash, so the next refresh finds the revoked row first and 401s. On a 401
    // from /auth/refresh the client clears the session.
    //
    // Every full page load re-bootstraps the session with a refresh call, so
    // navigating quickly by URL — or simply having two tabs open — produces two
    // refreshes in one second and logs the user out. Observed live: a run of
    // `POST /api/auth/refresh 200` with a `401` in the middle, and the app back
    // on the login screen.
    test.fail();

    await loginAs(page, 'owner');

    // Six full loads, back to back, with no artificial pause.
    for (const route of ['/leads', '/pipeline', '/contacts', '/tasks', '/leads', '/dashboard']) {
      await page.goto(route);
    }

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
  });
});
