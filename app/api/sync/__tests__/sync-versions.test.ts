import type { NextRequest } from 'next/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const mockGetUser = vi.fn();
const mockUpsert = vi.fn();
const mockRpc = vi.fn();
const mockConsumeRateLimit = vi.fn();

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockImplementation(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      upsert: mockUpsert,
      delete: () => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        }),
      }),
      update: () => ({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      }),
    })),
    rpc: mockRpc,
  })),
}));

vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (handler: (req: Request) => unknown) => handler,
}));

describe('POST /api/sync — versions response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mockConsumeRateLimit.mockResolvedValue({ allowed: true });
    mockUpsert.mockResolvedValue({ error: null });
    // update_found_count RPC returns nothing interesting
    mockRpc.mockResolvedValueOnce({ error: null });
    // get_max_sync_versions RPC returns version data
    mockRpc.mockResolvedValueOnce({
      data: [{ set_num: '75192-1', max_version: 42 }],
      error: null,
    });
  });

  it('returns versions map after successful user_set_parts upserts', async () => {
    const { POST } = await import('@/app/api/sync/route');

    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 11,
              is_spare: false,
              owned_quantity: 3,
            },
          },
        ],
      }),
    });

    const response = await POST(req as NextRequest);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.versions).toBeDefined();
    expect(body.versions['75192-1']).toBe(42);
    expect(mockRpc).toHaveBeenCalledWith('get_max_sync_versions', {
      p_user_id: 'user-1',
      p_set_nums: ['75192-1'],
    });
  });

  it('omits versions when no user_set_parts operations', async () => {
    const { POST } = await import('@/app/api/sync/route');

    const req = new Request('http://localhost/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operations: [
          {
            id: 1,
            table: 'user_loose_parts',
            operation: 'upsert',
            payload: {
              part_num: '3001',
              color_id: 11,
              loose_quantity: 5,
            },
          },
        ],
      }),
    });

    const response = await POST(req as NextRequest);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.versions).toBeUndefined();
  });
});
