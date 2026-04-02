import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 *
 * Tests run against a local Supabase instance (`supabase start`) with seeded
 * test users and subscriptions. The dev server is started with NODE_ENV=test,
 * which makes Next.js load `.env.test` instead of `.env.local` — pointing
 * the app at local Supabase.
 *
 * Prerequisites:
 *   1. `supabase start`   — local Supabase with migrations applied
 *   2. Dev server will be started automatically (or reuse existing on port 3001)
 *
 * Usage:
 *   npm run e2e              # run all e2e tests
 *   npm run e2e -- --ui      # interactive UI mode
 *   npm run e2e -- e2e/specs/anon.spec.ts   # single file
 *
 * IMPORTANT: E2E tests use port 3001 to avoid conflicting with your normal
 * dev server on port 3000. To start the server manually:
 *   npm run e2e:server
 */
export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Setup project runs first to seed the database
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
      teardown: 'teardown',
    },
    {
      name: 'teardown',
      testMatch: /global-teardown\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    // Uncomment to add more browsers:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    //   dependencies: ['setup'],
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    //   dependencies: ['setup'],
    // },
  ],

  /* Start a dev server on port 3001 with NODE_ENV=test.
   * NODE_ENV=test tells Next.js to load .env.test (not .env.local),
   * which points at local Supabase instead of the remote project. */
  webServer: {
    command: 'NODE_ENV=test npx next dev --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
