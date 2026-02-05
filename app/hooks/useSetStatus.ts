'use client';

import { useMemo } from 'react';
import {
  EMPTY_SET_STATUS,
  type SetStatus,
  type UserSetMeta,
  useUserSetsStore,
} from '@/app/store/user-sets';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';

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
  toggleOwned: () => void;
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
  const normKey = useMemo(() => setNumber.trim().toLowerCase(), [setNumber]);

  const rawStatus = useUserSetsStore(state => {
    const entry = state.sets[normKey];
    return entry?.status ?? EMPTY_SET_STATUS;
  });
  const setOwned = useUserSetsStore(state => state.setOwned);
  const status = rawStatus;

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

  const toggleOwned = () => {
    const nextOwned = !status.owned;
    setOwned({
      setNumber,
      owned: nextOwned,
      meta,
    });

    if (!user) {
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void (async () => {
      if (!nextOwned) {
        // Delete the user_sets row when no longer owned
        await supabase
          .from('user_sets')
          .delete()
          .eq('user_id', user.id)
          .eq('set_num', setNumber);
      } else {
        // Upsert with owned = true
        await supabase.from('user_sets').upsert(
          {
            user_id: user.id,
            set_num: setNumber,
            owned: true,
          },
          { onConflict: 'user_id,set_num' }
        );
      }

      // After user_sets is updated, kick off a best-effort sync of minifigs
      // derived from user sets. This keeps user_minifigs in sync without
      // blocking the UI.
      try {
        await fetch('/api/user/minifigs/sync-from-sets', {
          method: 'POST',
        });
      } catch (err) {
        console.error('Failed to sync minifigs from sets', err);
      }
    })();
  };

  return { status, toggleOwned };
}
