'use client';

import { isMinifigParentRow } from '@/app/components/set/inventory-utils';
import type { InventoryRow } from '@/app/components/set/types';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  enqueueOwnedChangeIfPossible,
  parseInventoryKey,
} from '@/app/lib/ownedSync';
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
  const [isMigrating, setIsMigrating] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Client ID for sync queue operations (stable per browser session)
  const clientIdRef = useRef<string | null>(null);

  const userId = user?.id ?? null;

  const migrationDecisionKey = useMemo(() => {
    if (!userId) return null;
    return `brick_party_owned_migration_${userId}_${setNumber}`;
  }, [userId, setNumber]);

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

  // Initial hydration + migration prompt detection.
  useEffect(() => {
    if (!enableCloudSync || !userId || !migrationDecisionKey) return;
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
      const supabaseByKey = new Map<string, number>();
      let offset = 0;
      let error: { message: string } | null = null;

      while (true) {
        const { data, error: pageError } = await supabase
          .from('user_set_parts')
          .select('part_num, color_id, is_spare, owned_quantity')
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
          supabaseByKey.set(key, row.owned_quantity ?? 0);
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

      // Filter out cloud entries whose keys don't match any current inventory
      // key. Orphaned RB-keyed rows (from before the BrickLink migration)
      // would otherwise inflate supabaseTotal and trigger false migration
      // prompts.
      const inventoryKeySet = new Set(keys);
      for (const k of supabaseByKey.keys()) {
        if (!inventoryKeySet.has(k)) {
          supabaseByKey.delete(k);
        }
      }

      const localByKey = new Map<string, number>();
      for (const key of keys) {
        const owned = getOwned(setNumber, key);
        if (owned > 0) {
          localByKey.set(key, owned);
        }
      }

      const supabaseTotal = Array.from(supabaseByKey.values()).reduce(
        (sum, n) => sum + n,
        0
      );
      const localTotal = Array.from(localByKey.values()).reduce(
        (sum, n) => sum + n,
        0
      );

      const supabaseHash = Array.from(supabaseByKey.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
      const localHash = Array.from(localByKey.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('|');

      // Determine whether data is materially different.
      const differInTotals = supabaseTotal !== localTotal;
      let differInKeys = false;
      if (!differInTotals) {
        if (supabaseByKey.size !== localByKey.size) {
          differInKeys = true;
        } else {
          for (const [k, v] of supabaseByKey.entries()) {
            if ((localByKey.get(k) ?? 0) !== v) {
              differInKeys = true;
              break;
            }
          }
        }
      }

      const mapsDiffer =
        differInTotals || differInKeys || supabaseHash !== localHash;

      let existingDecision: string | null = null;
      try {
        existingDecision = window.localStorage.getItem(
          migrationDecisionKey as string
        );
      } catch {
        existingDecision = null;
      }

      if (!mapsDiffer) {
        // In sync; nothing to prompt about. Ensure future sessions skip the prompt.
        if (!existingDecision) {
          try {
            window.localStorage.setItem(
              migrationDecisionKey as string,
              'synced'
            );
          } catch {
            // ignore
          }
        }
        setHydrated(true);
        return;
      }

      if (existingDecision === 'local_to_supabase') {
        // User previously chose to push local data; regular debounced writes will
        // converge things, so we don't re-prompt.
        setHydrated(true);
        return;
      }

      if (existingDecision === 'supabase_kept') {
        // Merge cloud data into local store — only overwrite keys that
        // cloud actually has.  Leaves local marks for keys not in cloud
        // (e.g. BrickLink minifig subparts) untouched.
        for (const [key, qty] of supabaseByKey) {
          setOwned(setNumber, key, qty);
        }
        setHydrated(true);
        return;
      }

      // No prior decision and data differs: show prompt with simple totals.
      setMigration({
        open: true,
        localTotal,
        supabaseTotal,
      });
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
    migrationDecisionKey,
    rows.length,
    keys,
    getOwned,
    setOwned,
    setNumber,
    hydrated,
    isOwnedHydrated,
  ]);

  const confirmMigration = useCallback(async () => {
    if (!enableCloudSync || !userId || !migrationDecisionKey) return;
    setIsMigrating(true);
    try {
      // Enqueue all local owned data to sync queue
      // The sync worker will batch and send these to Supabase
      for (const key of keys) {
        const parsed = parseInventoryKey(key);
        if (!parsed) continue;
        const owned = getOwned(setNumber, key);
        const qty = Math.max(0, Math.floor(owned || 0));
        if (qty > 0) {
          enqueueChange(key, qty);
        }
      }

      try {
        window.localStorage.setItem(
          migrationDecisionKey as string,
          'local_to_supabase'
        );
      } catch {
        // ignore
      }

      setMigration(null);
    } catch (err) {
      console.error('Owned migration (local → Supabase) failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsMigrating(false);
    }
  }, [
    enableCloudSync,
    keys,
    migrationDecisionKey,
    getOwned,
    setNumber,
    userId,
    enqueueChange,
  ]);

  const keepCloudData = useCallback(async () => {
    if (!enableCloudSync || !userId || !migrationDecisionKey) {
      setMigration(null);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('user_set_parts')
        .select('part_num, color_id, is_spare, owned_quantity')
        .eq('user_id', userId as string)
        .eq('set_num', setNumber);

      if (error) {
        throw error;
      }

      const supabaseByKey = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.is_spare) continue;
        const key = `${row.part_num}:${row.color_id}`;
        supabaseByKey.set(key, row.owned_quantity ?? 0);
      }

      // Merge cloud data — only overwrite keys cloud has, leave others.
      for (const [key, qty] of supabaseByKey) {
        setOwned(setNumber, key, qty);
      }

      try {
        window.localStorage.setItem(
          migrationDecisionKey as string,
          'supabase_kept'
        );
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Owned migration keepCloudData failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMigration(null);
    }
  }, [enableCloudSync, migrationDecisionKey, setOwned, setNumber, userId]);

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
