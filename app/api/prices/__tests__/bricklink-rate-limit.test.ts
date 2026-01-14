import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { POST as PricesPost } from '../bricklink/route';
import { POST as PricesSetPost } from '../bricklink-set/route';

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: false, retryAfterSeconds: 9 }),
  getClientIp: vi.fn().mockResolvedValue('3.3.3.3'),
}));

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}));

vi.mock('@/app/lib/userPricingPreferences', () => ({
  loadUserPricingPreferences: vi.fn().mockResolvedValue({
    currency: 'USD',
    includeHistoric: false,
  }),
}));

describe('prices bricklink rate limiting', () => {
  it('returns 429 with Retry-After for bricklink prices', async () => {
    const body = JSON.stringify({
      items: [{ key: 'k1', partId: '3001', colorId: 1 }],
    });
    const req = new NextRequest('http://localhost:3000/api/prices/bricklink', {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
      },
    });

    const res = await PricesPost(req);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('9');
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
  });

  it('returns 429 with Retry-After for bricklink-set prices', async () => {
    const body = JSON.stringify({ setNumber: '3001-1' });
    const req = new NextRequest(
      'http://localhost:3000/api/prices/bricklink-set',
      {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
        },
      }
    );

    const res = await PricesSetPost(req);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('9');
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
  });
});
