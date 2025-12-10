'use client';

import { useMemo } from 'react';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import type { Enums } from '@/supabase/types';

type MinifigStatus = Enums<'set_status'> | null;

type UseMinifigStatusArgs = {
  figNum: string;
};

type UseMinifigStatusResult = {
  status: MinifigStatus;
  toggleStatus: (next: Exclude<MinifigStatus, null>) => void;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
};

export function useMinifigStatus({
  figNum,
}: UseMinifigStatusArgs): UseMinifigStatusResult {
  const { user, isLoading } = useSupabaseUser();
  const { minifigs } = useUserMinifigs();

  const status: MinifigStatus = useMemo(() => {
    const entry = minifigs.find(fig => fig.figNum === figNum);
    return entry?.status ?? null;
  }, [minifigs, figNum]);

  const toggleStatus = (next: Exclude<MinifigStatus, null>) => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();
    const isSame = status === next;

    // When toggling the same status that's already set, clear the row.
    if (isSame) {
      void supabase
        .from('user_minifigs')
        .delete()
        .eq('user_id', user.id)
        .eq('fig_num', figNum);
      return;
    }

    void supabase.from('user_minifigs').upsert(
      {
        user_id: user.id,
        fig_num: figNum,
        status: next,
      },
      { onConflict: 'user_id,fig_num' }
    );
  };

  return {
    status,
    toggleStatus,
    isAuthenticated: !!user,
    isAuthenticating: isLoading,
  };
}
