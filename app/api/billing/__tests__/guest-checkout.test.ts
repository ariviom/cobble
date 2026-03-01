import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock server-only before importing the route
vi.mock('server-only', () => ({}));

// Mock metrics
vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock Stripe client
const mockCheckoutSessionsCreate = vi.fn();
vi.mock('@/app/lib/stripe/client', () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
  })),
}));

// Mock rate limiter
const mockConsumeRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock('@/lib/rateLimit', () => ({
  consumeRateLimit: (...args: unknown[]) => mockConsumeRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

// Mock billing service — mapPriceToTier
const mockMapPriceToTier = vi.fn();
vi.mock('@/app/lib/services/billing', () => ({
  mapPriceToTier: (...args: unknown[]) => mockMapPriceToTier(...args),
}));

import { NextRequest } from 'next/server';

import { POST } from '../guest-checkout/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/billing/guest-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_PRICE_ID = 'price_plus_monthly';

describe('POST /api/billing/guest-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.STRIPE_CHECKOUT_SUCCESS_URL = 'https://example.com/success';
    process.env.STRIPE_CHECKOUT_CANCEL_URL = 'https://example.com/cancel';

    mockConsumeRateLimit.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
    });
    mockGetClientIp.mockResolvedValue('127.0.0.1');

    mockMapPriceToTier.mockReturnValue({
      tier: 'plus',
      cadence: 'monthly',
    });

    mockCheckoutSessionsCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/session_123',
    });
  });

  describe('rate limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      mockConsumeRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 42,
      });

      const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.error).toBe('rate_limited');
      expect(res.headers.get('Retry-After')).toBe('42');
    });

    it('does not call Stripe when rate limited', async () => {
      mockConsumeRateLimit.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 10,
      });

      await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('rejects missing priceId', async () => {
      const res = await POST(makeRequest({}));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('rejects empty priceId', async () => {
      const res = await POST(makeRequest({ priceId: '' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('rejects non-string priceId', async () => {
      const res = await POST(makeRequest({ priceId: 123 }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 for malformed JSON body', async () => {
      const req = new NextRequest(
        'http://localhost/api/billing/guest-checkout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{{not json',
        }
      );

      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 for empty body', async () => {
      const req = new NextRequest(
        'http://localhost/api/billing/guest-checkout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const res = await POST(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });
  });

  describe('price validation', () => {
    it('rejects unknown priceId', async () => {
      mockMapPriceToTier.mockImplementation(() => {
        throw new Error('Unknown Stripe price id: price_invalid');
      });

      const res = await POST(makeRequest({ priceId: 'price_invalid' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('invalid_format');
      expect(json.message).toBe('Unknown priceId');
    });
  });

  describe('successful checkout', () => {
    it('creates a Stripe checkout session and returns URL', async () => {
      const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.url).toBe('https://checkout.stripe.com/session_123');
    });

    it('passes correct parameters to Stripe', async () => {
      await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledTimes(1);
      const args = mockCheckoutSessionsCreate.mock.calls[0][0];

      expect(args.mode).toBe('subscription');
      expect(args.customer_creation).toBe('always');
      expect(args.line_items).toEqual([{ price: VALID_PRICE_ID, quantity: 1 }]);
      expect(args.success_url).toBe('https://example.com/success');
      expect(args.cancel_url).toBe('https://example.com/cancel');
      expect(args.allow_promotion_codes).toBe(false);
      expect(args.automatic_tax).toEqual({ enabled: true });
    });

    it('sets guest metadata on session and subscription_data', async () => {
      await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      const args = mockCheckoutSessionsCreate.mock.calls[0][0];

      expect(args.metadata).toEqual({ guest: 'true' });
      expect(args.subscription_data).toEqual({
        trial_period_days: 14,
        metadata: { guest: 'true' },
      });
    });

    it('does not pass customer param', async () => {
      await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      const args = mockCheckoutSessionsCreate.mock.calls[0][0];
      expect(args.customer).toBeUndefined();
    });

    it('does not pass client_reference_id', async () => {
      await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      const args = mockCheckoutSessionsCreate.mock.calls[0][0];
      expect(args.client_reference_id).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('returns 500 when Stripe session has no URL', async () => {
      mockCheckoutSessionsCreate.mockResolvedValue({ url: null });

      const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('unknown_error');
      expect(json.message).toBe('Failed to create checkout session');
    });

    it('returns 500 when Stripe throws', async () => {
      mockCheckoutSessionsCreate.mockRejectedValue(
        new Error('Stripe API error')
      );

      const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('unknown_error');
    });

    it('returns 500 when success URL env is missing', async () => {
      delete process.env.STRIPE_CHECKOUT_SUCCESS_URL;

      const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('unknown_error');
    });

    it('returns 500 when cancel URL env is missing', async () => {
      delete process.env.STRIPE_CHECKOUT_CANCEL_URL;

      const res = await POST(makeRequest({ priceId: VALID_PRICE_ID }));

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('unknown_error');
    });
  });
});
