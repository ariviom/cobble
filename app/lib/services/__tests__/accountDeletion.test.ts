import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mockCancel = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: vi.fn(() => ({
    subscriptions: {
      cancel: mockCancel,
    },
  })),
}));

const mockSubscriptionsQuery = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn(),
};

const mockGroupSessionsQuery = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn(),
};

const mockParticipantsQuery = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn(),
};

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'billing_subscriptions') return mockSubscriptionsQuery;
    if (table === 'group_sessions') return mockGroupSessionsQuery;
    if (table === 'group_session_participants') return mockParticipantsQuery;
    throw new Error(`Unexpected table ${table}`);
  }),
  auth: {
    admin: {
      deleteUser: mockDeleteUser,
    },
  },
};

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/metrics', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { deleteUserAccount } from '../accountDeletion';

describe('deleteUserAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSubscriptionsQuery.select.mockReturnThis();
    mockSubscriptionsQuery.eq.mockReturnThis();
    mockSubscriptionsQuery.in.mockResolvedValue({
      data: [{ stripe_subscription_id: 'sub_123', status: 'active' }],
      error: null,
    });

    mockGroupSessionsQuery.update.mockReturnThis();
    mockGroupSessionsQuery.eq
      .mockImplementationOnce(() => mockGroupSessionsQuery)
      .mockImplementationOnce(async () => ({ error: null }));

    mockParticipantsQuery.update.mockReturnThis();
    mockParticipantsQuery.eq.mockResolvedValue({ error: null });

    mockCancel.mockResolvedValue({ id: 'sub_123' });
    mockDeleteUser.mockResolvedValue({ error: null });
  });

  it('deletes the user after successful Stripe cleanup', async () => {
    await deleteUserAccount('user-1');

    expect(mockCancel).toHaveBeenCalledWith('sub_123', {
      invoice_now: false,
      prorate: false,
    });
    expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
  });

  it('throws and does not delete the user when Stripe cancellation fails', async () => {
    mockCancel.mockRejectedValue(new Error('stripe down'));

    await expect(deleteUserAccount('user-1')).rejects.toThrow(
      'Failed to cancel active subscriptions before account deletion'
    );

    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});
