'use client';

import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import { useOwnedStore } from '@/app/store/owned';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ExportModal } from './ExportModal';
import {
  clampOwned,
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from './inventory-utils';
import { InventoryControls } from './InventoryControls';
import { InventoryItem } from './items/InventoryItem';
import type { InventoryRow, ItemSize, ViewType } from './types';

type Row = InventoryRow;

type SortKey = 'name' | 'color' | 'required' | 'owned' | 'missing' | 'size';

async function fetchInventory(setNumber: string): Promise<Row[]> {
  const res = await fetch(
    `/api/inventory?set=${encodeURIComponent(setNumber)}`
  );
  if (!res.ok) throw new Error('inventory_failed');
  const data = (await res.json()) as { rows: Row[] };
  return data.rows;
}

export function InventoryTable({
  setNumber,
  setName,
}: {
  setNumber: string;
  setName?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', setNumber],
    queryFn: () => fetchInventory(setNumber),
  });
  const rows = useMemo(() => data ?? [], [data]);
  const keys = useMemo(() => rows.map(r => `${r.partId}:${r.colorId}`), [rows]);
  const required = useMemo(() => rows.map(r => r.quantityRequired), [rows]);

  // UI state
  const [sortKey, setSortKey] = useState<SortKey>('color');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [groupByCategory, setGroupByCategory] = useState<boolean>(false);
  const [view, setView] = useState<ViewType>('list');
  const [itemSize, setItemSize] = useState<ItemSize>('md');
  const [exportOpen, setExportOpen] = useState<boolean>(false);

  const ownedStore = useOwnedStore();

  useEffect(() => {
    // warm localStorage read
    keys.forEach(k => ownedStore.getOwned(setNumber, k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNumber, keys.join(',')]);

  // Do not early-return to preserve hooks order

  const totalMissing = useMemo(() => {
    return rows.reduce((acc, r, idx) => {
      const k = keys[idx];
      const own = ownedStore.getOwned(setNumber, k);
      return acc + computeMissing(r.quantityRequired, own);
    }, 0);
  }, [rows, keys, setNumber, ownedStore]);

  const sizeByIndex = useMemo(
    () => rows.map(r => parseStudAreaFromName(r.partName) ?? -1),
    [rows]
  );
  const categoryByIndex = useMemo(
    () => rows.map(r => deriveCategory(r.partName)),
    [rows]
  );

  const sortedIndices = useMemo(() => {
    const idxs = rows.map((_, i) => i);

    function cmp(a: number, b: number): number {
      const ra = rows[a]!;
      const rb = rows[b]!;

      let base = 0;
      switch (sortKey) {
        case 'name':
          base = ra.partName.localeCompare(rb.partName);
          break;
        case 'color':
          base = ra.colorName.localeCompare(rb.colorName);
          break;
        case 'required':
          base = ra.quantityRequired - rb.quantityRequired;
          break;
        case 'owned': {
          const ownedA = ownedStore.getOwned(setNumber, keys[a]!);
          const ownedB = ownedStore.getOwned(setNumber, keys[b]!);
          base = ownedA - ownedB;
          break;
        }
        case 'missing': {
          const ownedA = ownedStore.getOwned(setNumber, keys[a]!);
          const ownedB = ownedStore.getOwned(setNumber, keys[b]!);
          const missA = Math.max(0, ra.quantityRequired - ownedA);
          const missB = Math.max(0, rb.quantityRequired - ownedB);
          base = missA - missB;
          break;
        }
        case 'size': {
          const sa = sizeByIndex[a]!;
          const sb = sizeByIndex[b]!;
          base = sa - sb;
          break;
        }
      }

      // Secondary sort by name if equal
      if (base === 0) {
        base = ra.partName.localeCompare(rb.partName);
      }

      return sortDir === 'asc' ? base : -base;
    }

    if (groupByCategory) {
      idxs.sort((a, b) => {
        const ca = categoryByIndex[a]!;
        const cb = categoryByIndex[b]!;
        if (ca !== cb) return ca.localeCompare(cb);
        return cmp(a, b);
      });
    } else {
      idxs.sort(cmp);
    }

    return idxs;
  }, [
    rows,
    keys,
    sortKey,
    sortDir,
    groupByCategory,
    sizeByIndex,
    categoryByIndex,
    setNumber,
    ownedStore,
  ]);

  const gridSizes = useMemo(() => {
    switch (itemSize) {
      case 'sm':
        return 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9';
      case 'md':
        return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8';
      case 'lg':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
    }
  }, [itemSize]);

  function computeMissingRows(): MissingRow[] {
    const result: MissingRow[] = [];
    for (let ix = 0; ix < sortedIndices.length; ix++) {
      const i = sortedIndices[ix]!;
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
  }

  return (
    <>
      <div>
        <InventoryControls
          view={view}
          onChangeView={v => setView(v)}
          itemSize={itemSize}
          onChangeItemSize={s => setItemSize(s)}
          sortKey={sortKey}
          onChangeSortKey={k => setSortKey(k)}
          sortDir={sortDir}
          onToggleSortDir={() =>
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
          }
          groupByCategory={groupByCategory}
          onChangeGroupByCategory={v => setGroupByCategory(v)}
          onMarkAllOwned={() =>
            ownedStore.markAllAsOwned(setNumber, keys, required)
          }
          onClearAllOwned={() => ownedStore.clearAll(setNumber)}
          totalMissing={totalMissing}
          onOpenExport={() => setExportOpen(true)}
        />
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex-1 overflow-auto">
            {rows.length === 0 || isLoading ? (
              <div className="p-4 text-sm text-gray-600">
                {isLoading ? 'Loading…' : 'No inventory found.'}
              </div>
            ) : (
              <div
                data-view={view}
                data-item-size={itemSize}
                className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
              >
                {sortedIndices.map((originalIndex, idx) => {
                  const r = rows[originalIndex]!;
                  const key = keys[originalIndex]!;
                  const owned = ownedStore.getOwned(setNumber, key);
                  const missing = computeMissing(r.quantityRequired, owned);
                  const category = categoryByIndex[originalIndex]!;
                  const showGroupHeader =
                    groupByCategory &&
                    (idx === 0 ||
                      categoryByIndex[sortedIndices[idx - 1]!] !== category);

                  return (
                    <InventoryItem
                      key={key}
                      row={r}
                      owned={owned}
                      missing={missing}
                      showGroupHeader={showGroupHeader}
                      category={category}
                      onOwnedChange={next => {
                        ownedStore.setOwned(
                          setNumber,
                          key,
                          clampOwned(next, r.quantityRequired)
                        );
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        setNumber={setNumber}
        setName={setName}
        getMissingRows={computeMissingRows}
      />
    </>
  );
}
