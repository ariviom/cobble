'use client';

import { useCallback, useMemo } from 'react';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import {
  useUserMinifigs,
  optimisticUpdateUserMinifigs,
} from '@/app/hooks/useUserMinifigs';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';

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

  const toggleOwned = useCallback(() => {
    if (!user) return;
    const supabase = getSupabaseBrowserClient();

    if (status.owned) {
      // Optimistic: remove from local state immediately
      optimisticUpdateUserMinifigs(user.id, prev =>
        prev.filter(fig => fig.figNum !== figNum)
      );

      void supabase
        .from('user_minifigs')
        .delete()
        .eq('user_id', user.id)
        .eq('fig_num', figNum)
        .then(({ error: err }) => {
          if (err) {
            console.error('Failed to remove minifig ownership', err);
          }
        });
      return;
    }

    // Optimistic: add to local state immediately
    optimisticUpdateUserMinifigs(user.id, prev => {
      const existing = prev.find(fig => fig.figNum === figNum);
      if (existing) {
        return prev.map(fig =>
          fig.figNum === figNum ? { ...fig, status: 'owned' as const } : fig
        );
      }
      return [
        ...prev,
        {
          figNum,
          name: '',
          numParts: null,
          imageUrl: null,
          blId: null,
          status: 'owned' as const,
          quantity: null,
          year: null,
          categoryId: null,
          categoryName: null,
        },
      ];
    });

    void supabase
      .from('user_minifigs')
      .upsert(
        {
          user_id: user.id,
          fig_num: figNum,
          status: 'owned',
        },
        { onConflict: 'user_id,fig_num' }
      )
      .then(({ error: err }) => {
        if (err) {
          console.error('Failed to set minifig ownership', err);
        }
      });
  }, [user, figNum, status.owned]);

  return {
    status,
    toggleOwned,
    isAuthenticated: !!user,
    isAuthenticating: isLoading,
  };
}
