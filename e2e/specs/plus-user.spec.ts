import { test, expect } from '../fixtures/auth';

test.describe('Plus subscribed user', () => {
  test('/ redirects to /sets', async ({ plusUserPage: page }) => {
    await page.goto('/');
    await page.waitForURL(/\/sets/, { timeout: 10_000 });
    expect(page.url()).toContain('/sets');
  });

  test('can open more than 3 tabs without upgrade modal', async ({
    plusUserPage: page,
  }) => {
    await page.goto('/sets');
    await page.waitForSelector('[data-testid="set-tab-bar"]', {
      timeout: 10_000,
    });

    // Open 4 set tabs via deep-link
    const testSets = ['1788', '6781', '6989', '40597'];
    for (const setNum of testSets) {
      await page.goto(`/sets?active=${setNum}`);
      await page.waitForTimeout(1000);
    }

    // Upgrade modal should NOT appear
    const upgradeModal = page.getByRole('dialog').filter({
      hasText: /upgrade to plus/i,
    });
    await expect(upgradeModal).not.toBeVisible();
  });

  test('identify shows unlimited quota', async ({ plusUserPage: page }) => {
    await page.goto('/identify');
    await expect(page).toHaveURL('/identify');
    // Should not show usage counter or "remaining" text
    const remainingText = page.getByText(/remaining|identifications left/i);
    await expect(remainingText).not.toBeVisible();
  });

  test('/pricing page renders', async ({ plusUserPage: page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveURL('/pricing');
    // Pricing page should render the header
    await expect(
      page.getByRole('heading', { name: /pick the plan|pricing/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('/account billing tab shows Plus badge', async ({
    plusUserPage: page,
  }) => {
    await page.goto('/account');

    const billingTab = page
      .getByRole('tab', { name: /billing/i })
      .or(page.getByText(/billing/i).first());
    await expect(billingTab).toBeVisible({ timeout: 5_000 });
    await billingTab.click();

    // Should show Plus plan info
    await expect(page.locator('body')).toContainText(/plus/i);
    // Should show manage subscription button
    await expect(
      page.getByRole('button', { name: /manage subscription/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('no dunning banner visible', async ({ plusUserPage: page }) => {
    await page.goto('/sets');
    await page.waitForSelector('[data-testid="set-tab-bar"]', {
      timeout: 10_000,
    });
    const dunningBanner = page.getByText(/payment failed/i);
    await expect(dunningBanner).not.toBeVisible();
  });

  test('GET /api/entitlements returns plus tier with features', async ({
    plusUserPage: page,
  }) => {
    const response = await page.request.get('/api/entitlements');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.tier).toBe('plus');
    expect(body.features).toContain('tabs.unlimited');
    expect(body.features).toContain('lists.unlimited');
    expect(body.features).toContain('identify.unlimited');
    expect(body.features).toContain('sync.cloud');
    expect(body.features).toContain('rarity.enabled');
  });

  test('sync mode is full (cloud sync enabled)', async ({
    plusUserPage: page,
  }) => {
    const response = await page.request.get('/api/entitlements');
    const body = await response.json();
    expect(body.features).toContain('sync.cloud');
  });
});
