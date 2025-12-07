'use client';

import type { InventoryRow } from '@/app/components/set/types';
import { useOwnedSnapshot } from '@/app/hooks/useOwnedSnapshot';
import { throwAppErrorFromResponse } from '@/app/lib/domain/errors';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import {
  getCachedInventory,
  isIndexedDBAvailable,
  setCachedInventory,
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
async function fetchInventory(
  setNumber: string,
  signal?: AbortSignal
): Promise<InventoryRow[]> {
  // Try to fetch catalog inventory version so we can validate local cache
  let inventoryVersion: string | null = null;
  if (isIndexedDBAvailable()) {
    try {
      const versionRes = await fetch(
        `/api/catalog/versions?sources=inventory_parts`,
        { cache: 'no-store', signal: signal ?? null }
      );
      if (versionRes.ok) {
        const payload = (await versionRes.json()) as {
          versions?: Record<string, string | null>;
        };
        inventoryVersion = payload.versions?.inventory_parts ?? null;
      }
    } catch (err) {
      console.warn('Failed to fetch inventory version (will fall back to TTL):', err);
    }
  }

  // Try local cache first (if IndexedDB is available)
  if (isIndexedDBAvailable()) {
    try {
      const cached = await getCachedInventory(setNumber, inventoryVersion);
      if (cached && cached.length > 0) {
        return cached;
      }
    } catch (error) {
      console.warn('Failed to read inventory from cache:', error);
    }
  }

  const fetchInit: RequestInit = signal ? { signal } : {};
  const res = await fetch(
    `/api/inventory?set=${encodeURIComponent(setNumber)}`,
    fetchInit
  );
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'inventory_failed');
  }
  const data = (await res.json()) as {
    rows: InventoryRow[];
    inventoryVersion?: string | null;
  };
  const rows = data.rows;
  const responseVersion = data.inventoryVersion ?? inventoryVersion ?? null;

  if (isIndexedDBAvailable() && rows.length > 0) {
    setCachedInventory(setNumber, rows, { inventoryVersion: responseVersion }).catch(error => {
      console.warn('Failed to cache inventory:', error);
    });
  }

  return rows;
}

export function useInventory(setNumber: string): UseInventoryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory', setNumber],
    queryFn: ({ signal }) => fetchInventory(setNumber, signal),
    staleTime: 5 * 60 * 1000, // align with short-lived cache window
    gcTime: 60 * 60 * 1000,
  });

  const rows = useMemo(() => data ?? [], [data]);

  const keys = useMemo(
    () => rows.map(r => r.inventoryKey ?? `${r.partId}:${r.colorId}`),
    [rows]
  );
  const required = useMemo(() => rows.map(r => r.quantityRequired), [rows]);

  const {
    ownedByKey,
    isHydrated: isOwnedHydrated,
    isStorageAvailable,
  } = useOwnedSnapshot(setNumber, keys);

  const totals = useMemo(() => {
    let totalRequired = 0;
    let totalMissing = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const k = keys[i]!;
      totalRequired += r.quantityRequired;
      const owned = ownedByKey[k] ?? 0;
      totalMissing += Math.max(0, r.quantityRequired - owned);
    }
    return {
      totalRequired,
      totalMissing,
      ownedTotal: totalRequired - totalMissing,
    };
  }, [rows, keys, ownedByKey]);

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
    totalRequired: totals.totalRequired,
    totalMissing: totals.totalMissing,
    ownedTotal: totals.ownedTotal,
    ownedByKey,
    computeMissingRows,
    isOwnedHydrated,
    isStorageAvailable,
  };
}
