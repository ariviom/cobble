import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import {
  ensureStripeCustomer,
  mapPriceToTier,
} from '@/app/lib/services/billing';
import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
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

export const POST = withCsrfProtection(async (req: NextRequest) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: parsed.error.flatten(),
      status: 400,
    });
  }

  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized', { status: 401 });
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
    const customerId = await ensureStripeCustomer(user, { stripe });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: getEnvOrThrow('STRIPE_CHECKOUT_SUCCESS_URL'),
      cancel_url: getEnvOrThrow('STRIPE_CHECKOUT_CANCEL_URL'),
      allow_promotion_codes: false,
      automatic_tax: { enabled: true },
      client_reference_id: user.id,
      subscription_data: {
        metadata: { user_id: user.id },
        trial_period_days: 14,
      },
      metadata: { user_id: user.id },
    });

    if (!session.url) {
      return errorResponse('unknown_error', {
        message: 'Failed to create checkout session',
        status: 500,
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error('billing.create_checkout_session_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
});
