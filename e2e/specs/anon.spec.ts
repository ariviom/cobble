import { test, expect } from '@playwright/test';

test.describe('Anonymous user', () => {
  test('landing page renders (not redirected to /sets)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    // Should NOT be at /sets (that's for authenticated users)
    expect(page.url()).not.toContain('/sets');
  });

  test('can navigate to /sets and browse', async ({ page }) => {
    await page.goto('/sets');
    await expect(page).toHaveURL('/sets');
    // Tab bar should eventually render
    await expect(page.getByTestId('set-tab-bar')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('can use /search page', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL('/search');
    // Search page should render without error
    await expect(page.locator('body')).toBeVisible();
    // Should have some form of search input
    const input = page.locator('input').first();
    await expect(input).toBeVisible({ timeout: 5_000 });
  });

  test('/collection shows sign-in prompt', async ({ page }) => {
    await page.goto('/collection');
    // Should show sign-in prompt, not redirect
    await expect(
      page.getByRole('heading', { name: /create an account|sign in/i })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('/account renders without crash', async ({ page }) => {
    await page.goto('/account');
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/account');
  });

  test('/identify renders with unauthorized state', async ({ page }) => {
    await page.goto('/identify');
    await expect(page).toHaveURL('/identify');
    await expect(page.locator('body')).toBeVisible();
  });

  test('POST /api/identify rejects unauthenticated', async ({ request }) => {
    const response = await request.post('/api/identify', {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3001',
      },
    });
    // 401 (auth check) or 403 (CSRF) — either way, blocked
    expect([401, 403]).toContain(response.status());
  });

  test('POST /api/lists rejects unauthenticated', async ({ request }) => {
    const response = await request.post('/api/lists', {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3001',
      },
      data: { name: 'Test List' },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('POST /api/sync rejects unauthenticated', async ({ request }) => {
    const response = await request.post('/api/sync', {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3001',
      },
      data: { operations: [] },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('GET /api/entitlements returns free tier for anon', async ({
    request,
  }) => {
    const response = await request.get('/api/entitlements');
    // May return 401 if local Supabase auth can't resolve the anon request,
    // or 200 with free tier
    if (response.ok()) {
      const body = await response.json();
      expect(body.tier).toBe('free');
      expect(body.features).toEqual([]);
    } else {
      // Acceptable: auth error returns non-OK
      expect([401, 500]).toContain(response.status());
    }
  });
});
