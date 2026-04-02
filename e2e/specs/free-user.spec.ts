import { test, expect } from '../fixtures/auth';

test.describe('Free authenticated user', () => {
  test('/ redirects to /sets', async ({ freeUserPage: page }) => {
    await page.goto('/');
    await page.waitForURL(/\/sets/, { timeout: 10_000 });
    expect(page.url()).toContain('/sets');
  });

  test('/collection redirects to /collection/[handle]', async ({
    freeUserPage: page,
  }) => {
    await page.goto('/collection');
    await page.waitForURL(/\/collection\//, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/collection\/.+/);
  });

  test('/pricing page renders', async ({ freeUserPage: page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveURL('/pricing');
    // Pricing page should render the header
    await expect(
      page.getByRole('heading', { name: /pick the plan|pricing/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  test('/account billing tab shows Free Plan', async ({
    freeUserPage: page,
  }) => {
    await page.goto('/account');
    await expect(page).toHaveURL('/account');

    // Click on billing tab
    const billingTab = page
      .getByRole('tab', { name: /billing/i })
      .or(page.getByText(/billing/i).first());
    await expect(billingTab).toBeVisible({ timeout: 5_000 });
    await billingTab.click();

    // Should show free plan indication
    await expect(page.locator('body')).toContainText(/free/i);
  });

  test('no dunning banner visible', async ({ freeUserPage: page }) => {
    await page.goto('/sets');
    await page.waitForSelector('[data-testid="set-tab-bar"]', {
      timeout: 10_000,
    });

    // Dunning banner should not be present
    const dunningBanner = page.getByText(/payment failed/i);
    await expect(dunningBanner).not.toBeVisible();
  });

  test('GET /api/entitlements returns free tier', async ({
    freeUserPage: page,
  }) => {
    const response = await page.request.get('/api/entitlements');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.tier).toBe('free');
    expect(body.features).not.toContain('tabs.unlimited');
    expect(body.features).not.toContain('lists.unlimited');
    expect(body.features).not.toContain('identify.unlimited');
    expect(body.features).not.toContain('sync.cloud');
  });
});
