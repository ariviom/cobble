'use client';

import { isMinifigParentRow } from '@/app/components/set/inventory-utils';
import type { InventoryRow } from '@/app/components/set/types';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  getWatermark,
  setWatermark as setWatermarkFn,
} from '@/app/lib/localDb/watermarkStore';
import { getOwnedForSet } from '@/app/lib/localDb/ownedStore';
import { getTabCoordinator } from '@/app/lib/sync/tabCoordinator';
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

type UseSupabaseOwnedResult = {
  handleOwnedChange: (
    key: string,
    nextOwned: number,
    options?: HandleOwnedChangeOptions
  ) => void;
  markAllComplete: () => void;
  markAllMissing: () => void;
};

export function useSupabaseOwned({
  setNumber,
  rows,
  keys,
  enableCloudSync = true,
}: UseSupabaseOwnedArgs): UseSupabaseOwnedResult {
  const { user } = useSupabaseUser();

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

  // Shared delta-pull: fetch rows changed since watermark, apply to store,
  // advance watermark.  Returns the fetched data (for first-pull upload logic)
  // or null on error/abort.
  const deltaPull = useCallback(
    async (signal?: AbortSignal) => {
      if (!userId) return null;

      const supabase = getSupabaseBrowserClient();
      const watermark = await getWatermark(userId, setNumber);

      let query = supabase
        .from('user_set_parts')
        .select('part_num, color_id, is_spare, owned_quantity, sync_version')
        .eq('user_id', userId)
        .eq('set_num', setNumber)
        .eq('is_spare', false)
        .gt('sync_version', watermark)
        .limit(10000);

      if (signal) {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Delta pull failed', { setNumber, error: error.message });
        return null;
      }

      const inventoryKeySet = new Set(keys);
      let maxVersion = watermark;

      for (const row of data ?? []) {
        const key = `${row.part_num}:${row.color_id}`;
        if (!inventoryKeySet.has(key)) continue;
        setOwned(setNumber, key, row.owned_quantity ?? 0);
        const version = Number(row.sync_version);
        if (version > maxVersion) maxVersion = version;
      }

      if (maxVersion > watermark) {
        await setWatermarkFn(userId, setNumber, maxVersion);
      }

      return { data: data ?? [], watermark };
    },
    [userId, setNumber, keys, setOwned]
  );

  // Initial delta pull on hydration
  useEffect(() => {
    if (
      !enableCloudSync ||
      !userId ||
      rows.length === 0 ||
      !isOwnedHydrated ||
      hydrated
    ) {
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), 10_000);

    async function run() {
      const result = await deltaPull(abortController.signal);
      if (cancelled || !result) return;

      // First pull (watermark === 0): enqueue local-only keys for upload
      if (result.watermark === 0) {
        const localData = await getOwnedForSet(setNumber);
        if (cancelled) return;

        const cloudKeys = new Set(
          result.data.map(r => `${r.part_num}:${r.color_id}`)
        );
        for (const [key, qty] of Object.entries(localData)) {
          if (!cloudKeys.has(key) && qty > 0) {
            enqueueChange(key, qty);
          }
        }
      }

      setHydrated(true);
    }

    void run();

    return () => {
      cancelled = true;
      abortController.abort();
      window.clearTimeout(timeoutId);
    };
  }, [
    enableCloudSync,
    userId,
    rows.length,
    setNumber,
    hydrated,
    isOwnedHydrated,
    enqueueChange,
    deltaPull,
  ]);

  // Re-pull on focus / pull_request broadcast
  useEffect(() => {
    if (!enableCloudSync || !userId || rows.length === 0) return;

    const coordinator = getTabCoordinator();
    if (!coordinator) return;

    const unsub = coordinator.onPullRequested(() => {
      void deltaPull();
    });

    return unsub;
  }, [enableCloudSync, userId, rows.length, deltaPull]);

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
  };
}
