'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryRow } from '@/app/components/set/types';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useOwnedStore } from '@/app/store/owned';

type UseSupabaseOwnedArgs = {
  setNumber: string;
  rows: InventoryRow[];
  keys: string[];
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
}: UseSupabaseOwnedArgs): UseSupabaseOwnedResult {
  const { user } = useSupabaseUser();

  const [migration, setMigration] = useState<MigrationState | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const pendingRef = useRef<Map<string, number>>(new Map());
  const flushTimeoutRef = useRef<number | null>(null);

  const userId = user?.id ?? null;

  const migrationDecisionKey = useMemo(() => {
    if (!userId) return null;
    return `quarry_owned_migration_${userId}_${setNumber}`;
  }, [userId, setNumber]);

  const getOwned = useOwnedStore(state => state.getOwned);
  const setOwned = useOwnedStore(state => state.setOwned);
  const clearAll = useOwnedStore(state => state.clearAll);
  const markAllAsOwned = useOwnedStore(state => state.markAllAsOwned);

  const flushNow = useCallback(async () => {
    if (!userId) {
      pendingRef.current.clear();
      return;
    }
    const supabase = getSupabaseBrowserClient();

    type UpsertRow = {
      user_id: string;
      set_num: string;
      part_num: string;
      color_id: number;
      is_spare: boolean;
      owned_quantity: number;
    };

    // Aggregate by the actual primary-key tuple to avoid sending duplicate rows
    // for the same (user_id,set_num,part_num,color_id,is_spare), which would
    // cause ON CONFLICT errors.
    const byPk = new Map<string, UpsertRow>();

    for (const [key, owned] of pendingRef.current.entries()) {
      const parsed = parseInventoryKey(key);
      if (!parsed) continue;
      const qty = Math.max(0, Math.floor(owned || 0));
      const pk = `${parsed.partNum}:${parsed.colorId}:${parsed.isSpare ? 1 : 0}`;

      const existing = byPk.get(pk);
      if (!existing || qty > existing.owned_quantity) {
        byPk.set(pk, {
          user_id: userId,
          set_num: setNumber,
          part_num: parsed.partNum,
          color_id: parsed.colorId,
          is_spare: parsed.isSpare,
          owned_quantity: qty,
        });
      }
    }

    pendingRef.current.clear();
    const toUpsert = Array.from(byPk.values());
    if (toUpsert.length === 0) return;

    const { error } = await supabase
      .from('user_set_parts')
      .upsert(toUpsert, {
        onConflict: 'user_id,set_num,part_num,color_id,is_spare',
      });

    if (error) {
      // We log but do not surface an inline error yet; the UI still reflects local state.
      // Future iterations can add a non-intrusive toast if needed.
      // eslint-disable-next-line no-console
      console.error(
        'Supabase owned upsert failed',
        JSON.stringify(
          {
            setNumber,
            count: toUpsert.length,
            error,
          },
          null,
          2
        )
      );
    }
  }, [setNumber, userId]);

  const scheduleFlush = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (flushTimeoutRef.current != null) {
      window.clearTimeout(flushTimeoutRef.current);
    }
    flushTimeoutRef.current = window.setTimeout(() => {
      flushTimeoutRef.current = null;
      void flushNow();
    }, 500);
  }, [flushNow]);

  // Clean up pending flush on unmount.
  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (flushTimeoutRef.current != null) {
        window.clearTimeout(flushTimeoutRef.current);
        flushTimeoutRef.current = null;
      }
      if (pendingRef.current.size > 0) {
        void flushNow();
      }
    };
  }, [flushNow]);

  const handleOwnedChange = useCallback(
    (key: string, nextOwned: number) => {
      setOwned(setNumber, key, nextOwned);

      if (!userId) {
        // Anonymous users remain localStorage-only.
        return;
      }

      const parsed = parseInventoryKey(key);
      if (!parsed) return;

      pendingRef.current.set(key, nextOwned);
      scheduleFlush();
    },
    [setOwned, setNumber, userId, scheduleFlush]
  );

  // Initial hydration + migration prompt detection.
  useEffect(() => {
    if (!userId || !migrationDecisionKey) return;
    if (rows.length === 0 || keys.length === 0) return;
    if (hydrated) return;

    let cancelled = false;

    async function run() {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('user_set_parts')
        .select('part_num, color_id, is_spare, owned_quantity')
        .eq('user_id', userId)
        .eq('set_num', setNumber);

      if (cancelled) return;

      if (error) {
        // eslint-disable-next-line no-console
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
        existingDecision = window.localStorage.getItem(migrationDecisionKey);
      } catch {
        existingDecision = null;
      }

      if (!mapsDiffer) {
        // In sync; nothing to prompt about. Ensure future sessions skip the prompt.
        if (!existingDecision) {
          try {
            window.localStorage.setItem(migrationDecisionKey, 'synced');
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
    if (!userId || !migrationDecisionKey) return;
    setIsMigrating(true);
    try {
      const supabase = getSupabaseBrowserClient();
      type UpsertRow = {
        user_id: string;
        set_num: string;
        part_num: string;
        color_id: number;
        is_spare: boolean;
        owned_quantity: number;
      };

      const byPk = new Map<string, UpsertRow>();

      for (const key of keys) {
        const parsed = parseInventoryKey(key);
        if (!parsed) continue;
        const owned = getOwned(setNumber, key);
        const qty = Math.max(0, Math.floor(owned || 0));
        const pk = `${parsed.partNum}:${parsed.colorId}:${parsed.isSpare ? 1 : 0}`;

        const existing = byPk.get(pk);
        if (!existing || qty > existing.owned_quantity) {
          byPk.set(pk, {
            user_id: userId,
            set_num: setNumber,
            part_num: parsed.partNum,
            color_id: parsed.colorId,
            is_spare: parsed.isSpare,
            owned_quantity: qty,
          });
        }
      }

      const upserts = Array.from(byPk.values());

      if (upserts.length > 0) {
        const { error } = await supabase
          .from('user_set_parts')
          .upsert(upserts, {
            onConflict: 'user_id,set_num,part_num,color_id,is_spare',
          });
        if (error) {
          throw error;
        }
      }

      try {
        window.localStorage.setItem(migrationDecisionKey, 'local_to_supabase');
      } catch {
        // ignore
      }

      setMigration(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Owned migration (local → Supabase) failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsMigrating(false);
    }
  }, [keys, migrationDecisionKey, getOwned, setNumber, userId]);

  const keepCloudData = useCallback(async () => {
    if (!userId || !migrationDecisionKey) {
      setMigration(null);
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('user_set_parts')
        .select('part_num, color_id, is_spare, owned_quantity')
        .eq('user_id', userId)
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
        window.localStorage.setItem(migrationDecisionKey, 'supabase_kept');
      } catch {
        // ignore
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Owned migration keepCloudData failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setMigration(null);
    }
  }, [keys, migrationDecisionKey, clearAll, markAllAsOwned, setNumber, userId]);

  return {
    handleOwnedChange,
    migration,
    isMigrating,
    confirmMigration,
    keepCloudData,
  };
}


