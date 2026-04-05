import AccountPageClient from '@/app/account/AccountPageClient';
import { ensureUserProfile } from '@/app/lib/server/ensureUserProfile';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { loadUserMinifigSyncPreferences } from '@/app/lib/userMinifigSyncPreferences';
import { loadUserPartsSyncPreferences } from '@/app/lib/userPartsSyncPreferences';
import type { Metadata } from 'next';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';

type UserProfileRow = Tables<'user_profiles'>;

export const metadata: Metadata = {
  title: 'Account | Brick Party',
  description: 'Manage your Brick Party account settings',
};

export default async function AccountPage() {
  const supabase = await getSupabaseAuthServerClient();

  let initialUser: User | null = null;
  let initialProfile: UserProfileRow | null = null;
  let initialPricingCurrency = DEFAULT_PRICING_PREFERENCES.currencyCode;
  let initialPricingCountry = DEFAULT_PRICING_PREFERENCES.countryCode;
  let initialSyncOwnedMinifigsFromSets = true;
  let initialSyncScope: 'collection' | 'owned' = 'collection';
  let initialSyncPartsFromSets = true;
  let initialSubscription: Tables<'billing_subscriptions'> | null = null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return (
        <AccountPageClient
          initialUser={null}
          initialProfile={null}
          initialPricingCurrency={initialPricingCurrency}
          initialPricingCountry={initialPricingCountry}
          initialSyncOwnedMinifigsFromSets={initialSyncOwnedMinifigsFromSets}
          initialSyncScope={initialSyncScope}
          initialSyncPartsFromSets={initialSyncPartsFromSets}
          initialSubscription={null}
        />
      );
    }

    initialUser = user;

    const oauthName =
      (user.user_metadata?.full_name as string | undefined) ?? null;
    initialProfile = await ensureUserProfile(supabase, user.id, oauthName);

    try {
      const pricingPrefs = await loadUserPricingPreferences(supabase, user.id);
      initialPricingCurrency = pricingPrefs.currencyCode;
      initialPricingCountry = pricingPrefs.countryCode;
    } catch {
      // Ignore pricing preference failures on the server; client can retry.
    }

    try {
      const minifigPrefs = await loadUserMinifigSyncPreferences(
        supabase,
        user.id
      );
      initialSyncOwnedMinifigsFromSets = !!minifigPrefs.syncOwnedFromSets;
      initialSyncScope = minifigPrefs.syncScope ?? 'collection';
    } catch {
      // Fall back to default sync behavior if preferences fail to load.
      initialSyncOwnedMinifigsFromSets = true;
    }

    try {
      const partPrefs = await loadUserPartsSyncPreferences(supabase, user.id);
      initialSyncPartsFromSets = !!partPrefs.syncFromSets;
    } catch {
      initialSyncPartsFromSets = true;
    }

    try {
      const { data: sub } = await supabase
        .from('billing_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due', 'canceled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      initialSubscription = sub;
    } catch {
      // Subscription fetch failure is non-critical; billing tab will show free state.
    }
  } catch {
    // If server-side auth fails, fall back to client-only behavior.
  }

  return (
    <AccountPageClient
      initialUser={initialUser}
      initialProfile={initialProfile}
      initialPricingCurrency={initialPricingCurrency}
      initialPricingCountry={initialPricingCountry}
      initialSyncOwnedMinifigsFromSets={initialSyncOwnedMinifigsFromSets}
      initialSyncScope={initialSyncScope}
      initialSyncPartsFromSets={initialSyncPartsFromSets}
      initialSubscription={initialSubscription}
    />
  );
}
