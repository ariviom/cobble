import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  fromMock,
  rangeMock,
  ilikeMock,
  orderMock,
  selectMock,
  getUserByIdMock,
} = vi.hoisted(() => {
  const rangeMock = vi.fn();
  const ilikeMock = vi.fn();
  const orderMock = vi.fn();
  const selectMock = vi.fn();
  const fromMock = vi.fn();
  const getUserByIdMock = vi.fn();
  return {
    fromMock,
    rangeMock,
    ilikeMock,
    orderMock,
    selectMock,
    getUserByIdMock,
  };
});

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({
    from: fromMock,
    auth: {
      admin: {
        getUserById: getUserByIdMock,
      },
    },
  }),
}));

import { listAdminUsers } from '@/app/lib/services/adminUsers';

describe('listAdminUsers', () => {
  beforeEach(() => {
    fromMock.mockReset();
    selectMock.mockReset();
    orderMock.mockReset();
    ilikeMock.mockReset();
    rangeMock.mockReset();
    getUserByIdMock.mockReset();

    // Rebuild chain for listAdminUsers: from → select → order → (ilike?) → range
    ilikeMock.mockImplementation(() => ({ range: rangeMock }));
    orderMock.mockImplementation(() => ({
      ilike: ilikeMock,
      range: rangeMock,
    }));
    selectMock.mockImplementation(() => ({ order: orderMock }));
    fromMock.mockImplementation(() => ({ select: selectMock }));
  });

  it('queries admin_users_overview with default sort and pagination', async () => {
    rangeMock.mockResolvedValue({
      data: [
        {
          user_id: 'u1',
          email: 'a@example.com',
          username: 'alice',
          display_name: 'Alice',
          created_at: '2026-01-01T00:00:00Z',
          last_sign_in_at: '2026-04-10T00:00:00Z',
          owned_set_count: 3,
          tracked_set_count: 1,
          list_count: 2,
          subscription_tier: 'plus',
          subscription_status: 'active',
          subscription_period_end: null,
          subscription_cancel_at_period_end: false,
        },
      ],
      count: 42,
      error: null,
    });

    const result = await listAdminUsers({ page: 0, pageSize: 25 });

    expect(fromMock).toHaveBeenCalledWith('admin_users_overview');
    expect(selectMock).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(orderMock).toHaveBeenCalledWith('last_sign_in_at', {
      ascending: false,
      nullsFirst: false,
    });
    expect(rangeMock).toHaveBeenCalledWith(0, 24);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].username).toBe('alice');
    expect(result.total).toBe(42);
  });

  it('applies an ilike filter when q is provided', async () => {
    rangeMock.mockResolvedValue({ data: [], count: 0, error: null });

    await listAdminUsers({ q: 'bob', page: 1, pageSize: 25 });

    expect(ilikeMock).toHaveBeenCalledWith('username', 'bob%');
    expect(rangeMock).toHaveBeenCalledWith(25, 49);
  });

  it('returns empty result on error', async () => {
    rangeMock.mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'boom' },
    });

    const result = await listAdminUsers({ page: 0, pageSize: 25 });

    expect(result).toEqual({ rows: [], total: 0, page: 0, pageSize: 25 });
  });
});

describe('getAdminUserDetail', () => {
  beforeEach(() => {
    fromMock.mockReset();
    getUserByIdMock.mockReset();

    // Rebuild for detail: different chain shape per table.
    const billingChain: Record<string, unknown> = {};
    billingChain.select = vi.fn(() => billingChain);
    billingChain.eq = vi.fn(() => billingChain);
    billingChain.order = vi.fn(() => billingChain);
    billingChain.limit = vi.fn(() => billingChain);
    billingChain.maybeSingle = vi.fn();

    const overviewChain: Record<string, unknown> = {};
    overviewChain.select = vi.fn(() => overviewChain);
    overviewChain.eq = vi.fn(() => overviewChain);
    overviewChain.maybeSingle = vi.fn();

    fromMock.mockImplementation((table: string) => {
      if (table === 'billing_subscriptions') return billingChain;
      if (table === 'admin_users_overview') return overviewChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    // Store the chains on globals so each test can set resolved values.
    (
      globalThis as unknown as { __billingChain: typeof billingChain }
    ).__billingChain = billingChain;
    (
      globalThis as unknown as { __overviewChain: typeof overviewChain }
    ).__overviewChain = overviewChain;
  });

  it('returns null when the auth user does not exist', async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: null },
      error: { message: 'not found' },
    });

    const { getAdminUserDetail } = await import(
      '@/app/lib/services/adminUsers'
    );
    const detail = await getAdminUserDetail('missing');

    expect(detail).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns auth + profile + subscription + overview', async () => {
    getUserByIdMock.mockResolvedValue({
      data: {
        user: {
          id: 'u1',
          email: 'u@example.com',
          created_at: '2026-01-01',
          last_sign_in_at: '2026-04-10',
          app_metadata: { role: 'user' },
        },
      },
      error: null,
    });

    const billingChain = (
      globalThis as unknown as { __billingChain: Record<string, unknown> }
    ).__billingChain;
    (billingChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        user_id: 'u1',
        tier: 'plus',
        status: 'active',
        stripe_subscription_id: 'sub_1',
        stripe_price_id: 'price_1',
        current_period_end: '2026-05-01',
        cancel_at_period_end: false,
      },
      error: null,
    });

    const overviewChain = (
      globalThis as unknown as { __overviewChain: Record<string, unknown> }
    ).__overviewChain;
    (overviewChain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        user_id: 'u1',
        username: 'ursula',
        display_name: 'Ursula',
        owned_set_count: 5,
        tracked_set_count: 2,
        list_count: 1,
      },
      error: null,
    });

    const { getAdminUserDetail } = await import(
      '@/app/lib/services/adminUsers'
    );
    const detail = await getAdminUserDetail('u1');

    expect(detail).not.toBeNull();
    expect(detail!.authUser.email).toBe('u@example.com');
    expect(detail!.subscription?.tier).toBe('plus');
    expect(detail!.overview?.username).toBe('ursula');
    expect(detail!.overview?.owned_set_count).toBe(5);
  });
});
