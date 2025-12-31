import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock the entitlements service
vi.mock('@/app/lib/services/entitlements', () => ({
  getEntitlements: vi.fn(),
}));

// Mock Supabase auth client
const mockGetUser = vi.fn();
vi.mock('@/app/lib/supabaseAuthServerClient', () => ({
  getSupabaseAuthServerClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

// Mock metrics
vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getEntitlements } from '@/app/lib/services/entitlements';
import { GET } from '../route';

const mockGetEntitlements = vi.mocked(getEntitlements);

describe('GET /api/entitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('unauthenticated users', () => {
    it('returns free tier when no user', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tier).toBe('free');
      expect(json.features).toEqual([]);
    });

    it('returns 401 when auth error occurs', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const res = await GET();

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('unauthorized');
    });
  });

  describe('authenticated users', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    it('returns free tier for user without subscription', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockGetEntitlements.mockResolvedValue({
        tier: 'free',
        features: [],
        featureFlagsByKey: {},
      });

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tier).toBe('free');
      expect(json.features).toEqual([]);
      expect(mockGetEntitlements).toHaveBeenCalledWith('user-123');
    });

    it('returns pro tier with features for subscriber', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockGetEntitlements.mockResolvedValue({
        tier: 'pro',
        features: ['identify', 'pricing', 'export'],
        featureFlagsByKey: {},
      });

      const res = await GET();

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tier).toBe('pro');
      expect(json.features).toEqual(['identify', 'pricing', 'export']);
    });

    it('returns 500 when entitlements service throws', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockGetEntitlements.mockRejectedValue(new Error('Database error'));

      const res = await GET();

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('unknown_error');
    });
  });
});
