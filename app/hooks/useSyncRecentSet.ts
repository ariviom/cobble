'use client';

import { useCallback } from 'react';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';

/**
 * Fire-and-forget hook that pushes a viewed set to Supabase for cross-device sync.
 * No-ops for anonymous users.
 */
export function useSyncRecentSet() {
  const { user } = useSupabaseUser();

  return useCallback(
    (setNumber: string) => {
      if (!user) return;
      void fetch('/api/recent-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ set_num: setNumber }),
      }).catch(() => {});
    },
    [user]
  );
}
