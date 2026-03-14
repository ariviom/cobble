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
import type { CatalogPart, CatalogSetPart } from '@/app/lib/localDb/schema';
import { getLocalDb, isIndexedDBAvailable } from '@/app/lib/localDb/schema';
import { getWatermark } from '@/app/lib/localDb/watermarkStore';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  const uncached: string[] = [];

  for (const setNum of setNumbers) {
    const parts = await db.catalogSetParts
      .where('setNumber')
      .equals(setNum)
      .toArray();
    if (parts.length > 0) {
      result.set(setNum, parts);
    } else {
      uncached.push(setNum);
    }
  }

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
 * Pull owned data from Supabase into IndexedDB for sets that haven't been
 * synced yet on this device (watermark === 0). This ensures the "missing"
 * filter works on fresh devices before the user opens individual set pages.
 *
 * Watermarks are NOT advanced here — the per-set delta pull in
 * useSupabaseOwned handles that when the user opens individual sets.
 */
let _cloudSyncDoneForUser: string | null = null;

async function syncOwnedFromCloud(userId: string): Promise<void> {
  if (_cloudSyncDoneForUser === userId) return;

  const supabase = getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('user_set_parts')
    .select('set_num, part_num, color_id, owned_quantity')
    .eq('user_id', userId)
    .eq('is_spare', false)
    .gt('owned_quantity', 0)
    .limit(10000);

  if (error) return;

  _cloudSyncDoneForUser = userId;

  if (!data || data.length === 0) return;

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

  // Write to IndexedDB only for sets that haven't been synced yet
  for (const [setNum, entries] of bySet) {
    const watermark = await getWatermark(userId, setNum);
    if (watermark > 0) continue; // already synced on this device

    const quantities: Record<string, number> = {};
    for (const e of entries) {
      quantities[e.key] = e.qty;
    }
    await setOwnedForSet(setNum, quantities);
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

  const ownedSetInfos: SetInfo[] = useMemo(() => {
    if (!setsHydrated) return [];
    return Object.values(userSets)
      .filter(s => s.status.owned)
      .map(s => ({ setNumber: s.setNumber, setName: s.name }));
  }, [userSets, setsHydrated]);

  const loadParts = useCallback(async () => {
    setIsLoading(true);
    try {
      if (sourceFilter === 'missing') {
        // Path B: only sets where the user has marked ≥1 piece owned
        if (userId) await syncOwnedFromCloud(userId);
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

        setParts(aggregateOwnedParts(catalog, ownedData, looseParts, partMeta));
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('useCollectionParts: failed to load', err);
      }
      setParts([]);
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter, syncPartsFromSets, ownedSetInfos, userSets, userId]);

  useEffect(() => {
    if (!setsHydrated) return;
    loadParts();
  }, [setsHydrated, loadParts]);

  return { parts, isLoading, reload: loadParts };
}
