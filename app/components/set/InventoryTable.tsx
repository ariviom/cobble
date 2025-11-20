'use client';

import { useInventory } from '@/app/hooks/useInventory';
import { useOwnedStore } from '@/app/store/owned';
import { usePinnedStore } from '@/app/store/pinned';
import { useEffect, useMemo, useState } from 'react';
import {
  clampOwned,
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from './inventory-utils';
import { InventoryControls } from './InventoryControls';
import { InventoryItem } from './items/InventoryItem';
import type { GroupBy, InventoryFilter, ItemSize, ViewType } from './types';

type SortKey = 'name' | 'color' | 'size' | 'category';

export function InventoryTable({
  setNumber,
  setName,
}: {
  setNumber: string;
  setName?: string;
}) {
  const { rows, isLoading, error, keys } = useInventory(setNumber);

  // UI state
  const [sortKey, setSortKey] = useState<SortKey>('color');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState<InventoryFilter>({
    display: 'all',
    parents: [],
    subcategoriesByParent: {},
    colors: [],
  });
  const [view, setView] = useState<ViewType>('list');
  const [itemSize, setItemSize] = useState<ItemSize>('md');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  // removed legacy top dropdown state

  const ownedStore = useOwnedStore();
  const pinnedStore = usePinnedStore();
  // Subscribe to version changes to trigger re-renders when owned quantities change
  useOwnedStore(state => state._version);

  useEffect(() => {
    // warm localStorage read
    for (const k of keys) {
      ownedStore.getOwned(setNumber, k);
    }
  }, [setNumber, keys, ownedStore]);

  // Do not early-return to preserve hooks order

  const sizeByIndex = useMemo(
    () => rows.map(r => parseStudAreaFromName(r.partName) ?? -1),
    [rows]
  );
  const categoryByIndex = useMemo(
    () => rows.map(r => r.partCategoryName ?? deriveCategory(r.partName)),
    [rows]
  );
  const parentByIndex = useMemo(
    () => rows.map(r => r.parentCategory ?? 'Misc'),
    [rows]
  );

  const visibleIndices = useMemo(() => {
    const idxs = rows.map((_, i) => i);
    const selectedParents =
      filter.parents && filter.parents.length > 0
        ? new Set(filter.parents)
        : null;
    // subcategory restrictions handled per-parent using subcategoriesByParent
    const colorSet =
      filter.colors && filter.colors.length > 0 ? new Set(filter.colors) : null;

    return idxs.filter(i => {
      const ownedValue = ownedStore.getOwned(setNumber, keys[i]!);
      if (filter.display === 'missing') {
        if (computeMissing(rows[i]!.quantityRequired, ownedValue) === 0)
          return false;
      } else if (filter.display === 'owned') {
        if (ownedValue === 0) return false;
      }

      if (selectedParents) {
        const parent = parentByIndex[i];
        if (!selectedParents.has(parent)) return false;
        const explicitSubs = filter.subcategoriesByParent?.[parent];
        if (explicitSubs && explicitSubs.length > 0) {
          const category = categoryByIndex[i] ?? 'Uncategorized';
          if (!explicitSubs.includes(category)) return false;
        }
      }

      if (colorSet) {
        const colorName = rows[i]!.colorName;
        if (!colorSet.has(colorName)) return false;
      }

      return true;
    });
  }, [
    rows,
    keys,
    categoryByIndex,
    parentByIndex,
    filter,
    ownedStore,
    setNumber,
  ]);

  const sortedIndices = useMemo(() => {
    const idxs = [...visibleIndices];

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
        case 'category': {
          const ca = categoryByIndex[a] ?? 'Uncategorized';
          const cb = categoryByIndex[b] ?? 'Uncategorized';
          base = ca.localeCompare(cb);
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

    idxs.sort(cmp);

    return idxs;
  }, [rows, sortKey, sortDir, sizeByIndex, categoryByIndex, visibleIndices]);

  const groupKeyByIndex = useMemo(() => {
    if (groupBy === 'none') return null;
    return rows.map((r, i) => {
      switch (groupBy) {
        case 'color':
          return r.colorName;
        case 'size':
          return String(sizeByIndex[i] ?? -1);
        case 'category':
          return (
            r.partCategoryName ??
            String(r.partCategoryId ?? deriveCategory(r.partName))
          );
        default:
          return '';
      }
    });
  }, [rows, sizeByIndex, groupBy]);

  const gridSizes = useMemo(() => {
    switch (itemSize) {
      case 'sm':
        return 'grid-cols-2 xs:grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';
      case 'md':
        return 'grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6';
      case 'lg':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6';
    }
  }, [itemSize]);

  // Persist UI state in localStorage (global, not per-set)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('ui:inventoryControls');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        sortKey: typeof sortKey;
        sortDir: typeof sortDir;
        groupBy: typeof groupBy;
        view: typeof view;
        itemSize: typeof itemSize;
        display: InventoryFilter['display'];
      }>;
      if (parsed.sortKey) setSortKey(parsed.sortKey);
      if (parsed.sortDir) setSortDir(parsed.sortDir);
      if (parsed.groupBy) setGroupBy(parsed.groupBy);
      if (parsed.view) setView(parsed.view);
      if (parsed.itemSize) setItemSize(parsed.itemSize);
      if (parsed.display)
        setFilter(prev => ({
          ...prev,
          display: parsed.display!,
        }));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const payload = {
        sortKey,
        sortDir,
        groupBy,
        view,
        itemSize,
        display: filter.display,
      };
      localStorage.setItem('ui:inventoryControls', JSON.stringify(payload));
    } catch {}
  }, [sortKey, sortDir, groupBy, view, itemSize, filter]);

  const subcategoriesByParent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rows.forEach((row, idx) => {
      const parent = parentByIndex[idx] ?? 'Misc';
      const sub = categoryByIndex[idx] ?? 'Uncategorized';
      if (!map.has(parent)) map.set(parent, new Set());
      map.get(parent)!.add(sub);
    });
    const obj: Record<string, string[]> = {};
    for (const [parent, subs] of map.entries()) {
      obj[parent] = Array.from(subs).sort();
    }
    return obj;
  }, [rows, parentByIndex, categoryByIndex]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(row => set.add(row.colorName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const countsByParent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const key = keys[i]!;
      // display filter
      const ownedValue = ownedStore.getOwned(setNumber, key);
      if (filter.display === 'missing') {
        if (computeMissing(r.quantityRequired, ownedValue) === 0) continue;
      } else if (filter.display === 'owned') {
        if (ownedValue === 0) continue;
      }
      // color filter
      if (filter.colors && filter.colors.length > 0) {
        if (!filter.colors.includes(r.colorName)) continue;
      }
      const parent = parentByIndex[i] ?? 'Misc';
      counts[parent] = (counts[parent] ?? 0) + 1;
    }
    return counts;
  }, [rows, keys, filter, parentByIndex, ownedStore, setNumber]);

  return (
    <div className="relative inset-0 pb-2 lg:pl-80">
      <InventoryControls
        setNumber={setNumber}
        setName={setName}
        view={view}
        onChangeView={v => setView(v)}
        itemSize={itemSize}
        onChangeItemSize={s => setItemSize(s)}
        sortKey={sortKey}
        onChangeSortKey={k => setSortKey(k)}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
        groupBy={groupBy}
        onChangeGroupBy={g => setGroupBy(g)}
        filter={filter}
        onChangeFilter={f => setFilter(f)}
        parentOptions={useMemo(
          () => Array.from(new Set(parentByIndex)).filter(Boolean).sort(),
          [parentByIndex]
        )}
        parentCounts={countsByParent}
        subcategoriesByParent={subcategoriesByParent}
        colorOptions={colorOptions}
        onToggleColor={color => {
          setFilter(prev => {
            const exists = (prev.colors || []).includes(color);
            return {
              ...prev,
              colors: exists
                ? (prev.colors || []).filter(c => c !== color)
                : [...(prev.colors || []), color],
            };
          });
        }}
      />

      <div className="bg-neutral-50 pt-inventory-offset transition-[padding] will-change-transform">
        <div className="flex flex-col p-2">
          {error ? (
            <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {/* Placeholder error message - will be styled later */}
              Failed to load inventory. Please try again.
            </div>
          ) : rows.length === 0 || isLoading ? (
            <div className="p-4 text-sm text-foreground-muted">
              {isLoading ? 'Loading…' : 'No inventory found.'}
            </div>
          ) : groupBy === 'none' ? (
            <div
              data-view={view}
              data-item-size={itemSize}
              className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
            >
              {sortedIndices.map(originalIndex => {
                const r = rows[originalIndex]!;
                const key = keys[originalIndex]!;
                const owned = ownedStore.getOwned(setNumber, key);
                const missing = computeMissing(r.quantityRequired, owned);
                return (
                  <InventoryItem
                    key={key}
                    row={r}
                    owned={owned}
                    missing={missing}
                    onOwnedChange={next => {
                      const clamped = clampOwned(next, r.quantityRequired);
                      ownedStore.setOwned(setNumber, key, clamped);
                      if (
                        pinnedStore.autoUnpin &&
                        pinnedStore.isPinned(setNumber, key) &&
                        computeMissing(r.quantityRequired, clamped) === 0
                      ) {
                        pinnedStore.setPinned(setNumber, key, false);
                      }
                    }}
                    isPinned={pinnedStore.isPinned(setNumber, key)}
                    onTogglePinned={() =>
                      pinnedStore.togglePinned({
                        setNumber,
                        key,
                        setName,
                      })
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {(() => {
                const grouped = new Map<string, number[]>();
                for (const idx of sortedIndices) {
                  const k = groupKeyByIndex?.[idx] ?? '';
                  if (!grouped.has(k)) grouped.set(k, []);
                  grouped.get(k)!.push(idx);
                }
                const sections: Array<{ key: string; indices: number[] }> = [];
                for (const [k, v] of grouped.entries())
                  sections.push({ key: k, indices: v });
                sections.sort((a, b) => a.key.localeCompare(b.key));
                return sections.map(sec => (
                  <div key={sec.key} className="flex flex-col gap-2">
                    <div className="sticky top-sticky-label z-10 bg-background/90 px-1 py-2 text-sm font-semibold text-foreground">
                      {sec.key === 'Minifig' ? 'Minifigures' : sec.key}
                    </div>
                    <div
                      data-view={view}
                      data-item-size={itemSize}
                      className={`gap-2 ${view === 'grid' ? `grid ${gridSizes}` : 'flex flex-wrap'}`}
                    >
                      {sec.indices.map(originalIndex => {
                        const r = rows[originalIndex]!;
                        const key = keys[originalIndex]!;
                        const owned = ownedStore.getOwned(setNumber, key);
                        const missing = computeMissing(
                          r.quantityRequired,
                          owned
                        );
                        return (
                          <InventoryItem
                            key={key}
                            row={r}
                            owned={owned}
                            missing={missing}
                            onOwnedChange={next => {
                              const clamped = clampOwned(
                                next,
                                r.quantityRequired
                              );
                              ownedStore.setOwned(setNumber, key, clamped);
                              if (
                                pinnedStore.autoUnpin &&
                                pinnedStore.isPinned(setNumber, key) &&
                                computeMissing(r.quantityRequired, clamped) ===
                                  0
                              ) {
                                pinnedStore.setPinned(setNumber, key, false);
                              }
                            }}
                            isPinned={pinnedStore.isPinned(setNumber, key)}
                            onTogglePinned={() =>
                              pinnedStore.togglePinned({
                                setNumber,
                                key,
                                setName,
                              })
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
