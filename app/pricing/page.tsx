import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { getEntitlements } from '@/app/lib/services/entitlements';
import { PricingPageClient } from './pricing-client';

export default async function PricingPage() {
  let tier: 'free' | 'plus' | 'pro' = 'free';
  let isAuthenticated = false;
  let subscriptionStatus: string | null = null;

  try {
    const supabase = await getSupabaseAuthServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      isAuthenticated = true;
      const entitlements = await getEntitlements(user.id);
      tier = entitlements.tier;

      const { data: sub } = await supabase
        .from('billing_subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due', 'canceled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      subscriptionStatus = sub?.status ?? null;
    }
  } catch {
    // Swallow -- default to free/unauth
  }

  return (
    <PricingPageClient
      tier={tier}
      isAuthenticated={isAuthenticated}
      subscriptionStatus={subscriptionStatus}
      plusMonthlyPriceId={process.env.STRIPE_PRICE_PLUS_MONTHLY ?? ''}
    />
  );
}
