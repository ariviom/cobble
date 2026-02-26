import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock CSRF middleware to pass through
vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (
    handler: (
      req: import('next/server').NextRequest
    ) => Promise<import('next/server').NextResponse>
  ) => handler,
}));

import { POST } from '../route';

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: false, retryAfterSeconds: 7 }),
  getClientIp: vi.fn().mockResolvedValue('1.1.1.1'),
}));

describe('identify route rate limiting', () => {
  it('returns 429 with Retry-After when rate limited', async () => {
    const req = new NextRequest('http://localhost:3000/api/identify', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
    const json = await res.json();
    expect(json.error).toBe('rate_limited');
  });
});
