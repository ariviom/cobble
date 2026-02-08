'use client';

import { isMinifigParentRow } from '@/app/components/set/inventory-utils';
import type { InventoryRow } from '@/app/components/set/types';
import { useOwnedSnapshot } from '@/app/hooks/useOwnedSnapshot';
import { throwAppErrorFromResponse } from '@/app/lib/domain/errors';
import { getLegacyKeys } from '@/app/lib/domain/partIdentity';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import {
  getCachedInventory,
  isIndexedDBAvailable,
  setCachedInventory,
} from '@/app/lib/localDb';
import { migrateOwnedKeys } from '@/app/lib/localDb/ownedStore';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

export type MinifigStatus = {
  state: 'complete' | 'missing' | 'unknown';
  missingCount: number;
};

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
  /** Computed status for parent minifigs based on their subparts */
  minifigStatusByKey: Map<string, MinifigStatus>;
  computeMissingRows: () => MissingRow[];
  /** Whether owned data has been hydrated from IndexedDB */
  isOwnedHydrated: boolean;
  /** Whether IndexedDB is available (false = in-memory only, data will be lost) */
  isStorageAvailable: boolean;
};

type FetchInventoryResult = {
  rows: InventoryRow[];
  /** True if data came from IndexedDB cache */
  fromCache: boolean;
  /** Inventory version for cache validation */
  inventoryVersion: string | null;
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
): Promise<FetchInventoryResult> {
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
      // AbortError is expected during React strict mode cleanup - don't log it
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (!isAbort) {
        console.warn(
          'Failed to fetch inventory version (will fall back to TTL):',
          err
        );
      }
    }
  }

  // Try local cache first (if IndexedDB is available)
  if (isIndexedDBAvailable()) {
    try {
      const cached = await getCachedInventory(setNumber, inventoryVersion);
      if (cached && cached.length > 0) {
        return { rows: cached, fromCache: true, inventoryVersion };
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
    setCachedInventory(setNumber, rows, {
      inventoryVersion: responseVersion,
    }).catch(error => {
      console.warn('Failed to cache inventory:', error);
    });
  }

  return {
    rows,
    fromCache: false,
    inventoryVersion: responseVersion,
  };
}

export function useInventory(
  setNumber: string,
  options?: { initialRows?: InventoryRow[] | null }
): UseInventoryResult {
  const { data, isLoading, error } = useQuery<FetchInventoryResult>({
    queryKey: ['inventory', setNumber],
    queryFn: ({ signal }) => fetchInventory(setNumber, signal),
    staleTime: 5 * 60 * 1000, // align with short-lived cache window
    gcTime: 60 * 60 * 1000,
    ...(options?.initialRows
      ? {
          initialData: {
            rows: options.initialRows,
            fromCache: false,
            inventoryVersion: null,
          },
          initialDataUpdatedAt: Date.now(),
        }
      : {}),
  });

  // Deduplicate by canonical key — catches duplicates from server response or cache
  const rows = useMemo(() => {
    const raw = data?.rows ?? [];
    if (raw.length === 0) return raw;
    const seen = new Set<string>();
    return raw.filter(row => {
      const key =
        row.identity?.canonicalKey ??
        row.inventoryKey ??
        `${row.partId}:${row.colorId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data?.rows]);

  const keys = useMemo(
    () =>
      rows.map(
        r =>
          r.identity?.canonicalKey ??
          r.inventoryKey ??
          `${r.partId}:${r.colorId}`
      ),
    [rows]
  );
  const required = useMemo(() => rows.map(r => r.quantityRequired), [rows]);

  const {
    ownedByKey,
    isHydrated: isOwnedHydrated,
    isStorageAvailable,
  } = useOwnedSnapshot(setNumber, keys);

  // One-time migration of owned data from legacy BL keys to canonical keys
  const migrationRanRef = useRef(false);
  useEffect(() => {
    if (migrationRanRef.current || !isOwnedHydrated || rows.length === 0)
      return;
    if (!isIndexedDBAvailable()) return;

    const migrations = rows
      .filter(r => r.identity && r.identity.rowType.includes('subpart'))
      .map(r => ({
        canonicalKey: r.identity!.canonicalKey,
        legacyKeys: getLegacyKeys(r.identity!),
      }))
      .filter(m => m.legacyKeys.some(k => k !== m.canonicalKey));

    if (migrations.length > 0) {
      migrationRanRef.current = true;
      migrateOwnedKeys(setNumber, migrations).catch(() => {
        // Best-effort — failure is non-fatal
      });
    } else {
      migrationRanRef.current = true;
    }
  }, [isOwnedHydrated, rows, setNumber]);

  const totals = useMemo(() => {
    let totalRequired = 0;
    let totalMissing = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const k = keys[i]!;
      if (isMinifigParentRow(r)) {
        continue; // fig parent rows are UX-only; exclude from totals
      }
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

  // Compute minifig status based on subparts (Children → Parent display)
  const minifigStatusByKey = useMemo(() => {
    const result = new Map<string, MinifigStatus>();

    // Build lookup map for O(1) access (performance optimization)
    const rowByKey = new Map<string, InventoryRow>();
    for (const row of rows) {
      const key = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
      rowByKey.set(key, row);
    }

    for (const row of rows) {
      if (!isMinifigParentRow(row)) continue;

      const key = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
      const relations = row.componentRelations ?? [];

      if (relations.length === 0) {
        result.set(key, { state: 'unknown', missingCount: 0 });
        continue;
      }

      // Calculate missing parts for this minifig type
      // rel.quantity = parts per ONE minifig
      // row.quantityRequired = how many of this minifig are in the set
      const minifigQty = row.quantityRequired;
      let missingCount = 0;

      for (const rel of relations) {
        const childOwned = ownedByKey[rel.key] ?? 0;
        const childRow = rowByKey.get(rel.key);

        // Total parts needed for THIS minifig type (per-minifig × minifig count)
        const neededForThisMinifig = rel.quantity * minifigQty;

        // Total parts needed across ALL minifigs (from child row)
        const totalChildRequired =
          childRow?.quantityRequired ?? neededForThisMinifig;

        // Total parts missing across all minifigs sharing this part
        const totalMissing = Math.max(0, totalChildRequired - childOwned);

        if (totalMissing > 0) {
          // Proportionally attribute missing to this minifig type
          // This handles shared parts fairly (e.g., if 2 minifig types share a part)
          const share = neededForThisMinifig / totalChildRequired;
          missingCount += Math.round(totalMissing * share);
        }
      }

      result.set(key, {
        state: missingCount === 0 ? 'complete' : 'missing',
        missingCount,
      });
    }

    return result;
  }, [rows, ownedByKey]);

  const computeMissingRows = () => {
    const result: MissingRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const k = keys[i]!;
      if (isMinifigParentRow(r)) continue;
      const own = ownedByKey[k] ?? 0;
      const missing = Math.max(0, r.quantityRequired - own);
      if (missing > 0) {
        result.push({
          setNumber,
          partId: r.partId,
          colorId: r.colorId,
          quantityMissing: missing,
          elementId: r.elementId ?? null,
          ...(r.identity ? { identity: r.identity } : {}),
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
    minifigStatusByKey,
    computeMissingRows,
    isOwnedHydrated,
    isStorageAvailable,
  };
}
