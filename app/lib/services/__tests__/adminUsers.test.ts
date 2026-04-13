import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const rangeMock = vi.fn();
const ilikeMock = vi.fn(() => ({ range: rangeMock }));
const orderMock = vi.fn(() => ({ ilike: ilikeMock, range: rangeMock }));
const selectMock = vi.fn(() => ({ order: orderMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({ from: fromMock }),
}));

import { listAdminUsers } from '@/app/lib/services/adminUsers';

describe('listAdminUsers', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
    orderMock.mockClear();
    ilikeMock.mockClear();
    rangeMock.mockReset();
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
