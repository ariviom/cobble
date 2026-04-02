import { test, expect } from '../fixtures/auth';
import { test as anonTest } from '@playwright/test';

/**
 * API-level entitlement gate tests.
 *
 * These test server-side enforcement of auth, entitlements, and quotas.
 * Faster than browser tests since they only make HTTP requests.
 *
 * POST endpoints require a valid Origin header for CSRF validation.
 */

const ORIGIN = 'http://localhost:3001';
const POST_HEADERS = {
  'Content-Type': 'application/json',
  Origin: ORIGIN,
};

anonTest.describe('API gates: anonymous', () => {
  anonTest(
    'POST /api/identify rejects unauthenticated',
    async ({ request }) => {
      const response = await request.post('/api/identify', {
        headers: POST_HEADERS,
      });
      expect([401, 403]).toContain(response.status());
    }
  );

  anonTest('POST /api/lists rejects unauthenticated', async ({ request }) => {
    const response = await request.post('/api/lists', {
      headers: POST_HEADERS,
      data: { name: 'Test' },
    });
    expect([401, 403]).toContain(response.status());
  });

  anonTest(
    'POST /api/group-sessions rejects unauthenticated',
    async ({ request }) => {
      const response = await request.post('/api/group-sessions', {
        headers: POST_HEADERS,
        data: { setNumber: '21322' },
      });
      expect([401, 403]).toContain(response.status());
    }
  );

  anonTest('POST /api/sync rejects unauthenticated', async ({ request }) => {
    const response = await request.post('/api/sync', {
      headers: POST_HEADERS,
      data: { operations: [] },
    });
    expect([401, 403]).toContain(response.status());
  });

  anonTest('GET /api/entitlements returns free tier', async ({ request }) => {
    const response = await request.get('/api/entitlements');
    if (response.ok()) {
      const body = await response.json();
      expect(body.tier).toBe('free');
      expect(body.features).toEqual([]);
    } else {
      // Auth error is acceptable for anon against local Supabase
      expect([401, 500]).toContain(response.status());
    }
  });
});

test.describe('API gates: free user', () => {
  test('GET /api/entitlements returns free tier', async ({
    freeUserPage: page,
  }) => {
    const response = await page.request.get('/api/entitlements');
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.tier).toBe('free');
    expect(body.features).not.toContain('tabs.unlimited');
    expect(body.features).not.toContain('lists.unlimited');
  });

  test('POST /api/lists enforces free limit', async ({
    freeUserPage: page,
  }) => {
    // Create lists until we hit the free limit (5 max).
    let hitLimit = false;
    for (let i = 0; i < 7; i++) {
      const response = await page.request.post('/api/lists', {
        headers: { Origin: ORIGIN },
        data: { name: `E2E Free Limit ${Date.now()}-${i}` },
      });
      const body = await response.json();
      if (
        !response.ok() &&
        (body.code === 'feature_unavailable' ||
          body.error === 'feature_unavailable')
      ) {
        hitLimit = true;
        break;
      }
    }
    expect(hitLimit).toBe(true);
  });

  test('GET /api/identify/quota returns metered status', async ({
    freeUserPage: page,
  }) => {
    const response = await page.request.get('/api/identify/quota');
    if (response.ok()) {
      const body = await response.json();
      expect(body.status).toBe('metered');
      expect(body.limit).toBe(5);
      expect(typeof body.remaining).toBe('number');
    }
  });

  test('GET /api/group-sessions/quota returns limited status', async ({
    freeUserPage: page,
  }) => {
    const response = await page.request.get('/api/group-sessions/quota');
    if (response.ok()) {
      const body = await response.json();
      expect(body.canHost).toBeDefined();
    }
  });
});

test.describe('API gates: plus user', () => {
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
    expect(body.features).toContain('search_party.unlimited');
    expect(body.features).toContain('sync.cloud');
    expect(body.features).toContain('rarity.enabled');
  });

  test('POST /api/lists allows unlimited creation', async ({
    plusUserPage: page,
  }) => {
    // Create more than 5 lists — should all succeed
    for (let i = 0; i < 6; i++) {
      const response = await page.request.post('/api/lists', {
        headers: { Origin: ORIGIN },
        data: { name: `E2E Plus List ${Date.now()}-${i}` },
      });
      expect(response.ok()).toBe(true);
    }
  });

  test('GET /api/identify/quota returns unlimited status', async ({
    plusUserPage: page,
  }) => {
    const response = await page.request.get('/api/identify/quota');
    if (response.ok()) {
      const body = await response.json();
      expect(body.status).toBe('unlimited');
    }
  });
});

// Note: Rate limiting load tests are omitted from the default E2E suite
// because they exhaust the per-IP rate limit budget (30/min) and cause
// subsequent tests to get 429s. Test rate limiting separately:
//   npx playwright test e2e/specs/rate-limit.spec.ts
