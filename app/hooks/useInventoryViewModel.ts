'use client';

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import type {
  GroupBy,
  InventoryFilter,
  InventoryRow,
  ItemSize,
  SortKey,
  ViewType,
} from '@/app/components/set/types';
import {
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from '@/app/components/set/inventory-utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useInventoryControls } from '@/app/hooks/useInventoryControls';

export type InventoryViewModel = {
  // Raw data
  rows: InventoryRow[];
  keys: string[];
  ownedByKey: Record<string, number>;
  isLoading: boolean;
  error: Error | null;

  // Hydration state
  /** Whether owned data has been hydrated from IndexedDB */
  isOwnedHydrated: boolean;
  /** Whether IndexedDB is available (false = in-memory only, data will be lost) */
  isStorageAvailable: boolean;

  // UI controls
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  filter: InventoryFilter;
  view: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
  setSortKey: Dispatch<SetStateAction<SortKey>>;
  setSortDir: Dispatch<SetStateAction<'asc' | 'desc'>>;
  setFilter: Dispatch<SetStateAction<InventoryFilter>>;
  setView: Dispatch<SetStateAction<ViewType>>;
  setItemSize: Dispatch<SetStateAction<ItemSize>>;
  setGroupBy: Dispatch<SetStateAction<GroupBy>>;

  // Derived indices and metadata
  sizeByIndex: number[];
  categoryByIndex: Array<string | null>;
  parentByIndex: string[];
  visibleIndices: number[];
  sortedIndices: number[];
  groupKeyByIndex: string[] | null;
  gridSizes: string;
  subcategoriesByParent: Record<string, string[]>;
  colorOptions: string[];
  countsByParent: Record<string, number>;
  parentOptions: string[];
};

export function useInventoryViewModel(setNumber: string): InventoryViewModel {
  const {
    rows,
    isLoading,
    error,
    keys,
    ownedByKey,
    isOwnedHydrated,
    isStorageAvailable,
  } = useInventory(setNumber);

  const {
    sortKey,
    sortDir,
    filter,
    view,
    itemSize,
    groupBy,
    setSortKey,
    setSortDir,
    setFilter,
    setView,
    setItemSize,
    setGroupBy,
  } = useInventoryControls();

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
    const colorSet =
      filter.colors && filter.colors.length > 0 ? new Set(filter.colors) : null;

    return idxs.filter(i => {
      const ownedValue = ownedByKey[keys[i]!] ?? 0;
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
  }, [rows, keys, categoryByIndex, parentByIndex, filter, ownedByKey]);

  const sortedIndices = useMemo(() => {
    const idxs = [...visibleIndices];

    function cmp(a: number, b: number): number {
      const ra = rows[a]!;
      const rb = rows[b]!;

      if (sortKey === 'price') {
        // Price sort is handled at the call-site where prices are known.
        // Here we keep the base order stable.
        return 0;
      }

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
  }, [itemSize])!;

  const subcategoriesByParent = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rows.forEach((_, idx) => {
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
      const ownedValue = ownedByKey[key] ?? 0;

      if (filter.display === 'missing') {
        if (computeMissing(r.quantityRequired, ownedValue) === 0) continue;
      } else if (filter.display === 'owned') {
        if (ownedValue === 0) continue;
      }

      if (filter.colors && filter.colors.length > 0) {
        if (!filter.colors.includes(r.colorName)) continue;
      }

      const parent = parentByIndex[i] ?? 'Misc';
      counts[parent] = (counts[parent] ?? 0) + 1;
    }
    return counts;
  }, [rows, keys, filter, parentByIndex, ownedByKey]);

  const parentOptions = useMemo(
    () => Array.from(new Set(parentByIndex)).filter(Boolean).sort(),
    [parentByIndex]
  );

  return {
    rows,
    keys,
    ownedByKey,
    isLoading,
    error,
    isOwnedHydrated,
    isStorageAvailable,
    sortKey,
    sortDir,
    filter,
    view,
    itemSize,
    groupBy,
    setSortKey,
    setSortDir,
    setFilter,
    setView,
    setItemSize,
    setGroupBy,
    sizeByIndex,
    categoryByIndex,
    parentByIndex,
    visibleIndices,
    sortedIndices,
    groupKeyByIndex,
    gridSizes,
    subcategoriesByParent,
    colorOptions,
    countsByParent,
    parentOptions,
  };
}


