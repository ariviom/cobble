import { NextResponse } from 'next/server';

import { errorResponse } from '@/app/lib/api/responses';
import { withCsrfProtection } from '@/app/lib/middleware/csrf';
import { ensureStripeCustomer } from '@/app/lib/services/billing';
import { getStripeClient } from '@/app/lib/stripe/client';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { logger } from '@/lib/metrics';

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const POST = withCsrfProtection(async () => {
  const supabase = await getSupabaseAuthServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return errorResponse('unauthorized', { status: 401 });
  }

  const stripe = getStripeClient();

  try {
    const customerId = await ensureStripeCustomer(user, { stripe });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: getEnvOrThrow('STRIPE_BILLING_PORTAL_RETURN_URL'),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error('billing.create_portal_session_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('unknown_error', { status: 500 });
  }
});
