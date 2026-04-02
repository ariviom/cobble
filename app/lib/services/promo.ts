import 'server-only';

import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';

import { invalidateEntitlements } from './entitlements';

type PromoValidationResult =
  | { valid: true; couponId: string; promoCodeId: string }
  | { valid: false };

export async function validatePromoCode(
  code: string
): Promise<PromoValidationResult> {
  const stripe = getStripeClient();

  try {
    const promos = await stripe.promotionCodes.list({
      code,
      active: true,
      limit: 1,
    });

    const promo = promos.data[0];
    if (!promo) {
      return { valid: false };
    }

    const coupon = promo.promotion?.coupon;
    if (!coupon) {
      return { valid: false };
    }

    // coupon may be a string (ID) or expanded object depending on the response
    const couponId = typeof coupon === 'string' ? coupon : coupon.id;
    const isValid = typeof coupon === 'string' ? true : coupon.valid;

    if (!isValid) {
      return { valid: false };
    }

    return {
      valid: true,
      couponId,
      promoCodeId: promo.id,
    };
  } catch (err) {
    logger.error('promo.validate_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { valid: false };
  }
}

type RedeemResult = { success: true } | { success: false; error: string };

export async function redeemPromoCode(params: {
  userId: string;
  stripeCustomerId: string;
  couponId: string;
}): Promise<RedeemResult> {
  const { userId, stripeCustomerId, couponId } = params;
  const stripe = getStripeClient();
  const supabase = getSupabaseServiceRoleClient();

  // Check for existing active subscription
  const { data: existingSub } = await supabase
    .from('billing_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .limit(1)
    .maybeSingle();

  if (existingSub) {
    return {
      success: false,
      error: 'You already have an active subscription.',
    };
  }

  try {
    const priceId = process.env.STRIPE_PRICE_PLUS_MONTHLY;
    if (!priceId) {
      throw new Error('STRIPE_PRICE_PLUS_MONTHLY env var is not set');
    }

    await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      discounts: [{ coupon: couponId }],
      metadata: { user_id: userId, promo_redemption: 'true' },
    });

    // Invalidate entitlements cache — the webhook will upsert the subscription
    // row, but we can eagerly bust the cache so the next SSR load reflects Plus.
    invalidateEntitlements(userId);

    logger.info('promo.redeemed', { userId, couponId });

    return { success: true };
  } catch (err) {
    logger.error('promo.redeem_failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: 'Failed to apply promo code. Please try again.',
    };
  }
}
