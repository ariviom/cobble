'use client';

import { useEffect, useState } from 'react';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';

export type UserMinifig = {
  figNum: string;
  name: string;
  numParts: number | null;
  imageUrl: string | null;
  blId: string | null;
  status: 'owned' | 'want' | null;
  quantity: number | null;
  year: number | null;
  categoryId: number | null;
  categoryName: string | null;
};

type UseUserMinifigsResult = {
  minifigs: UserMinifig[];
  isLoading: boolean;
  error: string | null;
};

// ---------------------------------------------------------------------------
// localStorage cache (keyed by user ID, same pattern as useUserLists)
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'brick_party_user_minifigs_cache_v1';

type CacheShape = Record<
  string,
  { minifigs: UserMinifig[]; updatedAt: number }
>;

let cache: CacheShape | null = null;

function readCache(): CacheShape {
  if (cache) return cache;
  if (typeof window === 'undefined') {
    cache = {};
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
}

function getCachedMinifigs(userId: string | undefined): UserMinifig[] | null {
  if (!userId) return null;
  const root = readCache();
  return root[userId]?.minifigs ?? null;
}

function setCachedMinifigs(userId: string, minifigs: UserMinifig[]) {
  const root = readCache();
  root[userId] = { minifigs, updatedAt: Date.now() };
  writeCache(root);
}

/**
 * Invalidate the minifigs cache so the next render re-fetches from the API.
 */
export function invalidateUserMinifigsCache(userId?: string) {
  if (userId) {
    const root = readCache();
    delete root[userId];
    writeCache(root);
  } else {
    cache = null;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }
}

// ---------------------------------------------------------------------------
// In-flight request deduplication
// ---------------------------------------------------------------------------

let inflight: {
  userId: string;
  promise: Promise<UserMinifig[] | null>;
} | null = null;

function fetchMinifigsDeduped(userId: string): Promise<UserMinifig[] | null> {
  if (inflight && inflight.userId === userId) return inflight.promise;

  const promise = fetch('/api/user/minifigs', {
    credentials: 'same-origin',
  })
    .then(async res => {
      inflight = null;
      if (res.status === 401) return [];
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? 'minifigs_fetch_failed');
      }
      const payload = (await res.json()) as { minifigs?: UserMinifig[] };
      const result = payload.minifigs ?? [];
      setCachedMinifigs(userId, result);
      return result;
    })
    .catch(err => {
      inflight = null;
      console.error('useUserMinifigs fetch failed', err);
      return null;
    });

  inflight = { userId, promise };
  return promise;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUserMinifigs(): UseUserMinifigsResult {
  const { user } = useSupabaseUser();
  const cached = getCachedMinifigs(user?.id);
  const [minifigs, setMinifigs] = useState<UserMinifig[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!!user && !cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setMinifigs([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const existingCache = getCachedMinifigs(user.id);

    // Cache hit — show cached data immediately (no spinner), background refresh.
    if (existingCache !== null) {
      setMinifigs(existingCache);
      setIsLoading(false);

      let bgCancelled = false;
      void fetchMinifigsDeduped(user.id).then(result => {
        if (bgCancelled || !result) return;
        const changed =
          result.length !== existingCache.length ||
          result.some(
            (m, i) =>
              m.figNum !== existingCache[i]?.figNum ||
              m.status !== existingCache[i]?.status ||
              m.quantity !== existingCache[i]?.quantity
          );
        if (changed) setMinifigs(result);
      });
      return () => {
        bgCancelled = true;
      };
    }

    // No cache — show spinner and fetch.
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void fetchMinifigsDeduped(user.id).then(result => {
      if (cancelled) return;
      if (result) {
        setMinifigs(result);
      } else {
        setError('Failed to load minifigures');
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { minifigs, isLoading, error };
}
