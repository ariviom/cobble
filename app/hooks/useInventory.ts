'use client';

import { isMinifigParentRow } from '@/app/components/set/inventory-utils';
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
import { useMinifigEnrichment } from './useMinifigEnrichment';

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
  /** Whether minifig enrichment is in progress */
  isMinifigEnriching: boolean;
  /** Last minifig enrichment error, if any */
  minifigEnrichmentError: string | null;
  /** Trigger a retry for minifig enrichment (best-effort) */
  retryMinifigEnrichment: () => Promise<void>;
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
      console.warn(
        'Failed to fetch inventory version (will fall back to TTL):',
        err
      );
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
    minifigEnrichmentNeeded?: {
      figNums: string[];
      missingImages: string[];
      missingSubparts: string[];
    };
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

  return rows;
}

export function useInventory(
  setNumber: string,
  options?: { initialRows?: InventoryRow[] | null }
): UseInventoryResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['inventory', setNumber],
    queryFn: ({ signal }) => fetchInventory(setNumber, signal),
    staleTime: 5 * 60 * 1000, // align with short-lived cache window
    gcTime: 60 * 60 * 1000,
    ...(options?.initialRows
      ? { initialData: options.initialRows, initialDataUpdatedAt: Date.now() }
      : {}),
  });

  const baseRows = useMemo(() => data ?? [], [data]);

  const minifigData = useMemo(() => {
    const figNums: string[] = [];
    const existingData = new Map<
      string,
      {
        imageUrl: string | null;
        hasSubparts: boolean;
        hasSubpartImages: boolean;
      }
    >();

    const rowByKey = new Map<string, InventoryRow>();
    for (const row of baseRows) {
      const key = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
      if (key) rowByKey.set(key, row);
    }

    for (const row of baseRows) {
      const isFig =
        row.parentCategory === 'Minifigure' &&
        typeof row.partId === 'string' &&
        row.partId.startsWith('fig:');
      if (!isFig) continue;
      const figNum = row.partId.replace(/^fig:/, '');
      figNums.push(figNum);

      const relations = row.componentRelations ?? [];
      const hasSubparts = relations.length > 0;
      const hasSubpartImages =
        hasSubparts &&
        relations.every(rel => {
          const child = rowByKey.get(rel.key);
          return Boolean(child?.imageUrl);
        });

      existingData.set(figNum, {
        imageUrl: row.imageUrl,
        hasSubparts,
        hasSubpartImages,
      });
    }
    return { figNums, existingData };
  }, [baseRows]);

  const {
    enrichedData,
    isEnriching,
    error: enrichmentError,
    enrichFigs,
  } = useMinifigEnrichment({
    figNums: minifigData.figNums,
    existingData: minifigData.existingData,
    enabled: !isLoading && baseRows.length > 0,
  });

  const retryMinifigEnrichment = useMemo(
    () => () => enrichFigs(minifigData.figNums),
    [enrichFigs, minifigData.figNums]
  );

  const rows = useMemo(() => {
    if (enrichedData.size === 0) return baseRows;

    const working = baseRows.map(row => {
      const inventoryKey = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
      return { ...row, inventoryKey };
    });
    const indexByKey = new Map<string, number>();
    working.forEach((row, idx) => {
      if (row.inventoryKey) indexByKey.set(row.inventoryKey, idx);
    });

    for (let i = 0; i < working.length; i += 1) {
      const row = working[i]!;
      const isFig =
        row.parentCategory === 'Minifigure' &&
        typeof row.partId === 'string' &&
        row.partId.startsWith('fig:');
      if (!isFig) continue;

      const figNum = row.partId.replace(/^fig:/, '');
      const enrichment = enrichedData.get(figNum);
      if (!enrichment) continue;

      const parentKey = row.inventoryKey ?? `fig:${figNum}`;
      // Update parent image / BL id
      row.imageUrl = enrichment.imageUrl ?? row.imageUrl;
      row.bricklinkFigId = enrichment.blId ?? row.bricklinkFigId ?? null;

      // Attach component relations when missing
      if (
        (!row.componentRelations || row.componentRelations.length === 0) &&
        enrichment.subparts
      ) {
        row.componentRelations = enrichment.subparts.map(sp => ({
          key: `${sp.partId}:${sp.colorId}`,
          quantity: sp.quantity,
        }));
      }

      if (enrichment.subparts) {
        for (const sp of enrichment.subparts) {
          const childKey = `${sp.partId}:${sp.colorId}`;
          const existingIdx = indexByKey.get(childKey);
          if (existingIdx != null) {
            const child = working[existingIdx]!;
            if (sp.imageUrl) {
              child.imageUrl = sp.imageUrl;
            }
            if (sp.bricklinkPartId && sp.bricklinkPartId !== child.partId) {
              child.bricklinkPartId = sp.bricklinkPartId;
            }
            child.parentCategory = child.parentCategory ?? 'Minifigure';
            child.partCategoryName =
              child.partCategoryName ?? 'Minifigure Component';
            if (!child.parentRelations) {
              child.parentRelations = [];
            }
            const alreadyLinked = child.parentRelations.some(
              rel => rel.parentKey === parentKey
            );
            if (!alreadyLinked) {
              child.parentRelations.push({
                parentKey,
                quantity: sp.quantity,
              });
            }
          } else {
            // Create a minimal child row so subparts are visible
            const newRow: InventoryRow = {
              setNumber: row.setNumber,
              partId: sp.partId,
              partName: sp.name ?? sp.partId,
              colorId: sp.colorId,
              colorName: sp.colorName ?? `Color ${sp.colorId}`,
              quantityRequired: sp.quantity,
              imageUrl: sp.imageUrl ?? null,
              parentCategory: 'Minifigure',
              partCategoryName: 'Minifigure Component',
              inventoryKey: childKey,
              parentRelations: [{ parentKey, quantity: sp.quantity }],
            };
            if (sp.bricklinkPartId && sp.bricklinkPartId !== sp.partId) {
              newRow.bricklinkPartId = sp.bricklinkPartId;
            }
            working.push(newRow);
            indexByKey.set(childKey, working.length - 1);
          }
        }
      }
    }

    return working;
  }, [baseRows, enrichedData]);

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
    isMinifigEnriching: isEnriching,
    minifigEnrichmentError: enrichmentError,
    retryMinifigEnrichment,
  };
}
