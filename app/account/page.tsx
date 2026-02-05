import AccountPageClient from '@/app/account/AccountPageClient';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import { loadUserMinifigSyncPreferences } from '@/app/lib/userMinifigSyncPreferences';
import type { Metadata } from 'next';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';

export const metadata: Metadata = {
  title: 'Account | Brick Party',
  description: 'Manage your Brick Party account settings',
};

type UserProfileRow = Tables<'user_profiles'>;
type UserId = UserProfileRow['user_id'];

export default async function AccountPage() {
  const supabase = await getSupabaseAuthServerClient();

  let initialUser: User | null = null;
  let initialProfile: UserProfileRow | null = null;
  let initialPricingCurrency = DEFAULT_PRICING_PREFERENCES.currencyCode;
  let initialPricingCountry = DEFAULT_PRICING_PREFERENCES.countryCode;
  let initialSyncOwnedMinifigsFromSets = true;

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
        />
      );
    }

    initialUser = user;

    const { data: existingProfile, error: profileError } = await (
      supabase as unknown as {
        from: (table: 'user_profiles') => {
          select: (columns: '*') => {
            eq: (
              column: 'user_id',
              value: UserId
            ) => {
              maybeSingle: () => Promise<{
                data: UserProfileRow | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id as UserId)
      .maybeSingle();

    if (profileError) {
      // Swallow and let the client surface a generic error if needed.
      // Profile creation will be handled client-side as a fallback.
    } else if (existingProfile) {
      initialProfile = existingProfile;
      initialPricingCurrency = DEFAULT_PRICING_PREFERENCES.currencyCode;
      initialPricingCountry = DEFAULT_PRICING_PREFERENCES.countryCode;
    }

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
    } catch {
      // Fall back to default sync behavior if preferences fail to load.
      initialSyncOwnedMinifigsFromSets = true;
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
    />
  );
}
