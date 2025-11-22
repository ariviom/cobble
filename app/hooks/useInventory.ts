'use client';

import type { InventoryRow } from '@/app/components/set/types';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { useOwnedStore } from '@/app/store/owned';
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
  computeMissingRows: () => MissingRow[];
};

async function fetchInventory(setNumber: string): Promise<InventoryRow[]> {
  const res = await fetch(
    `/api/inventory?set=${encodeURIComponent(setNumber)}`
  );
  if (!res.ok) throw new Error('inventory_failed');
  const data = (await res.json()) as { rows: InventoryRow[] };
  return data.rows;
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

  const ownedStore = useOwnedStore();

  const totalMissing = useMemo(() => {
    return rows.reduce((acc, r, idx) => {
      const k = keys[idx]!;
      const own = ownedStore.getOwned(setNumber, k);
      const missing = Math.max(0, r.quantityRequired - own);
      return acc + missing;
    }, 0);
  }, [rows, keys, setNumber, ownedStore]);

  const ownedTotal = useMemo(
    () => totalRequired - totalMissing,
    [totalRequired, totalMissing]
  );

  const computeMissingRows = () => {
    const result: MissingRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const k = keys[i]!;
      const own = ownedStore.getOwned(setNumber, k);
      const missing = Math.max(0, r.quantityRequired - own);
      if (missing > 0) {
        result.push({
          setNumber,
          partId: r.partId,
          colorId: r.colorId,
          quantityMissing: missing,
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
    computeMissingRows,
  };
}
