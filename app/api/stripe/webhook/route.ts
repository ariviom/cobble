import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

import { errorResponse } from '@/app/lib/api/responses';
import {
  getUserIdForCustomer,
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

async function updateWebhookEvent(
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
): Promise<'new' | 'existing' | 'reprocess'> {
  // Check if event was previously recorded and failed — allow reprocessing
  const { data: prior } = await supabase
    .from('billing_webhook_events')
    .select('event_id, status')
    .eq('event_id', event.id)
    .maybeSingle();

  if (prior?.event_id) {
    if (prior.status === 'error') {
      // Allow reprocessing of previously failed events
      logger.info('billing.webhook_reprocessing_failed_event', {
        eventId: event.id,
      });
      return 'reprocess';
    }
    return 'existing';
  }

  // Atomic insert — ON CONFLICT handles the race condition
  const { error } = await supabase.from('billing_webhook_events').upsert(
    {
      event_id: event.id,
      type: event.type,
      payload: event.data as unknown as Json,
      status: 'pending',
    },
    { onConflict: 'event_id', ignoreDuplicates: true }
  );

  if (error) {
    // Any error here is a real failure, not a race condition
    logger.error('billing.webhook_record_failed', { error: error.message });
    // Return 'existing' rather than 'failed' to avoid 500→Stripe retry storms
    return 'existing';
  }

  return 'new';
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
      (await getUserIdForCustomer(stripeCustomerId, supabase)) ?? undefined;
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

  let subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  });

  // Cancel trial for returning users to prevent trial abuse via guest checkout.
  // Guest checkout always creates a session with trial_period_days because we
  // don't know the user's identity until this webhook resolves it.
  if (resolvedUserId && subscription.trial_end) {
    const { count } = await supabase
      .from('billing_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', resolvedUserId)
      .neq('stripe_subscription_id', subscription.id);

    if (count && count > 0) {
      logger.info('billing.trial_canceled_returning_user', {
        subscriptionId: subscription.id,
      });
      subscription = await stripe.subscriptions.update(subscription.id, {
        trial_end: 'now',
      });
    }
  }

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
  try {
    const result = await upsertSubscriptionFromStripe(subscription, {
      supabase,
    });
    invalidateEntitlements(result.userId);
  } catch (err) {
    const isGuestSubscription = subscription.metadata?.guest === 'true';
    const isUserResolutionError =
      err instanceof Error && err.message.includes('Unable to resolve user_id');

    if (isGuestSubscription && isUserResolutionError) {
      // Expected: subscription.created often arrives before checkout.session.completed
      // has linked the guest user. The checkout handler will process this subscription.
      logger.warn('billing.webhook_guest_subscription_deferred', {
        subscriptionId: subscription.id,
      });
      return;
    }
    throw err;
  }
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

  await updateWebhookEvent(supabase, event, status, errorMessage);

  if (status === 'error') {
    // Return 500 so Stripe retries transient failures (DB errors, timeouts).
    // The idempotency check in recordEventIfNew allows reprocessing.
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
