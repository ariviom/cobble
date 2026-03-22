'use client';

import {
  aggregateOwnedParts,
  computeMissingParts,
} from '@/app/components/collection/parts/aggregation';
import type {
  CollectionPart,
  PartsSourceFilter,
} from '@/app/components/collection/parts/types';
import type { InventoryRow } from '@/app/components/set/types';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { setCachedInventory } from '@/app/lib/localDb/catalogCache';
import { getAllLooseParts } from '@/app/lib/localDb/loosePartsStore';
import { getOwnedForSet, setOwnedForSet } from '@/app/lib/localDb/ownedStore';
import { flushPendingWritesAsync } from '@/app/store/owned';
import type { CatalogPart, CatalogSetPart } from '@/app/lib/localDb/schema';
import { getLocalDb, isIndexedDBAvailable } from '@/app/lib/localDb/schema';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { getTabCoordinator } from '@/app/lib/sync/tabCoordinator';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SetInfo = { setNumber: string; setName: string };

const BATCH_ENDPOINT_MAX_SETS = 50;

/**
 * Fetch inventories for multiple sets via the batch endpoint.
 * Chunks into groups of BATCH_ENDPOINT_MAX_SETS.
 */
async function fetchInventoriesBatch(setNumbers: string[]): Promise<
  Map<
    string,
    {
      rows: InventoryRow[];
      inventoryVersion?: string | null;
    }
  >
> {
  const result = new Map<
    string,
    {
      rows: InventoryRow[];
      inventoryVersion?: string | null;
    }
  >();

  const chunks: string[][] = [];
  for (let i = 0; i < setNumbers.length; i += BATCH_ENDPOINT_MAX_SETS) {
    chunks.push(setNumbers.slice(i, i + BATCH_ENDPOINT_MAX_SETS));
  }

  await Promise.all(
    chunks.map(async chunk => {
      try {
        const res = await fetch('/api/inventory/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sets: chunk }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          inventories: Record<string, { rows: InventoryRow[] }>;
          inventoryVersion?: string | null;
        };
        for (const [setNum, entry] of Object.entries(data.inventories)) {
          const val: {
            rows: InventoryRow[];
            inventoryVersion?: string | null;
          } = { rows: entry.rows };
          if (data.inventoryVersion !== undefined) {
            val.inventoryVersion = data.inventoryVersion;
          }
          result.set(setNum, val);
        }
      } catch {
        // Graceful — skip this chunk
      }
    })
  );

  return result;
}

/**
 * Load catalog parts from IndexedDB for the given sets.
 * For any sets missing from cache, fetch from API and cache the result.
 */
async function loadCatalogPartsForSets(
  setNumbers: string[]
): Promise<Map<string, CatalogSetPart[]>> {
  if (!isIndexedDBAvailable() || setNumbers.length === 0) return new Map();

  const db = getLocalDb();
  const result = new Map<string, CatalogSetPart[]>();

  const allParts = await db.catalogSetParts
    .where('setNumber')
    .anyOf(setNumbers)
    .toArray();
  const grouped = new Map<string, CatalogSetPart[]>();
  for (const part of allParts) {
    const arr = grouped.get(part.setNumber) ?? [];
    arr.push(part);
    grouped.set(part.setNumber, arr);
  }
  for (const [setNum, parts] of grouped) {
    result.set(setNum, parts);
  }
  const uncached = setNumbers.filter(s => !grouped.has(s));

  // Fetch uncached inventories
  if (uncached.length === 1) {
    // Single set — use existing endpoint
    const setNum = uncached[0]!;
    try {
      const res = await fetch(
        `/api/inventory?set=${encodeURIComponent(setNum)}`
      );
      if (res.ok) {
        const data = (await res.json()) as {
          rows: InventoryRow[];
          inventoryVersion?: string | null;
        };
        if (data.rows.length > 0) {
          await setCachedInventory(setNum, data.rows, {
            inventoryVersion: data.inventoryVersion ?? null,
          });
          const parts = await db.catalogSetParts
            .where('setNumber')
            .equals(setNum)
            .toArray();
          if (parts.length > 0) result.set(setNum, parts);
        }
      }
    } catch {
      // Graceful degradation
    }
  } else if (uncached.length > 1) {
    // Multiple sets — use batch endpoint
    const batchResults = await fetchInventoriesBatch(uncached);
    await Promise.all(
      Array.from(batchResults.entries()).map(async ([setNum, data]) => {
        try {
          if (data.rows.length > 0) {
            await setCachedInventory(setNum, data.rows, {
              inventoryVersion: data.inventoryVersion ?? null,
            });
            const parts = await db.catalogSetParts
              .where('setNumber')
              .equals(setNum)
              .toArray();
            if (parts.length > 0) result.set(setNum, parts);
          }
        } catch {
          // Graceful — skip individual cache failures
        }
      })
    );
  }

  return result;
}

/**
 * Load CatalogPart metadata for all unique partNums from the catalog map.
 * CatalogSetPart has colorName/imageUrl but NOT partName/parentCategory —
 * those live on CatalogPart (the normalized parts table).
 */
async function loadPartMetadata(
  catalogPartsBySet: Map<string, CatalogSetPart[]>
): Promise<Map<string, CatalogPart>> {
  if (!isIndexedDBAvailable()) return new Map();

  const partNums = new Set<string>();
  for (const parts of catalogPartsBySet.values()) {
    for (const cp of parts) partNums.add(cp.partNum);
  }

  const db = getLocalDb();
  const result = new Map<string, CatalogPart>();

  // Batch fetch from catalogParts table by partNum
  const allMeta = await db.catalogParts
    .where('partNum')
    .anyOf([...partNums])
    .toArray();
  for (const meta of allMeta) {
    result.set(meta.partNum, meta);
  }

  return result;
}

/**
 * Pull owned data from Supabase and merge into IndexedDB.
 *
 * Runs each time the "missing" filter is activated or the page is refreshed,
 * ensuring the missing-parts view reflects cross-device changes.
 *
 * Merge strategy: for each key, keep the max of local and cloud quantities.
 * This is safe in both directions — cloud-ahead (cross-device edits) and
 * local-ahead (changes not yet pushed by SyncWorker) are both preserved.
 *
 * Limitation: quantity *decreases* made on another device will not be
 * reflected until this device's local data is cleared (e.g. cache reset).
 * This is acceptable because decreases are rare (corrections only) and
 * the per-set watermark-based delta sync in useSupabaseOwned handles the
 * full bidirectional case when a set detail page is opened.
 */
let _lastCloudSyncAt = 0;
const CLOUD_SYNC_COOLDOWN_MS = 30_000;

async function syncOwnedFromCloud(userId: string): Promise<void> {
  const now = Date.now();
  if (now - _lastCloudSyncAt < CLOUD_SYNC_COOLDOWN_MS) return;
  _lastCloudSyncAt = now;

  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('user_set_parts')
    .select('set_num, part_num, color_id, owned_quantity')
    .eq('user_id', userId)
    .eq('is_spare', false)
    .gt('owned_quantity', 0)
    .limit(10000);

  if (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[syncOwnedFromCloud] Supabase query failed:',
        error.message
      );
    }
    // Reset timestamp so next attempt isn't blocked by cooldown
    _lastCloudSyncAt = 0;
    return;
  }

  if (!data || data.length === 0) return;

  if (data.length === 10000 && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[syncOwnedFromCloud] Hit 10K row limit — some owned data may be missing'
    );
  }

  // Group by set
  const bySet = new Map<string, { key: string; qty: number }[]>();
  for (const row of data) {
    let arr = bySet.get(row.set_num);
    if (!arr) {
      arr = [];
      bySet.set(row.set_num, arr);
    }
    arr.push({
      key: `${row.part_num}:${row.color_id}`,
      qty: row.owned_quantity,
    });
  }

  // Merge cloud data with local data (max wins per key)
  for (const [setNum, entries] of bySet) {
    const localQtys = await getOwnedForSet(setNum);
    const merged: Record<string, number> = { ...localQtys };
    let changed = false;

    for (const e of entries) {
      const cloudQty = e.qty;
      const localQty = merged[e.key] ?? 0;
      if (cloudQty > localQty) {
        merged[e.key] = cloudQty;
        changed = true;
      }
    }

    if (changed) {
      await setOwnedForSet(setNum, merged);
    }
  }
}

async function getAllSetNumbersWithOwnedData(): Promise<string[]> {
  if (!isIndexedDBAvailable()) return [];
  const db = getLocalDb();
  return (await db.localOwned.orderBy('setNumber').uniqueKeys()) as string[];
}

export function useCollectionParts(
  sourceFilter: PartsSourceFilter,
  syncPartsFromSets: boolean
) {
  const [parts, setParts] = useState<CollectionPart[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { user } = useSupabaseUser();
  const userId = user?.id ?? null;
  const userSets = useUserSetsStore(state => state.sets);
  const setsHydrated = useUserSetsStore(state => state.setsHydrated);

  // Epoch counter to discard results from superseded loadParts calls.
  // Same pattern as cacheEpoch in owned.ts.
  const loadEpochRef = useRef(0);

  const ownedSetInfos: SetInfo[] = useMemo(() => {
    if (!setsHydrated) return [];
    return Object.values(userSets)
      .filter(s => s.status.owned)
      .map(s => ({ setNumber: s.setNumber, setName: s.name }));
  }, [userSets, setsHydrated]);

  /**
   * Load and compute collection parts from IndexedDB (+ optional cloud sync).
   * @param skipCloudSync - When true, only re-reads local IndexedDB without
   *   querying Supabase. Used by the cross-tab pull listener since the pushing
   *   tab already wrote to the shared IndexedDB.
   */
  const loadParts = useCallback(
    async (skipCloudSync = false) => {
      const myEpoch = ++loadEpochRef.current;
      setIsLoading(true);
      try {
        // Ensure any in-flight owned-quantity writes have landed in IndexedDB
        // before we read. The owned Zustand store uses fire-and-forget async
        // writes, so switching filters can race against pending persistence.
        await flushPendingWritesAsync();

        if (sourceFilter === 'missing') {
          // Path B: only sets where the user has marked ≥1 piece owned
          if (userId && !skipCloudSync) await syncOwnedFromCloud(userId);
          const allSetNums = await getAllSetNumbersWithOwnedData();
          const catalog = await loadCatalogPartsForSets(allSetNums);
          const partMeta = await loadPartMetadata(catalog);

          const ownedData = await Promise.all(
            allSetNums.map(async setNum => {
              const ownedByKey = await getOwnedForSet(setNum);
              const userSet = userSets[setNum.toLowerCase()];
              return {
                setNumber: setNum,
                setName: userSet?.name ?? setNum,
                ownedByKey,
              };
            })
          );

          if (myEpoch !== loadEpochRef.current) return;
          setParts(computeMissingParts(catalog, ownedData, partMeta));
        } else {
          // Path A: owned sets + loose
          const setInfos = syncPartsFromSets ? ownedSetInfos : [];
          const catalog = await loadCatalogPartsForSets(
            setInfos.map(s => s.setNumber)
          );
          const partMeta = await loadPartMetadata(catalog);
          const looseParts = await getAllLooseParts();

          const ownedData = await Promise.all(
            setInfos.map(async ({ setNumber, setName }) => ({
              setNumber,
              setName,
              ownedByKey: await getOwnedForSet(setNumber),
            }))
          );

          if (myEpoch !== loadEpochRef.current) return;
          setParts(
            aggregateOwnedParts(catalog, ownedData, looseParts, partMeta)
          );
        }
      } catch (err) {
        if (myEpoch !== loadEpochRef.current) return;
        if (process.env.NODE_ENV !== 'production') {
          console.warn('useCollectionParts: failed to load', err);
        }
        setParts([]);
      } finally {
        if (myEpoch === loadEpochRef.current) setIsLoading(false);
      }
    },
    [sourceFilter, syncPartsFromSets, ownedSetInfos, userSets, userId]
  );

  useEffect(() => {
    if (!setsHydrated) return;
    loadParts();
  }, [setsHydrated, loadParts]);

  // Re-read from IndexedDB when another tab pushes sync data.
  // Skip cloud sync — the pushing tab already wrote to the shared IndexedDB.
  // Use a ref so the listener always calls the latest loadParts without
  // re-subscribing on every callback identity change.
  const loadPartsRef = useRef(loadParts);
  loadPartsRef.current = loadParts;

  useEffect(() => {
    const coordinator = getTabCoordinator();
    if (!coordinator) return;
    return coordinator.onPullRequested(() => {
      loadPartsRef.current(true);
    });
  }, []);

  return { parts, isLoading, reload: loadParts };
}
