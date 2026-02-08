'use client';

import {
  getPartiallyCompleteSets,
  getTotalPartsForSets,
  type SetCompletionStats,
} from '@/app/lib/localDb';
import { getCachedSetSummary } from '@/app/lib/localDb';
import { flushPendingWritesAsync } from '@/app/store/owned';
import { getRecentSets } from '@/app/store/recent-sets';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useEffect, useRef, useState } from 'react';

export type EnrichedCompletionSet = SetCompletionStats & {
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
};

type CloudSetMeta = {
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
};

/**
 * Build cloud owned map from the user sets store.
 * Returns set_num → foundCount for entries with foundCount > 0.
 */
function getCloudOwnedFromStore(): Map<string, number> {
  const storeSets = useUserSetsStore.getState().sets;
  const owned = new Map<string, number>();
  for (const entry of Object.values(storeSets)) {
    if (entry.foundCount > 0) {
      owned.set(entry.setNumber, entry.foundCount);
    }
  }
  return owned;
}

/**
 * Build metadata map from user sets store for cloud-only sets.
 */
function getStoreMetaMap(): Map<string, CloudSetMeta> {
  const storeSets = useUserSetsStore.getState().sets;
  const meta = new Map<string, CloudSetMeta>();
  for (const entry of Object.values(storeSets)) {
    if (entry.numParts > 0) {
      meta.set(entry.setNumber, {
        name: entry.name,
        year: entry.year,
        imageUrl: entry.imageUrl,
        numParts: entry.numParts,
        themeId: entry.themeId,
      });
    }
  }
  return meta;
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
 * user sets store, recent sets store, or local catalog cache.
 */
async function enrichEntries(
  entries: Array<{ setNumber: string; ownedCount: number; totalParts: number }>,
  storeMeta: Map<string, CloudSetMeta>,
  cancelled: () => boolean
): Promise<EnrichedCompletionSet[]> {
  const recents = getRecentSets();
  const recentMap = new Map(recents.map(r => [r.setNumber, r]));
  const enriched: EnrichedCompletionSet[] = [];

  for (const entry of entries) {
    // 1. User sets store metadata (already hydrated)
    const store = storeMeta.get(entry.setNumber);
    if (store) {
      enriched.push({ ...entry, ...store });
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
 * Strategy: local-first, cloud from user sets store.
 * - Reads local IndexedDB on every activation
 * - Reads cloud found_count from the already-hydrated user sets Zustand store (no new query)
 * - Merges with max(local, cloud) and enriches with metadata
 */
export function useCompletionStats(isActive = true) {
  const [sets, setSets] = useState<EnrichedCompletionSet[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Subscribe to user sets store to detect hydration completion
  const userSets = useUserSetsStore(state => state.sets);

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

    async function load() {
      try {
        // Flush any debounced owned writes so IndexedDB is consistent
        await flushPendingWritesAsync();
        if (cancelled) return;

        // Read local data from IndexedDB
        const localStats = await getPartiallyCompleteSets();
        if (cancelled) return;

        // Read cloud data from user sets store (already hydrated, no network call)
        const cloudOwned = getCloudOwnedFromStore();
        const storeMeta = getStoreMetaMap();

        // For cloud-only sets, try to get accurate totalParts from local catalog
        const localSetNums = new Set(localStats.map(s => s.setNumber));
        const cloudOnlySetNums = [...cloudOwned.keys()].filter(
          s => !localSetNums.has(s)
        );

        let localTotalParts = new Map<string, number>();
        if (cloudOnlySetNums.length > 0) {
          localTotalParts = await getTotalPartsForSets(cloudOnlySetNums).catch(
            () => new Map<string, number>()
          );
          if (cancelled) return;
        }

        const merged = mergeLocalAndCloud(
          localStats,
          cloudOwned.size > 0 ? cloudOwned : null,
          storeMeta,
          localTotalParts
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
          storeMeta,
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSets, fetchKey]);

  return { sets, isLoading };
}
