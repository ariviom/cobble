import 'server-only';

import Stripe from 'stripe';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import type { Database } from '@/supabase/types';
import { logger } from '@/lib/metrics';

export type BillingTier = 'free' | 'plus' | 'pro';
export type BillingCadence = 'monthly' | 'yearly';

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

  const customer = await stripe.customers.create(
    {
      ...(user.email ? { email: user.email } : {}),
      metadata: { user_id: user.id },
    },
    { idempotencyKey: `create-customer-${user.id}` }
  );

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

/**
 * Look up a Supabase auth user by email using the GoTrue admin REST API.
 *
 * Uses the `filter` query parameter for server-side SQL filtering,
 * then verifies exact email match client-side (filter is a LIKE/substring match).
 */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    logger.error('billing.find_user_missing_env', {
      hasUrl: !!supabaseUrl,
      hasKey: !!serviceRoleKey,
    });
    return null;
  }

  try {
    const url = `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email.toLowerCase())}`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });

    if (!res.ok) {
      logger.error('billing.find_user_rest_failed', {
        email,
        status: res.status,
      });
      return null;
    }

    const data: { users?: Array<{ id: string; email?: string }> } =
      await res.json();
    const match = data.users?.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );
    return match ? { id: match.id } : null;
  } catch (err) {
    logger.error('billing.find_user_request_failed', {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Resolve (or create) a Supabase user for a guest checkout by email.
 *
 * 1. Look up existing user by email (covers Google OAuth, prior signups)
 * 2. If not found, invite via admin API — creates the user immediately and
 *    sends an invite email to set their password
 * 3. Return the user_id for linking billing records
 */
export async function resolveGuestCheckoutUser(
  email: string,
  options?: { supabase?: SupabaseClient<Database> }
): Promise<string> {
  const supabase = options?.supabase ?? getSupabaseServiceRoleClient();

  // Step 1: Check for existing user
  const existing = await findUserByEmail(email);

  if (existing) {
    logger.info('billing.guest_user_resolved_existing', {
      email,
      userId: existing.id,
    });
    return existing.id;
  }

  // Step 2: Invite new user
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/auth/callback?next=/sets`;

  const { data: inviteData, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });

  if (inviteError) {
    // Race condition: another webhook may have created the user concurrently
    const isAlreadyRegistered =
      inviteError.message?.includes('already been registered') ?? false;

    if (isAlreadyRegistered) {
      logger.info('billing.guest_invite_race_condition', { email });
      const retryLookup = await findUserByEmail(email);
      if (retryLookup) {
        return retryLookup.id;
      }
    }

    logger.error('billing.guest_invite_failed', {
      email,
      error: inviteError.message,
    });
    throw new Error(`Failed to invite guest user: ${inviteError.message}`);
  }

  if (!inviteData?.user) {
    throw new Error('Invite succeeded but no user returned');
  }

  logger.info('billing.guest_user_invited', {
    email,
    userId: inviteData.user.id,
  });

  return inviteData.user.id;
}
