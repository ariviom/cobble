'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useEffect, useState } from 'react';

export type UserCollectionSummary = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type UseUserCollectionsResult = {
  collections: UserCollectionSummary[];
  isLoading: boolean;
  error: string | null;
};

/**
 * Fetch the current user's custom collections (non-system collections only).
 * Collections are sorted alphabetically for display in dropdowns.
 */
export function useUserCollections(): UseUserCollectionsResult {
  const { user } = useSupabaseUser();
  const [collections, setCollections] = useState<UserCollectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCollections([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const run = async () => {
      setIsLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('user_collections')
        .select<'id,name,is_system'>('id,name,is_system')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('useUserCollections failed', error);
        setCollections([]);
        setError(error.message ?? 'Failed to load collections');
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<Tables<'user_collections'>>;
      setCollections(
        rows
          .map(row => ({
            id: row.id,
            name: row.name,
            isSystem: row.is_system,
          }))
          // Skip system collections (Owned/Wishlist handled via statuses)
          .filter(row => !row.isSystem)
      );
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { collections, isLoading, error };
}

