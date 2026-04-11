import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mockValidatePart = vi.fn();
vi.mock('@/app/lib/bricklink', () => ({
  blValidatePart: (...args: unknown[]) => mockValidatePart(...args),
}));

const mockGetUser = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockGetCatalogWriteClient = vi.fn();
vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogWriteClient: () => mockGetCatalogWriteClient(),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET } from '../validate/route';

describe('GET /api/parts/bricklink/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    mockGetClientIp.mockResolvedValue('127.0.0.1');
  });

  it('returns a corrected candidate without mutating the shared catalog', async () => {
    mockValidatePart
      .mockResolvedValueOnce('not_found')
      .mockResolvedValueOnce('exists');

    const req = new NextRequest(
      'http://localhost/api/parts/bricklink/validate?blPartId=3957a&rbPartId=3957a',
      {
        method: 'GET',
      }
    );

    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      validBlPartId: '3957',
      corrected: true,
    });
    expect(mockGetCatalogWriteClient).not.toHaveBeenCalled();
  });
});
