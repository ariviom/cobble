import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { errorResponse } from '@/app/lib/api/responses';
import {
  resolveGuestCheckoutUser,
  upsertSubscriptionFromStripe,
} from '@/app/lib/services/billing';
import { invalidateEntitlements } from '@/app/lib/services/entitlements';
import {
  getStripeClient,
  getStripeWebhookSecret,
} from '@/app/lib/stripe/client';
import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { logger } from '@/lib/metrics';
import type { Json } from '@/supabase/types';

type Supabase = ReturnType<typeof getSupabaseServiceRoleClient>;

async function upsertWebhookEvent(
  supabase: Supabase,
  event: Stripe.Event,
  status: string,
  error?: string | null
) {
  await supabase
    .from('billing_webhook_events')
    .update({
      processed_at: new Date().toISOString(),
      status,
      error: error ?? null,
    })
    .eq('event_id', event.id);
}

async function recordEventIfNew(
  supabase: Supabase,
  event: Stripe.Event
): Promise<'existing' | 'recorded' | 'failed'> {
  const existing = await supabase
    .from('billing_webhook_events')
    .select('event_id, status')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing.data?.event_id) {
    return 'existing';
  }

  const { error } = await supabase.from('billing_webhook_events').insert({
    event_id: event.id,
    type: event.type,
    payload: event.data as unknown as Json,
    status: 'pending',
  });

  if (error) {
    logger.error('billing.webhook_record_failed', { error: error.message });
    return 'failed';
  }

  return 'recorded';
}

async function upsertCustomerRecord(
  supabase: Supabase,
  params: { userId: string; stripeCustomerId: string; email?: string | null }
) {
  const { error } = await supabase.from('billing_customers').upsert({
    user_id: params.userId,
    stripe_customer_id: params.stripeCustomerId,
    email: params.email ?? null,
  });

  if (error) {
    throw error;
  }
}

async function getUserIdForCustomer(
  supabase: Supabase,
  stripeCustomerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', stripeCustomerId)
    .maybeSingle();

  if (error) {
    logger.error('billing.webhook_customer_lookup_failed', {
      error: error.message,
      stripeCustomerId,
    });
    return null;
  }
  return data?.user_id ?? null;
}

async function handleCheckoutCompleted(
  supabase: Supabase,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const stripeCustomerId =
    (typeof session.customer === 'string'
      ? session.customer
      : session.customer?.id) ?? null;
  const metadataUserId =
    (session.metadata?.user_id as string | undefined) ?? null;
  const isGuestCheckout = session.metadata?.guest === 'true';

  // Resolve userId: metadata → customer lookup → guest checkout
  let resolvedUserId: string | undefined = metadataUserId ?? undefined;

  if (!resolvedUserId && stripeCustomerId) {
    resolvedUserId =
      (await getUserIdForCustomer(supabase, stripeCustomerId)) ?? undefined;
  }

  if (!resolvedUserId && isGuestCheckout) {
    const email =
      session.customer_details?.email ?? session.customer_email ?? null;
    if (email) {
      resolvedUserId = await resolveGuestCheckoutUser(email, { supabase });
    }
  }

  // Link Stripe customer to Supabase user (after resolution so guests are included)
  if (stripeCustomerId && resolvedUserId) {
    await upsertCustomerRecord(supabase, {
      userId: resolvedUserId,
      stripeCustomerId,
      email: session.customer_details?.email ?? session.customer_email ?? null,
    });
  }

  const subscriptionId =
    (typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id) ?? null;

  if (!subscriptionId) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  const result = await upsertSubscriptionFromStripe(subscription, {
    supabase,
    ...(resolvedUserId ? { userId: resolvedUserId } : {}),
  });
  invalidateEntitlements(result.userId);
}

async function handleSubscriptionEvent(
  supabase: Supabase,
  subscription: Stripe.Subscription
) {
  const result = await upsertSubscriptionFromStripe(subscription, { supabase });
  invalidateEntitlements(result.userId);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      getStripeWebhookSecret()
    );
  } catch (err) {
    logger.warn('billing.webhook_signature_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('webhook_signature_invalid', {
      message: 'Invalid Stripe signature',
    });
  }

  const supabase = getSupabaseServiceRoleClient();

  const recorded = await recordEventIfNew(supabase, event);
  if (recorded === 'existing') {
    return NextResponse.json({ received: true });
  }
  if (recorded === 'failed') {
    return errorResponse('webhook_processing_failed', {
      message: 'Failed to record webhook event',
    });
  }

  let status = 'ok';
  let errorMessage: string | null = null;

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(
          supabase,
          stripe,
          event.data.object as Stripe.Checkout.Session
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionEvent(
          supabase,
          event.data.object as Stripe.Subscription
        );
        break;
      case 'invoice.paid':
      case 'invoice.payment_failed':
      case 'customer.subscription.trial_will_end':
        // Nothing to persist for foundation; reserved for future notifications/dunning.
        break;
      default:
        logger.info('billing.webhook_unhandled_event', { type: event.type });
    }
  } catch (err) {
    status = 'error';
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error('billing.webhook_processing_failed', {
      error: errorMessage,
      eventType: event.type,
    });
  }

  await upsertWebhookEvent(supabase, event, status, errorMessage);

  return NextResponse.json({ received: true });
}
