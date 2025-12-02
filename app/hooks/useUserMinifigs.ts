'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useEffect, useState } from 'react';

export type UserMinifig = {
  figNum: string;
  name: string;
  numParts: number | null;
  status: Tables<'user_minifigs'>['status'];
};

type UseUserMinifigsResult = {
  minifigs: UserMinifig[];
  isLoading: boolean;
  error: string | null;
};

export function useUserMinifigs(): UseUserMinifigsResult {
  const { user } = useSupabaseUser();
  const [minifigs, setMinifigs] = useState<UserMinifig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setMinifigs([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const run = async () => {
      setError(null);
      setIsLoading(true);
      const { data, error: queryError } = await supabase
        .from('user_minifigs')
        .select<'fig_num,status,rb_minifigs(name,num_parts)'>(
          'fig_num,status,rb_minifigs(name,num_parts)'
        )
        .eq('user_id', user.id)
        .order('fig_num', { ascending: true });

      if (cancelled) return;

      if (queryError) {
        console.error('useUserMinifigs query failed', queryError);
        setError(queryError.message ?? 'Failed to load minifigures');
        setMinifigs([]);
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<
        Tables<'user_minifigs'> & {
          rb_minifigs?: {
            name: string | null;
            num_parts: number | null;
          } | null;
        }
      >;

      const normalized: UserMinifig[] = rows.map(row => ({
        figNum: row.fig_num,
        status: row.status,
        name: row.rb_minifigs?.name ?? row.fig_num,
        numParts: row.rb_minifigs?.num_parts ?? null,
      }));

      setMinifigs(normalized);
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { minifigs, isLoading, error };
}


