'use client';

import type { InventoryRow } from '@/app/components/set/types';
import { useOwnedSnapshot } from '@/app/hooks/useOwnedSnapshot';
import { throwAppErrorFromResponse } from '@/app/lib/domain/errors';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import {
  getCachedInventory,
  setCachedInventory,
  isIndexedDBAvailable,
} from '@/app/lib/localDb';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

export type UseInventoryResult = {
  rows: InventoryRow[];
  isLoading: boolean;
  error: Error | null;
  keys: string[];
  required: number[];
  totalRequired: number;
  totalMissing: number;
  ownedTotal: number;
  ownedByKey: Record<string, number>;
  computeMissingRows: () => MissingRow[];
  /** Whether owned data has been hydrated from IndexedDB */
  isOwnedHydrated: boolean;
  /** Whether IndexedDB is available (false = in-memory only, data will be lost) */
  isStorageAvailable: boolean;
};

/**
 * Fetch inventory with local-first caching.
 *
 * Flow:
 * 1. Check IndexedDB cache for valid cached data
 * 2. If found and fresh, return immediately (no network)
 * 3. Otherwise, fetch from /api/inventory
 * 4. Cache the result in IndexedDB for future use
 */
async function fetchInventory(setNumber: string): Promise<InventoryRow[]> {
  // Try local cache first (if IndexedDB is available)
  if (isIndexedDBAvailable()) {
    try {
      const cached = await getCachedInventory(setNumber);
      if (cached && cached.length > 0) {
        // Return cached data immediately
        // TanStack Query will handle background revalidation if configured
        return cached;
      }
    } catch (error) {
      // Cache read failed, fall through to network fetch
      console.warn('Failed to read inventory from cache:', error);
    }
  }

  // Fetch from network
  const res = await fetch(
    `/api/inventory?set=${encodeURIComponent(setNumber)}`
  );
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'inventory_failed');
  }
  const data = (await res.json()) as { rows: InventoryRow[] };
  const rows = data.rows;

  // Cache the result for future use (fire-and-forget)
  if (isIndexedDBAvailable() && rows.length > 0) {
    setCachedInventory(setNumber, rows).catch(error => {
      console.warn('Failed to cache inventory:', error);
    });
  }

  return rows;
}

export function useInventory(setNumber: string): UseInventoryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory', setNumber],
    queryFn: () => fetchInventory(setNumber),
  });
  const rows = useMemo(() => data ?? [], [data]);
  const keys = useMemo(
    () => rows.map(r => r.inventoryKey ?? `${r.partId}:${r.colorId}`),
    [rows]
  );
  const required = useMemo(() => rows.map(r => r.quantityRequired), [rows]);
  const totalRequired = useMemo(
    () => required.reduce((acc, n) => acc + n, 0),
    [required]
  );

  const {
    ownedByKey,
    isHydrated: isOwnedHydrated,
    isStorageAvailable,
  } = useOwnedSnapshot(setNumber, keys);

  const totalMissing = useMemo(() => {
    return rows.reduce((acc, r, idx) => {
      const k = keys[idx]!;
      const own = ownedByKey[k] ?? 0;
      const missing = Math.max(0, r.quantityRequired - own);
      return acc + missing;
    }, 0);
  }, [rows, keys, ownedByKey]);

  const ownedTotal = useMemo(
    () => totalRequired - totalMissing,
    [totalRequired, totalMissing]
  );

  const computeMissingRows = () => {
    const result: MissingRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const k = keys[i]!;
      const own = ownedByKey[k] ?? 0;
      const missing = Math.max(0, r.quantityRequired - own);
      if (missing > 0) {
        result.push({
          setNumber,
          partId: r.partId,
          colorId: r.colorId,
          quantityMissing: missing,
          elementId: r.elementId ?? null,
        });
      }
    }
    return result;
  };

  return {
    rows,
    isLoading,
    error: error instanceof Error ? error : null,
    keys,
    required,
    totalRequired,
    totalMissing,
    ownedTotal,
    ownedByKey,
    computeMissingRows,
    isOwnedHydrated,
    isStorageAvailable,
  };
}
