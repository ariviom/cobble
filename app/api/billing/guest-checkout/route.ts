import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { mapPriceToTier } from '@/app/lib/services/billing';
import { getStripeClient } from '@/app/lib/stripe/client';
import { logger } from '@/lib/metrics';

const schema = z.object({
  priceId: z.string().min(1),
});

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function POST(req: NextRequest) {
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
