import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (
    handler: (
      req: import('next/server').NextRequest,
      context: { params: Promise<{ setNumber: string }> }
    ) => Promise<import('next/server').NextResponse>
  ) => handler,
}));

const mockGetSetSummary = vi.fn();
vi.mock('@/app/lib/rebrickable', () => ({
  getSetSummary: (...args: unknown[]) => mockGetSetSummary(...args),
}));

const mockGetUser = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

const mockGetCatalogWriteClient = vi.fn();
const mockCatalogUpdate = vi.fn().mockReturnThis();
const mockCatalogEq = vi.fn();
vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogWriteClient: () => mockGetCatalogWriteClient(),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { POST } from '../[setNumber]/refresh-image/route';

describe('POST /api/sets/[setNumber]/refresh-image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockGetSetSummary.mockResolvedValue({
      imageUrl: 'https://cdn.rebrickable.com/media/sets/1234-1.jpg',
    });
    mockGetCatalogWriteClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: mockCatalogUpdate,
        eq: mockCatalogEq.mockResolvedValue({ error: null }),
      }),
    });
  });

  it('returns the fresh image URL without writing to the shared catalog', async () => {
    const req = new NextRequest(
      'http://localhost/api/sets/1234-1/refresh-image',
      {
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({ setNumber: '1234-1' }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      imageUrl: 'https://cdn.rebrickable.com/media/sets/1234-1.jpg',
    });
    expect(mockGetCatalogWriteClient).not.toHaveBeenCalled();
  });
});
