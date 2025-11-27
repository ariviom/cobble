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

const STORAGE_KEY = 'quarry_user_collections_cache_v1';

type CacheShape = Record<
  string,
  { collections: UserCollectionSummary[]; updatedAt: number }
>;

let cache: CacheShape | null = null;

function readCache(): CacheShape {
  if (cache) return cache;
  if (typeof window === 'undefined') {
    cache = {};
    return cache;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as CacheShape) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function writeCache(next: CacheShape) {
  cache = next;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function getCachedCollections(
  userId: string | undefined
): UserCollectionSummary[] | null {
  if (!userId) return null;
  const root = readCache();
  return root[userId]?.collections ?? null;
}

function setCachedCollections(
  userId: string,
  collections: UserCollectionSummary[]
) {
  const root = readCache();
  root[userId] = {
    collections,
    updatedAt: Date.now(),
  };
  writeCache(root);
}

/**
 * Fetch the current user's custom collections (non-system collections only).
 * Collections are sorted alphabetically for display in dropdowns.
 */
export function useUserCollections(): UseUserCollectionsResult {
  const { user } = useSupabaseUser();
  const cached = getCachedCollections(user?.id ?? undefined);
  const [collections, setCollections] = useState<UserCollectionSummary[]>(
    cached ?? []
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    !!user && !cached
  );
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
    const existingCache = getCachedCollections(user.id);
    if (existingCache && existingCache.length > 0) {
      setCollections(existingCache);
      setIsLoading(false);
    }

    const run = async () => {
      setError(null);
      if (!existingCache) {
        setIsLoading(true);
      }

      const { data, error } = await supabase
        .from('user_collections')
        .select<'id,name,is_system'>('id,name,is_system')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('useUserCollections failed', error);
        setCollections(existingCache ?? []);
        setError(error.message ?? 'Failed to load collections');
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<Tables<'user_collections'>>;
      const normalized = rows
        .map(row => ({
          id: row.id,
          name: row.name,
          isSystem: row.is_system,
        }))
        .filter(row => !row.isSystem);
      setCollections(normalized);
      setCachedCollections(user.id, normalized);
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { collections, isLoading, error };
}

