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

const STORAGE_KEY = 'brick_party_user_lists_cache_v1';

type CacheShape = Record<
  string,
  { lists: UserListSummary[]; updatedAt: number }
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
 * Invalidate the useUserLists cache so the next render re-fetches from Supabase.
 * Call this after renaming or deleting a list from other hooks.
 */
export function invalidateUserListsCache(userId?: string) {
  if (userId) {
    const root = readCache();
    delete root[userId];
    writeCache(root);
  } else {
    cache = null;
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }
}

// --- Subscriber pattern for optimistic list mutations ---
// Allows useSetLists/useMinifigLists to push optimistic updates that
// all active useUserLists hook instances pick up immediately.

type ListsListener = (lists: UserListSummary[]) => void;
const listeners = new Set<ListsListener>();

/**
 * Optimistically update the shared user lists. Updates the cache and
 * notifies all active useUserLists hook instances so they re-render
 * with the new list state immediately.
 */
export function optimisticUpdateUserLists(
  userId: string,
  updater: (prev: UserListSummary[]) => UserListSummary[]
): void {
  const prev = getCachedLists(userId) ?? [];
  const next = updater(prev);
  setCachedLists(userId, next);
  for (const listener of listeners) {
    listener(next);
  }
}

export type UseUserListsResult = {
  /** All lists (system + custom) */
  allLists: UserListSummary[];
  /** Custom lists only (non-system) for display in dropdowns */
  lists: UserListSummary[];
  /** The Wishlist system list, if it exists */
  wishlist: UserListSummary | null;
  isLoading: boolean;
  error: string | null;
};

/**
 * Fetch the current user's lists.
 * Returns both all lists (including system) and custom lists only.
 */
export function useUserLists(): UseUserListsResult {
  const { user } = useSupabaseUser();
  const cached = getCachedLists(user?.id ?? undefined);
  const [allLists, setAllLists] = useState<UserListSummary[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!!user && !cached);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to optimistic updates from other hooks
  useEffect(() => {
    const listener: ListsListener = next => {
      setAllLists(next);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setAllLists([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowserClient();
    const existingCache = getCachedLists(user.id);
    if (existingCache && existingCache.length > 0) {
      setAllLists(existingCache);
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
        setAllLists(existingCache ?? []);
        setError(error.message ?? 'Failed to load lists');
        setIsLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<Tables<'user_lists'>>;
      const normalized = rows.map(row => ({
        id: row.id,
        name: row.name,
        isSystem: row.is_system,
      }));
      setAllLists(normalized);
      setCachedLists(user.id, normalized);
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Derive custom lists and wishlist from allLists
  const lists = allLists.filter(list => !list.isSystem);
  const wishlist =
    allLists.find(list => list.isSystem && list.name === 'Wishlist') ?? null;

  return { allLists, lists, wishlist, isLoading, error };
}
