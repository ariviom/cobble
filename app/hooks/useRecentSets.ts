'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import {
  getRecentSets,
  removeRecentSet,
  type RecentSetEntry,
} from '@/app/store/recent-sets';
import type { RecentSetsResponse } from '@/app/api/recent-sets/route';

/**
 * Hook that returns recent sets merged from local storage + cloud (Supabase).
 *
 * - Initializes instantly from localStorage
 * - If authenticated and cloud not yet fetched this session, fetches GET /api/recent-sets
 * - Merges: for each set, takes the entry with the newer lastViewedAt
 * - On tab re-activation, re-reads local (picks up new views from set pages)
 */
export function useRecentSets(isActive = true) {
  const [sets, setSets] = useState<RecentSetEntry[]>(() => getRecentSets());
  const { user } = useSupabaseUser();
  const cloudFetchedRef = useRef(false);
  const cloudSetsRef = useRef<RecentSetEntry[]>([]);

  // Reset cloud cache on user change
  const prevUserIdRef = useRef(user?.id ?? null);
  if (prevUserIdRef.current !== (user?.id ?? null)) {
    prevUserIdRef.current = user?.id ?? null;
    cloudFetchedRef.current = false;
    cloudSetsRef.current = [];
  }

  const mergeAndSet = useCallback(() => {
    const local = getRecentSets();
    const cloud = cloudSetsRef.current;

    if (cloud.length === 0) {
      setSets(local);
      return;
    }

    // Build map keyed by lowercase setNumber; keep newer lastViewedAt
    const merged = new Map<string, RecentSetEntry>();
    for (const entry of local) {
      merged.set(entry.setNumber.toLowerCase(), entry);
    }
    for (const entry of cloud) {
      const key = entry.setNumber.toLowerCase();
      const existing = merged.get(key);
      if (!existing || entry.lastViewedAt > existing.lastViewedAt) {
        merged.set(key, entry);
      }
    }

    const sorted = [...merged.values()].sort(
      (a, b) => b.lastViewedAt - a.lastViewedAt
    );
    setSets(sorted.slice(0, 100));
  }, []);

  // Fetch cloud data once per session for authenticated users
  useEffect(() => {
    if (!isActive || !user || cloudFetchedRef.current) return;

    let cancelled = false;

    async function fetchCloud() {
      try {
        const res = await fetch('/api/recent-sets', {
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const data = (await res.json()) as RecentSetsResponse;
        if (cancelled) return;

        cloudSetsRef.current = data.sets.map(s => ({
          setNumber: s.setNumber,
          name: s.name,
          year: s.year,
          numParts: s.numParts,
          imageUrl: s.imageUrl,
          themeId: s.themeId,
          lastViewedAt: new Date(s.lastViewedAt).getTime(),
        }));
        cloudFetchedRef.current = true;
        mergeAndSet();
      } catch {
        // Cloud fetch failed — use local only
        cloudFetchedRef.current = true;
      }
    }

    void fetchCloud();
    return () => {
      cancelled = true;
    };
  }, [isActive, user, mergeAndSet]);

  // Re-read local on tab re-activation (picks up new views from set pages)
  const prevActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      mergeAndSet();
    }
    prevActiveRef.current = isActive;
  }, [isActive, mergeAndSet]);

  const remove = useCallback((setNumber: string) => {
    removeRecentSet(setNumber);
    setSets(prev =>
      prev.filter(s => s.setNumber.toLowerCase() !== setNumber.toLowerCase())
    );
  }, []);

  return { sets, remove };
}
