'use client';

import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { loadUserPricingPreferences } from '@/app/lib/userPricingPreferences';
import type { Tables } from '@/supabase/types';
import type { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_PRICING_PREFERENCES } from '@/app/lib/pricing';

export type UserProfileRow = Tables<'user_profiles'>;
export type UserId = UserProfileRow['user_id'];

export type AccountData = {
  user: User | null;
  profile: UserProfileRow | null;
  isLoading: boolean;
  error: string | null;
  pricingCurrency: string;
  pricingCountry: string | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfileRow | null) => void;
  setError: (error: string | null) => void;
  setPricingCurrency: (currency: string) => void;
  setPricingCountry: (country: string | null) => void;
};

export type AccountDataProps = {
  initialUser: User | null;
  initialProfile: UserProfileRow | null;
  initialPricingCurrency: string;
  initialPricingCountry: string | null;
};

export function useAccountData({
  initialUser,
  initialProfile,
  initialPricingCurrency,
  initialPricingCountry,
}: AccountDataProps): AccountData {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<UserProfileRow | null>(initialProfile);
  const [isLoading, setIsLoading] = useState(() => !initialUser);
  const [error, setError] = useState<string | null>(null);
  const [pricingCurrency, setPricingCurrency] = useState<string>(
    initialPricingCurrency ?? DEFAULT_PRICING_PREFERENCES.currencyCode
  );
  const [pricingCountry, setPricingCountry] = useState<string | null>(
    initialPricingCountry ?? DEFAULT_PRICING_PREFERENCES.countryCode
  );

  useEffect(() => {
    // If SSR already provided a user, skip the initial client fetch.
    if (user) {
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user: fetchedUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          setError(userError.message);
          setUser(null);
          setProfile(null);
          return;
        }

        if (!fetchedUser) {
          setUser(null);
          setProfile(null);
          return;
        }

        setUser(fetchedUser);

        const { data: existingProfile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', fetchedUser.id as UserId)
          .maybeSingle();

        if (profileError) {
          setError(profileError.message);
        }

        if (!existingProfile) {
          const displayName =
            (fetchedUser.user_metadata &&
              (fetchedUser.user_metadata.full_name as string | undefined)) ||
            fetchedUser.email ||
            null;

          const { data: createdProfile, error: insertError } = await supabase
            .from('user_profiles')
            .insert({
              user_id: fetchedUser.id as UserId,
              display_name: displayName,
            })
            .select('*')
            .maybeSingle();

          if (insertError) {
            setError(insertError.message);
          } else if (createdProfile) {
            setProfile(createdProfile);
          }
        } else {
          setProfile(existingProfile);
        }

        try {
          const pricingPrefs = await loadUserPricingPreferences(
            supabase,
            fetchedUser.id
          );
          setPricingCurrency(pricingPrefs.currencyCode);
          setPricingCountry(pricingPrefs.countryCode);
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            try {
              console.warn('AccountPage: failed to load pricing preferences', {
                error: err instanceof Error ? err.message : String(err),
              });
            } catch {}
          }
        }
      } catch {
        setError('Failed to load account information.');
        setUser(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [user]);

  const setUserCallback = useCallback((u: User | null) => setUser(u), []);
  const setProfileCallback = useCallback(
    (p: UserProfileRow | null) => setProfile(p),
    []
  );
  const setErrorCallback = useCallback((e: string | null) => setError(e), []);

  return {
    user,
    profile,
    isLoading,
    error,
    pricingCurrency,
    pricingCountry,
    setUser: setUserCallback,
    setProfile: setProfileCallback,
    setError: setErrorCallback,
    setPricingCurrency,
    setPricingCountry,
  };
}
