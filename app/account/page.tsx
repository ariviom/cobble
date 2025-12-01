import AccountPageClient from '@/app/account/AccountPageClient';
import { getSupabaseAuthServerClient } from '@/app/lib/supabaseAuthServerClient';
import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';

type UserProfileRow = Tables<'user_profiles'>;

export default async function AccountPage() {
  const supabase = await getSupabaseAuthServerClient();

  let initialUser: User | null = null;
  let initialProfile: UserProfileRow | null = null;
  let initialPricingCurrency = DEFAULT_PRICING_PREFERENCES.currencyCode;
  let initialPricingCountry = DEFAULT_PRICING_PREFERENCES.countryCode;

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
        />
      );
    }

    initialUser = user;

    const {
      data: existingProfile,
      error: profileError,
    } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', user.id)
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
  } catch {
    // If server-side auth fails, fall back to client-only behavior.
  }

  return (
    <AccountPageClient
      initialUser={initialUser}
      initialProfile={initialProfile}
      initialPricingCurrency={initialPricingCurrency}
      initialPricingCountry={initialPricingCountry}
    />
  );
}


