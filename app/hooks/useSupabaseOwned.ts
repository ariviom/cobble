'use client';

import type { InventoryRow } from '@/app/components/set/types';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import {
  enqueueOwnedChange,
  isIndexedDBAvailable,
} from '@/app/lib/localDb';
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

type MigrationState = {
  open: boolean;
  localTotal: number;
  supabaseTotal: number;
};

type UseSupabaseOwnedResult = {
  handleOwnedChange: (key: string, nextOwned: number) => void;
  migration: MigrationState | null;
  isMigrating: boolean;
  confirmMigration: () => Promise<void>;
  keepCloudData: () => Promise<void>;
};

type ParsedKey = {
  partNum: string;
  colorId: number;
  isSpare: boolean;
};

function parseInventoryKey(key: string): ParsedKey | null {
  // We only persist rows that correspond to real set parts in rb_set_parts.
  // Minifig parent/child rows use fig:… or include parent=… in the key;
  // those are skipped for persistence to user_set_parts.
  if (key.startsWith('fig:') || key.includes(':parent=')) return null;

  const [partNum, colorIdRaw] = key.split(':');
  if (!partNum || !colorIdRaw) return null;
  const colorId = Number(colorIdRaw);
  if (!Number.isFinite(colorId)) return null;
  return { partNum, colorId, isSpare: false };
}

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
  const markAllAsOwned = useOwnedStore((state: OwnedState) => state.markAllAsOwned);

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
      if (!enableCloudSync || !userId) return;
      if (!isIndexedDBAvailable()) return;

      const parsed = parseInventoryKey(key);
      if (!parsed) return;

      const clientId = clientIdRef.current ?? 'unknown';

      // Fire-and-forget: enqueue to IndexedDB sync queue
      enqueueOwnedChange(
        clientId,
        setNumber,
        parsed.partNum,
        parsed.colorId,
        parsed.isSpare,
        quantity
      ).catch(error => {
        console.warn('Failed to enqueue owned change:', error);
      });
    },
    [enableCloudSync, setNumber, userId]
  );

  const handleOwnedChange = useCallback(
    (key: string, nextOwned: number) => {
      // Update local store immediately (IndexedDB + in-memory cache)
      setOwned(setNumber, key, nextOwned);

      if (!enableCloudSync || !userId) {
        // Anonymous users or Search Party participants remain
        // local-only (no Supabase sync).
        return;
      }

      // Enqueue change for sync to Supabase via the sync worker
      enqueueChange(key, nextOwned);
    },
    [enableCloudSync, setOwned, setNumber, userId, enqueueChange]
  );

  // Initial hydration + migration prompt detection.
  useEffect(() => {
    if (!enableCloudSync || !userId || !migrationDecisionKey) return;
    if (rows.length === 0 || keys.length === 0) return;
    if (hydrated) return;

    let cancelled = false;

    async function run() {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('user_set_parts')
        .select('part_num, color_id, is_spare, owned_quantity')
        .eq('user_id', userId as string)
        .eq('set_num', setNumber);

      if (cancelled) return;

      if (error) {
        console.error('Failed to load user_set_parts for hydration', {
          setNumber,
          error: error.message,
        });
        return;
      }

      const supabaseByKey = new Map<string, number>();
      for (const row of data ?? []) {
        if (row.is_spare) continue;
        const key = `${row.part_num}:${row.color_id}`;
        supabaseByKey.set(key, row.owned_quantity ?? 0);
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

      const mapsDiffer = differInTotals || differInKeys;

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
        // Apply cloud data to local store silently so views stay in sync.
        const allKeys = keys;
        const quantities: number[] = [];
        for (const key of allKeys) {
          const qtyFromCloud = supabaseByKey.get(key) ?? 0;
          quantities.push(qtyFromCloud);
        }
        clearAll(setNumber);
        markAllAsOwned(setNumber, allKeys, quantities);
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
    };
  }, [
    enableCloudSync,
    userId,
    migrationDecisionKey,
    rows.length,
    keys,
    getOwned,
    clearAll,
    markAllAsOwned,
    setNumber,
    hydrated,
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
  }, [enableCloudSync, keys, migrationDecisionKey, getOwned, setNumber, userId, enqueueChange]);

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

      const allKeys = keys;
      const quantities: number[] = [];
      for (const key of allKeys) {
        const qtyFromCloud = supabaseByKey.get(key) ?? 0;
        quantities.push(qtyFromCloud);
      }

      clearAll(setNumber);
      markAllAsOwned(setNumber, allKeys, quantities);

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
  }, [
    enableCloudSync,
    keys,
    migrationDecisionKey,
    clearAll,
    markAllAsOwned,
    setNumber,
    userId,
  ]);

  return {
    handleOwnedChange,
    migration,
    isMigrating,
    confirmMigration,
    keepCloudData,
  };
}


