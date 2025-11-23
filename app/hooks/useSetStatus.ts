'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EMPTY_SET_STATUS,
  type SetStatus,
  type SetStatusKey,
  type UserSetMeta,
  useUserSetsStore,
} from '@/app/store/user-sets';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import type { Enums } from '@/supabase/types';

type UseSetStatusArgs = {
  setNumber: string;
  name: string;
  year?: number;
  imageUrl?: string | null;
  numParts?: number;
  themeId?: number | null;
};

type UseSetStatusResult = {
  status: SetStatus;
  toggleStatus: (key: SetStatusKey) => void;
};

export function useSetStatus({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
}: UseSetStatusArgs): UseSetStatusResult {
  const { user } = useSupabaseUser();
  const normKey = useMemo(
    () => setNumber.trim().toLowerCase(),
    [setNumber]
  );

  const rawStatus = useUserSetsStore(state => {
    const entry = state.sets[normKey];
    return entry?.status ?? EMPTY_SET_STATUS;
  });
  const setStatus = useUserSetsStore(state => state.setStatus);

  const [mounted, setMounted] = useState(false);
  const [hydratedFromSupabase, setHydratedFromSupabase] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const status = mounted ? rawStatus : EMPTY_SET_STATUS;

  const meta: UserSetMeta = useMemo(
    () => ({
      setNumber,
      name,
      year: typeof year === 'number' ? year : 0,
      imageUrl: imageUrl ?? null,
      numParts: typeof numParts === 'number' ? numParts : 0,
      themeId: typeof themeId === 'number' ? themeId : null,
    }),
    [setNumber, name, year, imageUrl, numParts, themeId]
  );

  // Map DB enum to local SetStatus shape.
  function dbStatusToLocal(status: Enums<'set_status'>): SetStatus {
    if (status === 'owned') return { owned: true, canBuild: false, wantToBuild: false };
    if (status === 'can_build') {
      return { owned: false, canBuild: true, wantToBuild: false };
    }
    if (status === 'want') {
      return { owned: false, canBuild: false, wantToBuild: true };
    }
    // 'partial' currently treated as "want to build" (has some parts but not enough).
    return { owned: false, canBuild: false, wantToBuild: true };
  }

  function localKeyToDbStatus(key: SetStatusKey): Enums<'set_status'> {
    if (key === 'owned') return 'owned';
    if (key === 'canBuild') return 'can_build';
    return 'want';
  }

  // Hydrate local store from Supabase when a user is logged in.
  useEffect(() => {
    if (!user || hydratedFromSupabase) return;

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('user_sets')
          .select('set_num,status')
          .eq('user_id', user.id)
          .eq('set_num', setNumber)
          .maybeSingle();

        if (cancelled || error || !data) {
          return;
        }

        const nextStatus = dbStatusToLocal(data.status);

        useUserSetsStore.setState(prev => {
          const existing = prev.sets[normKey];
          const baseMeta: UserSetMeta = existing ?? meta;
          return {
            ...prev,
            sets: {
              ...prev.sets,
              [normKey]: {
                ...baseMeta,
                status: nextStatus,
                lastUpdatedAt: existing?.lastUpdatedAt ?? Date.now(),
              },
            },
          };
        });
      } finally {
        if (!cancelled) {
          setHydratedFromSupabase(true);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user, hydratedFromSupabase, setNumber, normKey, meta]);

  const toggleStatus = (key: SetStatusKey) => {
    const nextValue = !status[key];
    setStatus({
      setNumber,
      key,
      value: nextValue,
      meta,
    });

    if (!user) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    // When turning a status on, we store exactly that status.
    // When turning a status off, we clear all flags and delete the row.
    if (!nextValue) {
      void supabase
        .from('user_sets')
        .delete()
        .eq('user_id', user.id)
        .eq('set_num', setNumber);
    } else {
      const dbStatus = localKeyToDbStatus(key);
      void supabase
        .from('user_sets')
        .upsert(
          {
            user_id: user.id,
            set_num: setNumber,
            status: dbStatus,
          },
          { onConflict: 'user_id,set_num' }
        );
    }
  };

  return { status, toggleStatus };
}


