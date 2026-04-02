import { test, expect } from '../fixtures/auth';

test.describe('Subscription states', () => {
  test.describe('Trialing user', () => {
    test('has Plus features', async ({ trialUserPage: page }) => {
      const response = await page.request.get('/api/entitlements');
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.tier).toBe('plus');
      expect(body.features).toContain('tabs.unlimited');
    });

    test('billing tab shows trial status', async ({ trialUserPage: page }) => {
      await page.goto('/account');

      const billingTab = page
        .getByRole('tab', { name: /billing/i })
        .or(page.getByText(/billing/i).first());
      await expect(billingTab).toBeVisible({ timeout: 5_000 });
      await billingTab.click();

      // Should indicate trial status
      await expect(page.locator('body')).toContainText(/trial/i);
    });

    test('no dunning banner visible', async ({ trialUserPage: page }) => {
      await page.goto('/sets');
      await page.waitForLoadState('domcontentloaded');
      const dunningBanner = page.getByText(/payment failed/i);
      await expect(dunningBanner).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Past-due user', () => {
    test('has Plus features during grace period', async ({
      pastDueUserPage: page,
    }) => {
      const response = await page.request.get('/api/entitlements');
      expect(response.ok()).toBe(true);
      const body = await response.json();
      // past_due subscriptions keep Plus features active
      expect(body.tier).toBe('plus');
      expect(body.features).toContain('tabs.unlimited');
    });

    test('dunning banner is visible', async ({ pastDueUserPage: page }) => {
      await page.goto('/sets');
      await page.waitForLoadState('domcontentloaded');

      const dunningBanner = page.getByText(/payment failed/i);
      await expect(dunningBanner).toBeVisible({ timeout: 10_000 });

      const updateButton = page.getByRole('button', {
        name: /update payment/i,
      });
      await expect(updateButton).toBeVisible();
    });

    test('billing tab shows past-due warning', async ({
      pastDueUserPage: page,
    }) => {
      await page.goto('/account');

      const billingTab = page
        .getByRole('tab', { name: /billing/i })
        .or(page.getByText(/billing/i).first());
      await expect(billingTab).toBeVisible({ timeout: 5_000 });
      await billingTab.click();

      await expect(page.locator('body')).toContainText(
        /past.?due|update.*payment|payment.*failed/i
      );
    });
  });

  test.describe('Cancel-pending user (active + cancel_at_period_end)', () => {
    test('still has Plus features', async ({ cancelPendingUserPage: page }) => {
      const response = await page.request.get('/api/entitlements');
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.tier).toBe('plus');
      expect(body.features).toContain('tabs.unlimited');
    });

    test('billing tab shows cancellation date', async ({
      cancelPendingUserPage: page,
    }) => {
      await page.goto('/account');

      const billingTab = page
        .getByRole('tab', { name: /billing/i })
        .or(page.getByText(/billing/i).first());
      await expect(billingTab).toBeVisible({ timeout: 5_000 });
      await billingTab.click();

      // Should mention the subscription is set to cancel
      await expect(page.locator('body')).toContainText(
        /set to cancel|ends on|retain access/i
      );
    });

    test('pricing page shows "Current plan"', async ({
      cancelPendingUserPage: page,
    }) => {
      await page.goto('/pricing');
      // Still active, so should show "Current plan" not "Resubscribe"
      await expect(
        page.getByRole('button', { name: /current plan/i })
      ).toBeVisible({ timeout: 10_000 });
    });

    test('no dunning banner visible', async ({
      cancelPendingUserPage: page,
    }) => {
      await page.goto('/sets');
      await page.waitForLoadState('domcontentloaded');
      const dunningBanner = page.getByText(/payment failed/i);
      await expect(dunningBanner).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Canceled user', () => {
    test('downgrades to free tier', async ({ canceledUserPage: page }) => {
      const response = await page.request.get('/api/entitlements');
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.tier).toBe('free');
      expect(body.features).not.toContain('tabs.unlimited');
    });

    test('/pricing page renders for returning subscriber', async ({
      canceledUserPage: page,
    }) => {
      await page.goto('/pricing');
      await expect(page).toHaveURL('/pricing');
      // Page should render without error
      await expect(page.locator('body')).toBeVisible();
    });

    test('free limits are enforced (entitlements)', async ({
      canceledUserPage: page,
    }) => {
      const response = await page.request.get('/api/entitlements');
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body.features).not.toContain('tabs.unlimited');
      expect(body.features).not.toContain('lists.unlimited');
      expect(body.features).not.toContain('identify.unlimited');
    });

    test('no dunning banner visible', async ({ canceledUserPage: page }) => {
      await page.goto('/sets');
      await page.waitForLoadState('domcontentloaded');
      const dunningBanner = page.getByText(/payment failed/i);
      await expect(dunningBanner).not.toBeVisible({ timeout: 3_000 });
    });
  });
});
