import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT } from '@/app/lib/constants';
import { getEnvOrThrow } from '@/app/lib/env';
import { mapPriceToTier } from '@/app/lib/services/billing';
import { getStripeClient } from '@/app/lib/stripe/client';
import { logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';

const schema = z.object({
  priceId: z.string().min(1),
});

// No CSRF protection — this endpoint is unauthenticated (no session to protect).
// IP-based rate limiting provides abuse prevention instead.
export async function POST(req: NextRequest) {
  // IP-based rate limit
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`guest-checkout:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.GUEST_CHECKOUT_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation_failed', {
      message: 'Invalid JSON body',
      status: 400,
    });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const priceId = parsed.data.priceId;

  try {
    mapPriceToTier(priceId);
  } catch {
    return errorResponse('invalid_format', {
      message: 'Unknown priceId',
      status: 400,
    });
  }

  const stripe = getStripeClient();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_creation: 'always',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: getEnvOrThrow('STRIPE_CHECKOUT_SUCCESS_URL'),
      cancel_url: getEnvOrThrow('STRIPE_CHECKOUT_CANCEL_URL'),
      allow_promotion_codes: false,
      automatic_tax: { enabled: true },
      subscription_data: {
        trial_period_days: 14,
        metadata: { guest: 'true' },
      },
      metadata: { guest: 'true' },
    });

    if (!session.url) {
      return errorResponse('unknown_error', {
        message: 'Failed to create checkout session',
        status: 500,
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error('billing.guest_checkout_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
}
