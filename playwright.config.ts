// ─────────────────────────────────────────────────────────────────────────────
// playwright.config.ts — E2E configuration for the ElevateCRM frontend.
//
// The stack (in-memory Mongo, the API, the Vite dev server) is brought up by
// e2e/global-setup.ts rather than by the `webServer` option — see the comment at
// the top of that file for why the ordering has to be explicit.
// ─────────────────────────────────────────────────────────────────────────────
import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5174);

export default defineConfig({
  testDir: './e2e',
  // The support files live alongside the specs; only *.spec.ts are tests.
  testMatch: '**/*.spec.ts',

  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  // One worker, deliberately. All specs share one API process and one database,
  // so parallel workers would race each other's records. Records are also named
  // uniquely per test (see e2e/fixtures/test-fixtures.ts) so a shared database
  // never makes an assertion ambiguous.
  workers: 1,
  fullyParallel: false,

  // A first-load in dev mode compiles the route chunk on demand, which is slow
  // the first time each page is visited.
  timeout: 90_000,
  expect: { timeout: 15_000 },

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],

  outputDir: 'e2e/.artifacts/test-results',
});
