import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { ensureStripeCustomer } from '@/app/lib/services/billing';
import { validatePromoCode, redeemPromoCode } from '@/app/lib/services/promo';
import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

const schema = z.object({
  code: z.string().min(1).max(100),
});

export const POST = withCsrfProtection(async (req: NextRequest) => {
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

  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized', { status: 401 });
  }

  const code = parsed.data.code.trim().toUpperCase();

  // Step 1: Validate the promo code against Stripe
  const validation = await validatePromoCode(code);
  if (!validation.valid) {
    return errorResponse('validation_failed', {
      message: 'Invalid or expired promo code.',
      status: 400,
    });
  }

  try {
    // Step 2: Ensure user has a Stripe customer record
    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(user, { stripe });

    // Step 3: Create the coupon-backed subscription
    const result = await redeemPromoCode({
      userId: user.id,
      stripeCustomerId: customerId,
      couponId: validation.couponId,
    });

    if (!result.success) {
      return errorResponse('validation_failed', {
        message: result.error,
        status: 400,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('billing.redeem_promo_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
});
