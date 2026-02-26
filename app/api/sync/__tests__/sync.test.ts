import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock CSRF middleware to pass through
vi.mock('@/app/lib/middleware/csrf', () => ({
  withCsrfProtection: (
    handler: (req: NextRequest) => Promise<NextResponse> | NextResponse
  ) => handler,
}));

// Mock rate limiting to avoid blocking authenticated requests
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: vi
    .fn()
    .mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
}));

// Mock Supabase auth client
const mockGetUser = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn().mockReturnValue({
      upsert: mockUpsert,
      delete: vi.fn().mockReturnValue({
        eq: mockEq.mockReturnValue({
          eq: mockEq.mockReturnValue({
            eq: mockEq.mockReturnValue({
              eq: mockEq.mockReturnValue({
                eq: mockDelete,
              }),
            }),
          }),
        }),
      }),
    }),
    rpc: mockRpc,
  })),
}));

// Mock metrics
vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { GET, POST } from '../route';

describe('/api/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    mockDelete.mockResolvedValue({ error: null });
    mockRpc.mockResolvedValue({ error: null });
  });

  describe('GET /api/sync (ping)', () => {
    it('returns ok: true', async () => {
      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });

  describe('POST /api/sync', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    describe('authentication', () => {
      it('returns 401 when not authenticated', async () => {
        mockGetUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Not authenticated' },
        });

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations: [] }),
        });

        const res = await POST(req);

        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toBe('unauthorized');
      });
    });

    describe('validation', () => {
      beforeEach(() => {
        mockGetUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });
      });

      it('returns 400 for empty operations array', async () => {
        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations: [] }),
        });

        const res = await POST(req);

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('validation_failed');
      });

      it('returns 400 for missing operations field', async () => {
        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({}),
        });

        const res = await POST(req);

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('validation_failed');
      });

      it('returns 400 for invalid operation structure', async () => {
        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({
            operations: [{ id: 'not-a-number', table: 'invalid' }],
          }),
        });

        const res = await POST(req);

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('validation_failed');
      });

      it('returns 400 for too many operations', async () => {
        const operations = Array.from({ length: 101 }, (_, i) => ({
          id: i,
          table: 'user_set_parts',
          operation: 'upsert',
          payload: {
            set_num: '75192-1',
            part_num: '3001',
            color_id: 1,
            owned_quantity: 1,
          },
        }));

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('validation_failed');
      });
    });

    describe('successful operations', () => {
      beforeEach(() => {
        mockGetUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });
      });

      it('processes upsert operations', async () => {
        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
              owned_quantity: 5,
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.processed).toBe(1);
        expect(json.failed).toBeUndefined();
      });

      it('processes delete operations', async () => {
        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'delete',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.processed).toBe(1);
      });

      it('handles mixed operations', async () => {
        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
              owned_quantity: 5,
            },
          },
          {
            id: 2,
            table: 'user_set_parts',
            operation: 'delete',
            payload: {
              set_num: '75192-1',
              part_num: '3002',
              color_id: 4,
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.processed).toBe(2);
      });

      it('defaults is_spare to false', async () => {
        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
              owned_quantity: 1,
              // is_spare not provided
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(mockUpsert).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        mockGetUser.mockResolvedValue({
          data: { user: mockUser },
          error: null,
        });
      });

      it('reports partial failures', async () => {
        mockUpsert.mockResolvedValue({
          error: { message: 'Database constraint violation' },
        });

        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
              owned_quantity: 1,
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.processed).toBe(0);
        expect(json.failed).toHaveLength(1);
        expect(json.failed[0].id).toBe(1);
        expect(json.failed[0].error).toContain('upsert_failed');
      });

      it('retries rows individually when batch upsert fails', async () => {
        // First call (batch) fails, subsequent individual retries succeed
        mockUpsert
          .mockResolvedValueOnce({ error: { message: 'FK violation' } })
          .mockResolvedValue({ error: null });

        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
              owned_quantity: 3,
            },
          },
          {
            id: 2,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3002',
              color_id: 4,
              owned_quantity: 1,
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.processed).toBe(2);
        expect(json.failed).toBeUndefined();
        // 1 batch call + 2 individual retries
        expect(mockUpsert).toHaveBeenCalledTimes(3);
      });

      it('reports individual row failures when batch and some retries fail', async () => {
        // Batch fails, first individual retry succeeds, second fails
        mockUpsert
          .mockResolvedValueOnce({ error: { message: 'FK violation' } })
          .mockResolvedValueOnce({ error: null })
          .mockResolvedValueOnce({
            error: { message: 'part_num not in rb_parts' },
          });

        const operations = [
          {
            id: 1,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: '3001',
              color_id: 1,
              owned_quantity: 3,
            },
          },
          {
            id: 2,
            table: 'user_set_parts',
            operation: 'upsert',
            payload: {
              set_num: '75192-1',
              part_num: 'bad-part',
              color_id: 4,
              owned_quantity: 1,
            },
          },
        ];

        const req = new NextRequest('http://localhost/api/sync', {
          method: 'POST',
          body: JSON.stringify({ operations }),
        });

        const res = await POST(req);

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(false);
        expect(json.processed).toBe(1);
        expect(json.failed).toHaveLength(1);
        expect(json.failed[0].id).toBe(2);
        expect(json.failed[0].error).toContain('part_num not in rb_parts');
      });
    });
  });
});
