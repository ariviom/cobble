import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the Supabase service role client before importing billing
const mockFrom = vi.fn();
const mockGetUserById = vi.fn();
const mockSupabase = {
  from: mockFrom,
  auth: { admin: { getUserById: mockGetUserById } },
};

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => mockSupabase,
}));

vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: () => ({}),
}));

import { getUserEntitlements } from '@/app/lib/services/billing';

// Helper to build a Supabase query chain mock (multi-row result, thenable)
function mockQuery(
  data: unknown[] | null,
  error: { message: string } | null = null
) {
  const result = { data, error };
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        ...result,
        then: (resolve: (v: typeof result) => void) =>
          Promise.resolve(result).then(resolve),
      }),
    }),
  };
}

// Helper for single-row result (.maybeSingle())
function mockSingleQuery(
  data: unknown | null,
  error: { message: string } | null = null
) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

// Helper to configure the auth.admin.getUserById mock
function mockAuthUser(
  email: string | null,
  error: { message: string } | null = null
) {
  if (error) {
    mockGetUserById.mockResolvedValue({ data: null, error });
  } else {
    mockGetUserById.mockResolvedValue({
      data: { user: { email } },
      error: null,
    });
  }
}

describe('getUserEntitlements with overrides', () => {
  const userId = 'user-123';
  const userEmail = 'vip@example.com';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns subscription tier when no override exists', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery(null);
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(userEmail);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('returns override tier when no active subscription', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(userEmail);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('uses email from billing_customers when available (skips auth lookup)', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });
    mockGetUserById.mockRejectedValue(new Error('should not be called'));

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
      expect(mockGetUserById).not.toHaveBeenCalled();
    });
  });

  it('returns higher tier when both override and subscription exist (floor behavior)', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('subscription wins when higher than override', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'pro', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('pro');
    });
  });

  it('override wins when higher than subscription', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'pro' });
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('pro');
    });
  });

  it('falls back to subscription tier when override lookup fails', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([{ tier: 'plus', status: 'active' }]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery({ email: userEmail });
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery(null, { message: 'db error' });
      }
      return mockSingleQuery(null);
    });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });

  it('returns free when no subscription and no override', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery(null);
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(userEmail);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('free');
    });
  });

  it('returns free when email lookup fails entirely', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(null, { message: 'auth error' });

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('free');
    });
  });

  it('returns free when auth returns user with null email', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      return mockSingleQuery(null);
    });
    mockAuthUser(null);

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('free');
    });
  });

  it('lowercases email before override lookup', () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') {
        return mockQuery([]);
      }
      if (table === 'billing_customers') {
        return mockSingleQuery(null);
      }
      if (table === 'billing_entitlement_overrides') {
        return mockSingleQuery({ tier: 'plus' });
      }
      return mockSingleQuery(null);
    });
    mockAuthUser('VIP@EXAMPLE.COM');

    return getUserEntitlements(userId).then(result => {
      expect(result.tier).toBe('plus');
    });
  });
});
