'use client';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { Tables } from '@/supabase/types';
import { useEffect, useState } from 'react';

export type UserListSummary = {
  id: string;
  name: string;
  isSystem: boolean;
};

export type UseUserListsResult = {
  lists: UserListSummary[];
  isLoading: boolean;
  error: string | null;
};

const STORAGE_KEY = 'brick_party_user_lists_cache_v1';

type CacheShape = Record<string, { lists: UserListSummary[]; updatedAt: number }>;

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

function getCachedLists(userId: string | undefined): UserListSummary[] | null {
  if (!userId) return null;
  const root = readCache();
  return root[userId]?.lists ?? null;
}

function setCachedLists(userId: string, lists: UserListSummary[]) {
  const root = readCache();
  root[userId] = {
    lists,
    updatedAt: Date.now(),
  };
  writeCache(root);
}

/**
 * Fetch the current user's custom lists (non-system lists only).
 * Lists are sorted alphabetically for display in dropdowns.
 */
export function useUserLists(): UseUserListsResult {
  const { user } = useSupabaseUser();
  const cached = getCachedLists(user?.id ?? undefined);
  const [lists, setLists] = useState<UserListSummary[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(
    !!user && !cached
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLists([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const existingCache = getCachedLists(user.id);
    if (existingCache && existingCache.length > 0) {
      setLists(existingCache);
      setIsLoading(false);
    }

    const run = async () => {
      setError(null);
      if (!existingCache) {
        setIsLoading(true);
      }

      const { data, error } = await supabase
        .from('user_lists')
        .select<'id,name,is_system'>('id,name,is_system')
        .eq('user_id', user.id)
        .order('name', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('useUserLists failed', error);
        setLists(existingCache ?? []);
        setError(error.message ?? 'Failed to load lists');
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<Tables<'user_lists'>>;
      const normalized = rows
        .map(row => ({
          id: row.id,
          name: row.name,
          isSystem: row.is_system,
        }))
        .filter(row => !row.isSystem);
      setLists(normalized);
      setCachedLists(user.id, normalized);
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { lists, isLoading, error };
}

