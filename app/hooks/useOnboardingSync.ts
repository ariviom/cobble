'use client';

import { useEffect, useRef } from 'react';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useOnboardingStore } from '@/app/store/onboarding';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';

type OnboardingSettings = {
  completedSteps: string[];
  dismissed: boolean;
};

async function readRemoteOnboarding(
  userId: string
): Promise<OnboardingSettings | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.settings) return null;

  const settings = data.settings as Record<string, unknown>;
  const onboarding = settings.onboarding as OnboardingSettings | undefined;
  return onboarding ?? null;
}

async function writeRemoteOnboarding(
  userId: string,
  onboarding: OnboardingSettings
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  // Read current settings to avoid overwriting other keys
  const { data } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  const existingSettings = (data?.settings as Record<string, unknown>) ?? {};
  const mergedSettings = { ...existingSettings, onboarding };

  await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      settings: mergedSettings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}

export function useOnboardingSync() {
  const { user } = useSupabaseUser();
  const hasHydrated = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  // Hydrate from Supabase on first auth
  useEffect(() => {
    if (!user || hasHydrated.current) return;
    hasHydrated.current = true;

    const store = useOnboardingStore.getState();
    store.hydrate(user.id);

    readRemoteOnboarding(user.id).then(remote => {
      if (remote) {
        useOnboardingStore.getState().mergeFromRemote(remote);
      }
    });
  }, [user]);

  // Debounced write to Supabase on state changes
  useEffect(() => {
    if (!user) return;

    const unsub = useOnboardingStore.subscribe((state, prevState) => {
      if (
        state.completedSteps === prevState.completedSteps &&
        state.dismissed === prevState.dismissed
      ) {
        return;
      }

      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        writeRemoteOnboarding(user.id, {
          completedSteps: state.completedSteps,
          dismissed: state.dismissed,
        });
      }, 2000);
    });

    return () => {
      unsub();
      clearTimeout(debounceTimer.current);
    };
  }, [user]);
}
