import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getPriceAllowlist, mapPriceToTier } from '@/app/lib/services/billing';

const originalEnv = { ...process.env };

describe('billing price allowlist', () => {
  beforeEach(() => {
    process.env.STRIPE_PRICE_PLUS_MONTHLY = 'price_plus_monthly';
    process.env.STRIPE_PRICE_PRO_MONTHLY = 'price_pro_monthly';
    delete process.env.STRIPE_PRICE_PLUS_YEARLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds an allowlist with required monthly prices', () => {
    const allowlist = getPriceAllowlist();
    expect(allowlist).toEqual({
      price_plus_monthly: { tier: 'plus', cadence: 'monthly' },
      price_pro_monthly: { tier: 'pro', cadence: 'monthly' },
    });
  });

  it('includes yearly prices when present', () => {
    process.env.STRIPE_PRICE_PLUS_YEARLY = 'price_plus_yearly';
    process.env.STRIPE_PRICE_PRO_YEARLY = 'price_pro_yearly';

    const allowlist = getPriceAllowlist();
    expect(allowlist).toMatchObject({
      price_plus_yearly: { tier: 'plus', cadence: 'yearly' },
      price_pro_yearly: { tier: 'pro', cadence: 'yearly' },
    });
  });

  it('maps a known price id to tier', () => {
    const result = mapPriceToTier('price_plus_monthly');
    expect(result).toEqual({ tier: 'plus', cadence: 'monthly' });
  });

  it('throws on unknown price id', () => {
    expect(() => mapPriceToTier('unknown')).toThrow('Unknown Stripe price id');
  });
});
