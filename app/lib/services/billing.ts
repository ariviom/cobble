import 'server-only';

import Stripe from 'stripe';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Database } from '@/supabase/types';
import { logger } from '@/lib/metrics';

export type BillingTier = 'free' | 'plus' | 'pro';
export type BillingCadence = 'monthly' | 'yearly';

const BETA_ALL_ACCESS_ENV = 'BETA_ALL_ACCESS';

type PriceEntry = { tier: BillingTier; cadence: BillingCadence };

const REQUIRED_PRICE_ENVS: Array<{
  env: string;
  tier: BillingTier;
  cadence: BillingCadence;
  optional?: boolean;
}> = [
  { env: 'STRIPE_PRICE_PLUS_MONTHLY', tier: 'plus', cadence: 'monthly' },
  { env: 'STRIPE_PRICE_PRO_MONTHLY', tier: 'pro', cadence: 'monthly' },
  {
    env: 'STRIPE_PRICE_PLUS_YEARLY',
    tier: 'plus',
    cadence: 'yearly',
    optional: true,
  },
  {
    env: 'STRIPE_PRICE_PRO_YEARLY',
    tier: 'pro',
    cadence: 'yearly',
    optional: true,
  },
];

const ACTIVE_STATUSES: Stripe.Subscription.Status[] = ['active', 'trialing'];

const CANCEL_TO_FREE: Stripe.Subscription.Status[] = [
  'canceled',
  'unpaid',
  'incomplete_expired',
];

function getEnv(name: string): string | undefined {
  return process.env[name] ?? undefined;
}

export function getPriceAllowlist(): Record<string, PriceEntry> {
  const map: Record<string, PriceEntry> = {};
  for (const entry of REQUIRED_PRICE_ENVS) {
    const value = getEnv(entry.env);
    if (!value) {
      if (entry.optional) continue;
      throw new Error(`Missing required Stripe price env: ${entry.env}`);
    }
    map[value] = { tier: entry.tier, cadence: entry.cadence };
  }
  return map;
}

export function mapPriceToTier(priceId: string): PriceEntry {
  const allowlist = getPriceAllowlist();
  const match = allowlist[priceId];
  if (!match) {
    throw new Error(`Unknown Stripe price id: ${priceId}`);
  }
  return match;
}

export async function ensureStripeCustomer(
  user: User,
  options?: {
    supabase?: SupabaseClient<Database>;
    stripe?: Stripe;
  }
): Promise<string> {
  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();
  const stripe = options?.stripe ?? getStripeClient();

  const { data: existing, error: existingError } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }
  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    ...(user.email ? { email: user.email } : {}),
    metadata: { user_id: user.id },
  });

  const { error: insertError } = await supabase
    .from('billing_customers')
    .upsert({
      user_id: user.id,
      stripe_customer_id: customer.id,
      email: user.email ?? null,
    });

  if (insertError) {
    throw insertError;
  }

  return customer.id;
}

async function getUserIdForCustomer(
  stripeCustomerId: string,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  const { data, error } = await supabase
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (error) {
    logger.error('billing.customer_lookup_failed', { error: error.message });
    return null;
  }
  return data?.user_id ?? null;
}

function resolveEffectiveTier(
  status: Stripe.Subscription.Status,
  priceTier: BillingTier
): BillingTier {
  if (CANCEL_TO_FREE.includes(status)) {
    return 'free';
  }
  return priceTier;
}

export async function upsertSubscriptionFromStripe(
  subscription: Stripe.Subscription,
  options?: {
    userId?: string;
    supabase?: SupabaseClient<Database>;
  }
): Promise<{
  userId: string;
  tier: BillingTier;
  status: Stripe.Subscription.Status;
}> {
  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();

  const stripePriceId = subscription.items.data[0]?.price?.id;
  if (!stripePriceId) {
    throw new Error('Subscription is missing price id');
  }

  const { tier: priceTier } = mapPriceToTier(stripePriceId);
  const effectiveTier = resolveEffectiveTier(subscription.status, priceTier);

  const userId =
    options?.userId ??
    (typeof subscription.customer === 'string'
      ? await getUserIdForCustomer(subscription.customer, supabase)
      : null) ??
    (subscription.metadata?.user_id as string | undefined) ??
    null;

  if (!userId) {
    throw new Error('Unable to resolve user_id for subscription');
  }

  const firstItem = subscription.items.data[0];
  const product = firstItem?.price?.product;
  const stripeProductId =
    typeof product === 'string'
      ? product
      : product && !('deleted' in product)
        ? (product.id as string)
        : '';
  const currentPeriodEnd = (() => {
    const value = (subscription as unknown as Record<string, unknown>)[
      'current_period_end'
    ];
    return typeof value === 'number' ? value : null;
  })();

  const { error: upsertError } = await supabase
    .from('billing_subscriptions')
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: stripePriceId,
        stripe_product_id: stripeProductId,
        tier: effectiveTier,
        status: subscription.status,
        current_period_end: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end ?? false,
        quantity: firstItem?.quantity ?? 1,
        metadata:
          subscription.metadata && Object.keys(subscription.metadata).length > 0
            ? subscription.metadata
            : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_subscription_id' }
    );

  if (upsertError) {
    throw upsertError;
  }

  return { userId, tier: effectiveTier, status: subscription.status };
}

export async function getUserEntitlements(
  userId: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<{ tier: BillingTier; features: string[] }> {
  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();

  // Beta override: treat everyone as plus when flag is set (no pro gating yet).
  if (process.env[BETA_ALL_ACCESS_ENV] === 'true') {
    return { tier: 'plus', features: [] };
  }

  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('tier,status')
    .eq('user_id', userId);

  if (error) {
    logger.error('billing.entitlements_query_failed', { error: error.message });
    return { tier: 'free', features: [] };
  }

  const tierRank: Record<BillingTier, number> = { free: 0, plus: 1, pro: 2 };
  let bestTier: BillingTier = 'free';

  for (const row of data ?? []) {
    if (!row.tier || !row.status) continue;
    if (!ACTIVE_STATUSES.includes(row.status as Stripe.Subscription.Status)) {
      continue;
    }
    if (tierRank[row.tier as BillingTier] > tierRank[bestTier]) {
      bestTier = row.tier as BillingTier;
    }
  }

  return { tier: bestTier, features: [] };
}
