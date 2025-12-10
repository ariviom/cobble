import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { GET } from '../bricklink/route';

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 5 }),
  getClientIp: vi.fn().mockResolvedValue('2.2.2.2'),
}));

// Mock Supabase auth server client to avoid real calls.
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}));

describe('parts/bricklink rate limiting', () => {
  it('returns 429 with Retry-After when rate limited (IP)', async () => {
    const req = new NextRequest('http://localhost/api/parts/bricklink?part=3001', {
      method: 'GET',
    });
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('5');
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
    expect(json.details?.scope).toBe('ip');
  });
});

