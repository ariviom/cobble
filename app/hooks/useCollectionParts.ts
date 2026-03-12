'use client';

import {
  aggregateOwnedParts,
  computeMissingParts,
} from '@/app/components/collection/parts/aggregation';
import type {
  CollectionPart,
  PartsSourceFilter,
} from '@/app/components/collection/parts/types';
import { setCachedInventory } from '@/app/lib/localDb/catalogCache';
import { getAllLooseParts } from '@/app/lib/localDb/loosePartsStore';
import { getOwnedForSet } from '@/app/lib/localDb/ownedStore';
import type { CatalogPart, CatalogSetPart } from '@/app/lib/localDb/schema';
import { getLocalDb, isIndexedDBAvailable } from '@/app/lib/localDb/schema';
import { useUserSetsStore } from '@/app/store/user-sets';
import { useCallback, useEffect, useMemo, useState } from 'react';

type SetInfo = { setNumber: string; setName: string };

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

  // Fetch uncached inventories from API (which also populates IndexedDB)
  if (uncached.length > 0) {
    await Promise.all(
      uncached.map(async setNum => {
        try {
          const res = await fetch(
            `/api/inventory?set=${encodeURIComponent(setNum)}`
          );
          if (!res.ok) return;
          const data = (await res.json()) as {
            rows: import('@/app/components/set/types').InventoryRow[];
            inventoryVersion?: string | null;
          };
          if (data.rows.length > 0) {
            await setCachedInventory(setNum, data.rows, {
              inventoryVersion: data.inventoryVersion ?? null,
            });
            // Re-read from IndexedDB now that it's cached
            const parts = await db.catalogSetParts
              .where('setNumber')
              .equals(setNum)
              .toArray();
            if (parts.length > 0) result.set(setNum, parts);
          }
        } catch {
          // Graceful degradation — skip sets we can't fetch
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
        // Path B: all sets with owned data
        const allSetNums = await getAllSetNumbersWithOwnedData();
        const catalog = await loadCatalogPartsForSets(allSetNums);
        const partMeta = await loadPartMetadata(catalog);

        const ownedData = await Promise.all(
          allSetNums.map(async setNum => {
            const ownedByKey = await getOwnedForSet(setNum);
            // useUserSetsStore normalizes keys to lowercase
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
  }, [sourceFilter, syncPartsFromSets, ownedSetInfos, userSets]);

  useEffect(() => {
    if (!setsHydrated) return;
    loadParts();
  }, [setsHydrated, loadParts]);

  return { parts, isLoading, reload: loadParts };
}
