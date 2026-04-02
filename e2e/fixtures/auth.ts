import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { config } from '../helpers/supabase';
import { TEST_USERS, TEST_USER_IDS, type TestUserKey } from '../helpers/seed';

/**
 * Authenticate a Playwright page as a test user.
 *
 * Signs in via Supabase's signInWithPassword, then uses the SSR client
 * to produce the exact cookie format the Next.js middleware expects.
 * Injects cookies into the browser context so the dev server sees
 * an authenticated session.
 */
async function loginAsUser(
  page: Page,
  context: BrowserContext,
  userKey: TestUserKey
): Promise<void> {
  const user = TEST_USERS[userKey];

  // Sign in via the standard client to get tokens
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to sign in as ${userKey} (${user.email}): ${error?.message ?? 'no session'}`
    );
  }

  // Use the SSR client to produce the exact cookie name + value format
  // that the Next.js middleware and server components expect.
  const ssrCookies: Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }> = [];
  const ssrClient = createServerClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
      cookies: {
        getAll: () => ssrCookies.map(c => ({ name: c.name, value: c.value })),
        setAll: cookies => {
          ssrCookies.push(...cookies);
        },
      },
    }
  );

  await ssrClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
  const domain = new URL(baseUrl).hostname;

  // Inject all cookies produced by the SSR client into the browser context
  for (const cookie of ssrCookies) {
    await context.addCookies([
      {
        name: cookie.name,
        value: cookie.value,
        domain,
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
  }

  // Navigate once to establish the session with the server.
  // This ensures the middleware refreshes the auth cookies and the
  // server-side entitlements cache is populated before any API calls.
  await page.goto('/account');
  await page.waitForLoadState('domcontentloaded');
}

// ── Extended test fixtures ──────────────────────────────────────────

type AuthFixtures = {
  /** Page already authenticated as the free-tier test user. */
  freeUserPage: Page;
  /** Page already authenticated as the Plus (active) test user. */
  plusUserPage: Page;
  /** Page already authenticated as the trialing test user. */
  trialUserPage: Page;
  /** Page already authenticated as the past-due test user. */
  pastDueUserPage: Page;
  /** Page already authenticated as the canceled test user. */
  canceledUserPage: Page;
  /** Page already authenticated as the cancel-pending (active + cancel_at_period_end) test user. */
  cancelPendingUserPage: Page;
  /** Helper to sign in as any test user on a given page. */
  loginAs: (page: Page, userKey: TestUserKey) => Promise<void>;
};

/**
 * Extended Playwright test with pre-authenticated page fixtures.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/auth';
 *
 *   test('free user sees tab limit', async ({ freeUserPage }) => {
 *     await freeUserPage.goto('/sets');
 *     // ...
 *   });
 */
export const test = base.extend<AuthFixtures>({
  freeUserPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsUser(page, context, 'free');
    await use(page);
    await context.close();
  },

  plusUserPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsUser(page, context, 'plus');
    await use(page);
    await context.close();
  },

  trialUserPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsUser(page, context, 'trial');
    await use(page);
    await context.close();
  },

  pastDueUserPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsUser(page, context, 'pastDue');
    await use(page);
    await context.close();
  },

  canceledUserPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsUser(page, context, 'canceled');
    await use(page);
    await context.close();
  },

  cancelPendingUserPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsUser(page, context, 'cancelPending');
    await use(page);
    await context.close();
  },

  loginAs: async ({ browser }, use) => {
    // Expose the helper for ad-hoc login in tests
    const fn = async (page: Page, userKey: TestUserKey) => {
      const context = page.context();
      await loginAsUser(page, context, userKey);
    };
    await use(fn);
  },
});

export { expect } from '@playwright/test';
export { TEST_USERS, TEST_USER_IDS };
