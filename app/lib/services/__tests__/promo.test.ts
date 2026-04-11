import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: vi.fn(),
}));
vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: vi.fn(),
}));
vi.mock('@/lib/metrics', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/app/lib/services/entitlements', () => ({
  invalidateEntitlements: vi.fn(),
}));

import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { validatePromoCode, redeemPromoCode } from '../promo';

const mockStripe = {
  promotionCodes: {
    list: vi.fn(),
  },
  subscriptions: {
    create: vi.fn(),
  },
};

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn(),
  limit: vi.fn().mockReturnThis(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStripeClient).mockReturnValue(mockStripe as never);
  vi.mocked(getSupabaseServiceRoleClient).mockReturnValue(
    mockSupabase as never
  );
  mockSupabase.from.mockReturnThis();
  mockSupabase.select.mockReturnThis();
  mockSupabase.eq.mockReturnThis();
  mockSupabase.in.mockReturnThis();
  mockSupabase.limit.mockReturnThis();
});

describe('validatePromoCode', () => {
  it('returns coupon when promo code is valid and active', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_123',
          active: true,
          promotion: {
            coupon: {
              id: 'AVtCbgeC',
              valid: true,
              percent_off: 100,
              duration: 'repeating',
              duration_in_months: 3,
            },
          },
        },
      ],
    });

    const result = await validatePromoCode('BRICKPARTYBETA');
    expect(result).toEqual({
      valid: true,
      couponId: 'AVtCbgeC',
      promoCodeId: 'promo_123',
    });
    expect(mockStripe.promotionCodes.list).toHaveBeenCalledWith({
      code: 'BRICKPARTYBETA',
      active: true,
      limit: 1,
    });
  });

  it('returns invalid when no matching promo code exists', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({ data: [] });

    const result = await validatePromoCode('INVALIDCODE');
    expect(result).toEqual({ valid: false });
  });

  it('returns coupon when promotion.coupon is a string ID (not expanded)', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_789',
          active: true,
          promotion: {
            coupon: 'AVtCbgeC',
          },
        },
      ],
    });

    const result = await validatePromoCode('BRICKPARTYBETA');
    expect(result).toEqual({
      valid: true,
      couponId: 'AVtCbgeC',
      promoCodeId: 'promo_789',
    });
  });

  it('returns invalid when coupon is not valid', async () => {
    mockStripe.promotionCodes.list.mockResolvedValue({
      data: [
        {
          id: 'promo_456',
          active: true,
          promotion: {
            coupon: { id: 'coupon_expired', valid: false },
          },
        },
      ],
    });

    const result = await validatePromoCode('EXPIREDCODE');
    expect(result).toEqual({ valid: false });
  });
});

describe('redeemPromoCode', () => {
  it('creates a subscription with the coupon when user has no active sub', async () => {
    process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_plus_monthly';
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

    mockStripe.subscriptions.create.mockResolvedValue({
      id: 'sub_promo_123',
      status: 'active',
    });

    const result = await redeemPromoCode({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      couponId: 'AVtCbgeC',
    });

    expect(result).toEqual({ success: true });
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      {
        customer: 'cus_123',
        items: [{ price: 'price_plus_monthly' }],
        discounts: [{ coupon: 'AVtCbgeC' }],
        metadata: { user_id: 'user-1', promo_redemption: 'true' },
      },
      { idempotencyKey: 'promo-redeem:user-1:AVtCbgeC' }
    );
  });

  it('uses a stable idempotency key for promo redemption', async () => {
    process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_plus_monthly';
    mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

    mockStripe.subscriptions.create.mockResolvedValue({
      id: 'sub_promo_123',
      status: 'active',
    });

    await redeemPromoCode({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      couponId: 'AVtCbgeC',
    });

    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(
      {
        customer: 'cus_123',
        items: [{ price: 'price_plus_monthly' }],
        discounts: [{ coupon: 'AVtCbgeC' }],
        metadata: { user_id: 'user-1', promo_redemption: 'true' },
      },
      { idempotencyKey: 'promo-redeem:user-1:AVtCbgeC' }
    );
  });

  it('rejects when user already has an active subscription', async () => {
    mockSupabase.maybeSingle.mockResolvedValue({
      data: { id: 'existing-sub' },
      error: null,
    });

    const result = await redeemPromoCode({
      userId: 'user-1',
      stripeCustomerId: 'cus_123',
      couponId: 'AVtCbgeC',
    });

    expect(result).toEqual({
      success: false,
      error: 'You already have an active subscription.',
    });
    expect(mockStripe.subscriptions.create).not.toHaveBeenCalled();
  });
});
