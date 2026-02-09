'use client';

import { useMemo } from 'react';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';

type UseMinifigStatusArgs = {
  figNum: string;
};

type UseMinifigStatusResult = {
  status: { owned: boolean };
  toggleOwned: () => void;
  isAuthenticated: boolean;
  isAuthenticating: boolean;
};

export function useMinifigStatus({
  figNum,
}: UseMinifigStatusArgs): UseMinifigStatusResult {
  const { user, isLoading } = useSupabaseUser();
  const { minifigs } = useUserMinifigs();

  const status = useMemo(() => {
    const entry = minifigs.find(fig => fig.figNum === figNum);
    return { owned: entry?.status === 'owned' };
  }, [minifigs, figNum]);

  const toggleOwned = () => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    if (status.owned) {
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
        status: 'owned',
      },
      { onConflict: 'user_id,fig_num' }
    );
  };

  return {
    status,
    toggleOwned,
    isAuthenticated: !!user,
    isAuthenticating: isLoading,
  };
}
