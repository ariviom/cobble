'use client';

import { isMinifigParentRow } from '@/app/components/set/inventory-utils';
import type { InventoryRow } from '@/app/components/set/types';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { exportOwnedWithTimestamps } from '@/app/lib/localDb/ownedStore';
import { enqueueOwnedChangeIfPossible } from '@/app/lib/ownedSync';
import { useOwnedStore, type OwnedState } from '@/app/store/owned';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UseSupabaseOwnedArgs = {
  setNumber: string;
  rows: InventoryRow[];
  keys: string[];
  /**
   * When false, Supabase-backed persistence is disabled and all changes remain
   * local to the in-memory store / localStorage. This is used for participants
   * in Search Party sessions so only the host writes to user_set_parts.
   */
  enableCloudSync?: boolean;
};

type HandleOwnedChangeOptions = {
  /**
   * Skip cascade to children. Used when programmatically updating children
   * to avoid infinite loops.
   */
  skipCascade?: boolean;
};

type MigrationState = {
  open: boolean;
  localTotal: number;
  supabaseTotal: number;
};

type UseSupabaseOwnedResult = {
  handleOwnedChange: (
    key: string,
    nextOwned: number,
    options?: HandleOwnedChangeOptions
  ) => void;
  markAllComplete: () => void;
  markAllMissing: () => void;
  migration: MigrationState | null;
  isMigrating: boolean;
  confirmMigration: () => Promise<void>;
  keepCloudData: () => Promise<void>;
};

export function useSupabaseOwned({
  setNumber,
  rows,
  keys,
  enableCloudSync = true,
}: UseSupabaseOwnedArgs): UseSupabaseOwnedResult {
  const { user } = useSupabaseUser();

  const [migration, setMigration] = useState<MigrationState | null>(null);
  const [isMigrating] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Client ID for sync queue operations (stable per browser session)
  const clientIdRef = useRef<string | null>(null);

  const userId = user?.id ?? null;

  const getOwned = useOwnedStore((state: OwnedState) => state.getOwned);
  const setOwned = useOwnedStore((state: OwnedState) => state.setOwned);
  const clearAll = useOwnedStore((state: OwnedState) => state.clearAll);
  const markAllAsOwned = useOwnedStore(
    (state: OwnedState) => state.markAllAsOwned
  );
  const hydratedSets = useOwnedStore(
    (state: OwnedState) => state._hydratedSets
  );
  const hydrateFromIndexedDB = useOwnedStore(
    (state: OwnedState) => state.hydrateFromIndexedDB
  );
  const isOwnedHydrated = hydratedSets.has(setNumber);

  // Ensure IndexedDB hydration has been triggered for this set.
  useEffect(() => {
    if (isOwnedHydrated) return;
    void hydrateFromIndexedDB(setNumber);
  }, [setNumber, hydrateFromIndexedDB, isOwnedHydrated]);

  // Initialize client ID on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (clientIdRef.current) return;

    // Try to get existing client ID from localStorage
    const storedId = window.localStorage.getItem('brick_party_sync_client_id');
    if (storedId) {
      clientIdRef.current = storedId;
    } else {
      // Generate new client ID
      const newId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `client_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      window.localStorage.setItem('brick_party_sync_client_id', newId);
      clientIdRef.current = newId;
    }
  }, []);

  /**
   * Enqueue an owned quantity change to the sync queue.
   * The DataProvider's sync worker will batch and send these to /api/sync.
   */
  const enqueueChange = useCallback(
    (key: string, quantity: number) => {
      const clientId = clientIdRef.current ?? 'unknown';
      enqueueOwnedChangeIfPossible({
        enableCloudSync,
        userId,
        clientId,
        setNumber,
        key,
        quantity,
      }).catch(error => {
        console.warn('Failed to enqueue owned change:', error);
      });
    },
    [enableCloudSync, setNumber, userId]
  );

  // Memoized map for O(1) row lookups (performance optimization)
  const rowByKey = useMemo(() => {
    const map = new Map<string, InventoryRow>();
    for (const row of rows) {
      const key = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
      map.set(key, row);
    }
    return map;
  }, [rows]);

  const handleOwnedChange = useCallback(
    (key: string, nextOwned: number, options?: HandleOwnedChangeOptions) => {
      // CASCADE DOWN: If this is a parent minifig, update its children
      // (Must calculate BEFORE updating parent owned value)
      if (!options?.skipCascade) {
        const row = rowByKey.get(key);

        // Check if this row is a minifig parent with component relations
        if (row?.componentRelations && row.componentRelations.length > 0) {
          if (isMinifigParentRow(row)) {
            // Get current parent owned BEFORE updating
            const previousParentOwned = getOwned(setNumber, key);
            const parentDelta = nextOwned - previousParentOwned;

            for (const child of row.componentRelations) {
              const childRow = rowByKey.get(child.key);
              if (!childRow) continue;

              // How many does THIS parent need?
              const parentContribution = child.quantity;

              // Current child owned
              const currentChildOwned = getOwned(setNumber, child.key);

              // Calculate contribution-based delta
              const childDelta = parentDelta * parentContribution;
              const newChildOwned = Math.max(
                0,
                Math.min(
                  childRow.quantityRequired,
                  currentChildOwned + childDelta
                )
              );

              // Update child (skip cascade to avoid infinite loop)
              setOwned(setNumber, child.key, newChildOwned);

              // Enqueue child for sync if cloud sync enabled
              if (enableCloudSync && userId) {
                enqueueChange(child.key, newChildOwned);
              }
            }
          }
        }

        // CASCADE UP: If this is a minifig subpart, update its parent(s)
        // Calculate how many complete minifigs can be built from subparts
        if (row?.parentRelations && row.parentRelations.length > 0) {
          for (const parentRel of row.parentRelations) {
            const parentRow = rowByKey.get(parentRel.parentKey);
            if (!parentRow || !parentRow.componentRelations) continue;
            if (!isMinifigParentRow(parentRow)) continue;

            // Calculate how many complete minifigs can be built
            const minifigQty = parentRow.quantityRequired;
            let minComplete = minifigQty;

            for (const childRel of parentRow.componentRelations) {
              // Use the new value for the changed key, current value for others
              const childOwned =
                childRel.key === key
                  ? nextOwned
                  : getOwned(setNumber, childRel.key);

              // How many complete minifigs can this component support?
              const completeFromThis =
                childRel.quantity > 0
                  ? Math.floor(childOwned / childRel.quantity)
                  : minifigQty;

              minComplete = Math.min(minComplete, completeFromThis);
            }

            const newParentOwned = Math.max(
              0,
              Math.min(minComplete, minifigQty)
            );
            const currentParentOwned = getOwned(setNumber, parentRel.parentKey);

            if (newParentOwned !== currentParentOwned) {
              // Update parent (skip cascade to avoid infinite loop)
              setOwned(setNumber, parentRel.parentKey, newParentOwned);

              // Enqueue parent for sync if cloud sync enabled
              if (enableCloudSync && userId) {
                enqueueChange(parentRel.parentKey, newParentOwned);
              }
            }
          }
        }
      }

      // Update local store (IndexedDB + in-memory cache)
      setOwned(setNumber, key, nextOwned);

      if (!enableCloudSync || !userId) {
        // Anonymous users or Search Party participants remain
        // local-only (no Supabase sync).
        return;
      }

      // Enqueue change for sync to Supabase via the sync worker
      enqueueChange(key, nextOwned);
    },
    [
      enableCloudSync,
      setOwned,
      getOwned,
      setNumber,
      userId,
      enqueueChange,
      rowByKey,
    ]
  );

  // Initial hydration: per-key LWW reconciliation with cloud data.
  useEffect(() => {
    if (!enableCloudSync || !userId) return;
    if (rows.length === 0 || keys.length === 0) return;
    if (!isOwnedHydrated) return;
    if (hydrated) return;

    let cancelled = false;
    const PAGE_SIZE = 500;
    const abortController = new AbortController();
    const timeoutId =
      typeof window !== 'undefined'
        ? window.setTimeout(() => abortController.abort(), 10_000)
        : undefined;

    async function run() {
      const supabase = getSupabaseBrowserClient();
      const supabaseByKey = new Map<
        string,
        { qty: number; updatedAt: number }
      >();
      let offset = 0;
      let error: { message: string } | null = null;

      while (true) {
        const { data, error: pageError } = await supabase
          .from('user_set_parts')
          .select('part_num, color_id, is_spare, owned_quantity, updated_at')
          .eq('user_id', userId as string)
          .eq('set_num', setNumber)
          .range(offset, offset + PAGE_SIZE - 1)
          // Abort if the request overruns the timeout or the effect cleans up.
          .abortSignal(abortController.signal);

        if (pageError) {
          error = pageError;
          break;
        }

        for (const row of data ?? []) {
          if (row.is_spare) continue;
          const key = `${row.part_num}:${row.color_id}`;
          const ts = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          supabaseByKey.set(key, {
            qty: row.owned_quantity ?? 0,
            updatedAt: ts,
          });
        }

        if (!data || data.length < PAGE_SIZE) {
          break;
        }
        offset += PAGE_SIZE;
      }

      if (cancelled) return;

      if (error) {
        console.error('Failed to load user_set_parts for hydration', {
          setNumber,
          error: error.message,
        });
        return;
      }

      // Filter out cloud entries whose keys don't match any current inventory key.
      const inventoryKeySet = new Set(keys);
      for (const k of supabaseByKey.keys()) {
        if (!inventoryKeySet.has(k)) {
          supabaseByKey.delete(k);
        }
      }

      // Per-key last-write-wins reconciliation
      const { entries: localEntries } =
        await exportOwnedWithTimestamps(setNumber);
      if (cancelled) return;

      const localByKeyWithTs = new Map(
        localEntries.map(e => [
          e.key,
          { qty: e.quantity, updatedAt: e.updatedAt },
        ])
      );

      // Reconcile: per-key, newer timestamp wins (cloud wins ties)
      for (const [key, cloud] of supabaseByKey) {
        const local = localByKeyWithTs.get(key);
        if (!local || cloud.updatedAt >= local.updatedAt) {
          // Cloud is newer or equal (tie-break) or key only in cloud → apply cloud
          setOwned(setNumber, key, cloud.qty);
        }
        // If local is newer, keep local value (already in store)
      }

      // Keys only in local but not cloud → enqueue for cloud sync
      for (const [key] of localByKeyWithTs) {
        if (!supabaseByKey.has(key)) {
          const localEntry = localByKeyWithTs.get(key)!;
          enqueueChange(key, localEntry.qty);
        }
      }

      setHydrated(true);
    }

    void run();

    return () => {
      cancelled = true;
      abortController.abort();
      if (typeof timeoutId === 'number') {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    enableCloudSync,
    userId,
    rows.length,
    keys,
    setOwned,
    setNumber,
    hydrated,
    isOwnedHydrated,
    enqueueChange,
  ]);

  const confirmMigration = useCallback(async () => {
    // No-op: per-key LWW reconciliation handles sync automatically
  }, []);

  const keepCloudData = useCallback(async () => {
    // No-op: per-key LWW reconciliation handles sync automatically
    setMigration(null);
  }, []);

  // -------------------------------------------------------------------------
  // Bulk actions — update local store efficiently + enqueue sync for each key
  // -------------------------------------------------------------------------

  const required = useMemo(() => rows.map(r => r.quantityRequired), [rows]);

  const markAllComplete = useCallback(() => {
    // Single bulk write for responsive local update
    markAllAsOwned(setNumber, keys, required);

    if (!enableCloudSync || !userId) return;
    for (let i = 0; i < keys.length; i++) {
      enqueueChange(keys[i]!, required[i]!);
    }
  }, [
    markAllAsOwned,
    setNumber,
    keys,
    required,
    enableCloudSync,
    userId,
    enqueueChange,
  ]);

  const markAllMissing = useCallback(() => {
    // Enqueue zeros BEFORE clearing so we can read current values
    if (enableCloudSync && userId) {
      for (const key of keys) {
        enqueueChange(key, 0);
      }
    }

    clearAll(setNumber);
  }, [clearAll, setNumber, keys, enableCloudSync, userId, enqueueChange]);

  return {
    handleOwnedChange,
    markAllComplete,
    markAllMissing,
    migration,
    isMigrating,
    confirmMigration,
    keepCloudData,
  };
}
