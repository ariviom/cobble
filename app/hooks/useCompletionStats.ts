'use client';

import {
  getPartiallyCompleteSets,
  getTotalPartsForSets,
  type SetCompletionStats,
} from '@/app/lib/localDb';
import { getCachedSetSummary } from '@/app/lib/localDb';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { flushPendingWritesAsync } from '@/app/store/owned';
import { getRecentSets } from '@/app/store/recent-sets';
import { useEffect, useRef, useState } from 'react';

export type EnrichedCompletionSet = SetCompletionStats & {
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
};

const CLOUD_PAGE_SIZE = 1000;

type CloudSetMeta = {
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
};

/**
 * Fetch all owned quantities from Supabase for the authenticated user,
 * aggregated by set_num. Returns a Map of set_num → total owned count.
 */
async function fetchCloudOwnedBySet(
  userId: string,
  signal: AbortSignal
): Promise<Map<string, number>> {
  const supabase = getSupabaseBrowserClient();
  const ownedBySet = new Map<string, number>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('user_set_parts')
      .select('set_num, owned_quantity')
      .eq('user_id', userId)
      .eq('is_spare', false)
      .gt('owned_quantity', 0)
      .range(offset, offset + CLOUD_PAGE_SIZE - 1)
      .abortSignal(signal);

    if (error) throw error;

    for (const row of data ?? []) {
      ownedBySet.set(
        row.set_num,
        (ownedBySet.get(row.set_num) ?? 0) + row.owned_quantity
      );
    }

    if (!data || data.length < CLOUD_PAGE_SIZE) break;
    offset += CLOUD_PAGE_SIZE;
  }

  return ownedBySet;
}

/**
 * Fetch set metadata from rb_sets for the given set numbers.
 * Supabase .in() has a practical limit, so we batch in chunks.
 */
async function fetchCloudSetMeta(
  setNumbers: string[],
  signal: AbortSignal
): Promise<Map<string, CloudSetMeta>> {
  if (setNumbers.length === 0) return new Map();

  const supabase = getSupabaseBrowserClient();
  const metaMap = new Map<string, CloudSetMeta>();
  const CHUNK_SIZE = 200;

  for (let i = 0; i < setNumbers.length; i += CHUNK_SIZE) {
    const chunk = setNumbers.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .in('set_num', chunk)
      .abortSignal(signal);

    if (error) throw error;

    for (const row of data ?? []) {
      if (row.num_parts != null && row.num_parts > 0 && row.year != null) {
        metaMap.set(row.set_num, {
          name: row.name,
          year: row.year,
          imageUrl: row.image_url,
          numParts: row.num_parts,
          themeId: row.theme_id,
        });
      }
    }
  }

  return metaMap;
}

/**
 * Merge local and cloud completion data. Cloud-only sets are included
 * with totalParts from cloudMeta. For sets in both sources, ownedCount
 * uses max(local, cloud) since local may have un-synced increments and
 * cloud may have data from other devices.
 *
 * @visibleForTesting
 */
export function mergeLocalAndCloud(
  localStats: SetCompletionStats[],
  cloudOwned: Map<string, number> | null,
  cloudMeta: Map<string, CloudSetMeta>,
  localTotalParts: Map<string, number>
): Array<{ setNumber: string; ownedCount: number; totalParts: number }> {
  const mergedMap = new Map<
    string,
    { ownedCount: number; totalParts: number }
  >();

  for (const stat of localStats) {
    mergedMap.set(stat.setNumber, {
      ownedCount: stat.ownedCount,
      totalParts: stat.totalParts,
    });
  }

  if (cloudOwned) {
    for (const [setNum, cloudCount] of cloudOwned) {
      const existing = mergedMap.get(setNum);
      if (existing) {
        existing.ownedCount = Math.max(existing.ownedCount, cloudCount);
      } else {
        // For cloud-only sets, prefer local catalogSetParts totalParts
        // (accurate, excludes fig: parents, uses BL minifig data) over
        // rb_sets.num_parts (may include fig: parents, RB-only counts).
        const localTotal = localTotalParts.get(setNum);
        const meta = cloudMeta.get(setNum);
        const totalParts = localTotal ?? meta?.numParts;
        if (totalParts != null && totalParts > 0) {
          mergedMap.set(setNum, {
            ownedCount: cloudCount,
            totalParts,
          });
        }
      }
    }
  }

  const results: Array<{
    setNumber: string;
    ownedCount: number;
    totalParts: number;
  }> = [];
  for (const [setNumber, { ownedCount, totalParts }] of mergedMap) {
    if (ownedCount > 0 && totalParts > 0 && ownedCount < totalParts) {
      results.push({ setNumber, ownedCount, totalParts });
    }
  }
  return results;
}

/**
 * Enrich completion entries with display metadata from (in priority order):
 * cloud rb_sets data, recent sets store, or local catalog cache.
 */
async function enrichEntries(
  entries: Array<{ setNumber: string; ownedCount: number; totalParts: number }>,
  cloudMeta: Map<string, CloudSetMeta>,
  cancelled: () => boolean
): Promise<EnrichedCompletionSet[]> {
  const recents = getRecentSets();
  const recentMap = new Map(recents.map(r => [r.setNumber, r]));
  const enriched: EnrichedCompletionSet[] = [];

  for (const entry of entries) {
    // 1. Cloud metadata (from rb_sets query)
    const cloud = cloudMeta.get(entry.setNumber);
    if (cloud) {
      enriched.push({ ...entry, ...cloud });
      continue;
    }

    // 2. Recent sets (sync, in-memory)
    const recent = recentMap.get(entry.setNumber);
    if (recent) {
      enriched.push({
        ...entry,
        name: recent.name,
        year: recent.year,
        imageUrl: recent.imageUrl,
        numParts: recent.numParts,
        themeId: recent.themeId ?? null,
      });
      continue;
    }

    // 3. Local catalog cache (async, IndexedDB)
    const cached = await getCachedSetSummary(entry.setNumber);
    if (cancelled()) return enriched;
    if (cached) {
      enriched.push({
        ...entry,
        name: cached.name,
        year: cached.year,
        imageUrl: cached.imageUrl,
        numParts: cached.numParts,
        themeId: cached.themeId,
      });
      continue;
    }

    // Skip sets with no metadata — can't render a useful card
  }

  return enriched;
}

/**
 * Hook that returns sets where the user has partially tracked owned pieces.
 *
 * Strategy: local-first, cloud on first load only.
 * - First mount: reads local IndexedDB + fetches cloud Supabase in parallel, merges results
 * - Tab re-activations: re-reads local IndexedDB only (fast, picks up changes from set pages)
 * - Cloud data and metadata are cached in refs for merging on subsequent local re-reads
 */
export function useCompletionStats(isActive = true) {
  const [sets, setSets] = useState<EnrichedCompletionSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useSupabaseUser();
  const userId = user?.id ?? null;

  // Track whether cloud data has been fetched this session
  const cloudFetchedRef = useRef(false);
  // Cache cloud results across re-activations so local-only re-reads can merge
  const cloudOwnedRef = useRef<Map<string, number> | null>(null);
  const cloudMetaRef = useRef(new Map<string, CloudSetMeta>());
  // Local totalParts from catalogSetParts (accurate, uses BL minifig data)
  const localTotalPartsRef = useRef(new Map<string, number>());

  // Reset cloud cache when user changes (login/logout)
  const prevUserIdRef = useRef(userId);
  if (prevUserIdRef.current !== userId) {
    prevUserIdRef.current = userId;
    cloudFetchedRef.current = false;
    cloudOwnedRef.current = null;
    cloudMetaRef.current = new Map();
    localTotalPartsRef.current = new Map();
  }

  // Increment a fetch key each time isActive transitions to true,
  // so the effect re-runs for local data.
  const [fetchKey, setFetchKey] = useState(0);
  const prevActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      setFetchKey(k => k + 1);
    }
    prevActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;

    let cancelled = false;
    const abortController = new AbortController();
    const needsCloudFetch = !cloudFetchedRef.current && !!userId;

    async function load() {
      try {
        // Flush any debounced owned writes so IndexedDB is consistent
        await flushPendingWritesAsync();
        if (cancelled) return;

        // Always read local data; only fetch cloud on first load
        const localPromise = getPartiallyCompleteSets();
        const cloudPromise = needsCloudFetch
          ? fetchCloudOwnedBySet(
              userId as string,
              abortController.signal
            ).catch(() => null)
          : Promise.resolve(cloudOwnedRef.current);

        const [localStats, cloudOwned] = await Promise.all([
          localPromise,
          cloudPromise,
        ]);

        if (cancelled) return;

        // Cache cloud results and fetch metadata for cloud-only sets
        if (needsCloudFetch && cloudOwned) {
          cloudFetchedRef.current = true;
          cloudOwnedRef.current = cloudOwned;

          // Determine which cloud sets aren't in local data
          const localSetNums = new Set(localStats.map(s => s.setNumber));
          const cloudOnlySetNums = [...cloudOwned.keys()].filter(
            s => !localSetNums.has(s)
          );

          if (cloudOnlySetNums.length > 0) {
            // Fetch rb_sets metadata (fallback) and local catalogSetParts
            // totalParts (preferred — accurate BL minifig data, excludes
            // fig: parents) in parallel.
            const [meta, localTotals] = await Promise.all([
              fetchCloudSetMeta(cloudOnlySetNums, abortController.signal).catch(
                () => new Map<string, CloudSetMeta>()
              ),
              getTotalPartsForSets(cloudOnlySetNums).catch(
                () => new Map<string, number>()
              ),
            ]);

            if (cancelled) return;
            cloudMetaRef.current = meta;
            localTotalPartsRef.current = localTotals;
          }
        } else if (needsCloudFetch && !cloudOwned) {
          // Cloud fetch failed — mark as fetched so we don't retry
          cloudFetchedRef.current = true;
        }

        const merged = mergeLocalAndCloud(
          localStats,
          cloudOwnedRef.current,
          cloudMetaRef.current,
          localTotalPartsRef.current
        );

        if (merged.length === 0) {
          if (!cancelled) {
            setSets([]);
            setIsLoading(false);
          }
          return;
        }

        const enriched = await enrichEntries(
          merged,
          cloudMetaRef.current,
          () => cancelled
        );

        if (!cancelled) {
          setSets(enriched);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSets([]);
          setIsLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      abortController.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fetchKey]);

  return { sets, isLoading };
}
