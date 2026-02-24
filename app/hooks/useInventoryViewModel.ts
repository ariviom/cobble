'use client';

import {
  computeMissing,
  deriveCategory,
  parseStudAreaFromName,
} from '@/app/components/set/inventory-utils';
import {
  getRarityTier,
  type GroupBy,
  type InventoryFilter,
  type InventoryRow,
  type ItemSize,
  type RarityTier,
  type SortKey,
  type ViewType,
} from '@/app/components/set/types';
import { useInventory } from '@/app/hooks/useInventory';
import {
  useInventoryControls,
  type InventoryControlsState,
} from '@/app/hooks/useInventoryControls';
import type { MissingRow } from '@/app/lib/export/rebrickableCsv';
import {
  useCallback,
  useDeferredValue,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from 'react';

export type InventoryViewModel = {
  // Raw data
  rows: InventoryRow[];
  keys: string[];
  ownedByKey: Record<string, number>;
  minifigStatusByKey: Map<string, import('./useInventory').MinifigStatus>;
  isLoading: boolean;
  error: Error | null;

  // Totals (pre-computed, excludes minifig parent rows)
  totalRequired: number;
  totalMissing: number;
  ownedTotal: number;

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
  /** Get current controls state for saving (tab state persistence) */
  getControlsState: () => InventoryControlsState;

  // Derived indices and metadata
  sizeByIndex: number[];
  categoryByIndex: Array<string | null>;
  parentByIndex: string[];
  rarityByIndex: Array<RarityTier | null>;
  visibleIndices: number[];
  sortedIndices: number[];
  groupKeyByIndex: string[] | null;
  gridSizes: string;
  subcategoriesByParent: Record<string, string[]>;
  colorOptions: string[];
  /** Colors that have matching pieces after display/category filters (for disabling unavailable options) */
  availableColors: Set<string>;
  countsByParent: Record<string, number>;
  parentOptions: string[];
  computeMissingRows: () => MissingRow[];
};

const EMPTY_OWNED: Record<string, number> = {};

export type InventoryViewModelOptions = {
  initialRows?: InventoryRow[] | null;
  /** Initial controls state for tab restoration */
  initialControlsState?: Partial<InventoryControlsState> | undefined;
  /** When provided, used instead of the Zustand owned store. */
  ownedByKeyOverride?: Record<string, number> | undefined;
};

export function useInventoryViewModel(
  setNumber: string,
  options?: InventoryViewModelOptions
): InventoryViewModel {
  const {
    rows,
    isLoading,
    error,
    keys,
    ownedByKey,
    minifigStatusByKey,
    totalRequired,
    totalMissing,
    ownedTotal,
    isOwnedHydrated,
    isStorageAvailable,
    computeMissingRows,
  } = useInventory(setNumber, {
    initialRows: options?.initialRows ?? null,
    ownedByKeyOverride: options?.ownedByKeyOverride,
  });

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
  } = useInventoryControls({
    initialState: options?.initialControlsState,
    skipStorageHydration: !!options?.initialControlsState,
  });

  const getControlsState = useCallback(
    (): InventoryControlsState => ({
      sortKey,
      sortDir,
      filter,
      view,
      itemSize,
      groupBy,
    }),
    [sortKey, sortDir, filter, view, itemSize, groupBy]
  );

  // Defer ownedByKey for non-critical derivations (countsByParent, availableColors)
  const deferredOwnedByKey = useDeferredValue(ownedByKey);

  const {
    sizeByIndex,
    categoryByIndex,
    parentByIndex,
    rarityByIndex,
    subcategoriesByParent,
    colorOptions,
  } = useMemo(() => {
    const sizeByIndex: number[] = [];
    const categoryByIndex: Array<string | null> = [];
    const parentByIndex: string[] = [];
    const rarityByIndex: Array<RarityTier | null> = [];
    const colorOptionsSet = new Set<string>();
    const subcategoryMap = new Map<string, Set<string>>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      sizeByIndex.push(parseStudAreaFromName(row.partName) ?? -1);

      const category =
        row.partCategoryName ?? deriveCategory(row.partName) ?? 'Uncategorized';
      categoryByIndex.push(category);

      const parent = row.parentCategory ?? 'Misc';
      parentByIndex.push(parent);

      rarityByIndex.push(getRarityTier(row.setCount));

      colorOptionsSet.add(row.colorName);

      if (!subcategoryMap.has(parent)) {
        subcategoryMap.set(parent, new Set());
      }
      subcategoryMap.get(parent)!.add(category);
    }

    const subcategoriesByParent: Record<string, string[]> = {};
    for (const [parent, subs] of subcategoryMap.entries()) {
      subcategoriesByParent[parent] = Array.from(subs).sort();
    }

    return {
      sizeByIndex,
      categoryByIndex,
      parentByIndex,
      rarityByIndex,
      subcategoriesByParent,
      colorOptions: Array.from(colorOptionsSet).sort((a, b) =>
        a.localeCompare(b)
      ),
    };
  }, [rows]);

  // For minifig parent rows, derive owned from subpart completion status
  // (minifig parents don't have direct owned quantities in ownedByKey)
  const effectiveOwned = useCallback(
    (key: string, row: InventoryRow, owned: Record<string, number>) => {
      const status = minifigStatusByKey.get(key);
      if (status) return status.state === 'complete' ? row.quantityRequired : 0;
      return owned[key] ?? 0;
    },
    [minifigStatusByKey]
  );

  // Only depend on ownedByKey for visibility when the display filter needs it.
  // For display='all' (the default), owned values are irrelevant to filtering,
  // so we use a stable empty object to avoid re-filtering on every owned change.
  const ownedForVisibility =
    filter.display === 'missing' || filter.display === 'owned'
      ? ownedByKey
      : EMPTY_OWNED;

  const visibleIndices = useMemo(() => {
    const idxs = rows.map((_, i) => i);
    const selectedParents =
      filter.parents && filter.parents.length > 0
        ? new Set(filter.parents)
        : null;
    const colorSet =
      filter.colors && filter.colors.length > 0 ? new Set(filter.colors) : null;

    return idxs.filter(i => {
      if (filter.display === 'missing' || filter.display === 'owned') {
        const ownedValue = effectiveOwned(
          keys[i]!,
          rows[i]!,
          ownedForVisibility
        );
        if (filter.display === 'missing') {
          if (computeMissing(rows[i]!.quantityRequired, ownedValue) === 0)
            return false;
        } else if (filter.display === 'owned') {
          if (ownedValue === 0) return false;
        }
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
        if (!colorSet.has(colorName)) {
          // When "Minifigures" color is selected, also show minifig subparts
          if (!(colorSet.has('—') && rows[i]!.parentCategory === 'Minifigure'))
            return false;
        }
      }

      if (filter.rarityTiers && filter.rarityTiers.length > 0) {
        const tier = rarityByIndex[i];
        if (!tier || !filter.rarityTiers.includes(tier)) return false;
      }

      return true;
    });
  }, [
    rows,
    keys,
    categoryByIndex,
    parentByIndex,
    rarityByIndex,
    filter,
    ownedForVisibility,
    effectiveOwned,
  ]);

  const sortedIndices = useMemo(() => {
    const idxs = [...visibleIndices];

    // Rarity tiers ordered from least to most rare (ascending = common first)
    const RARITY_ORDER: Record<string, number> = {
      common: 0,
      rare: 1,
      very_rare: 2,
      exclusive: 3,
    };

    // Returns a numeric rank for group comparison so group order respects sortDir
    function getGroupRank(i: number): number | string {
      if (groupBy === 'none') return '';
      const r = rows[i]!;
      switch (groupBy) {
        case 'color':
          return r.colorName;
        case 'size':
          return sizeByIndex[i] ?? -1;
        case 'category':
          return categoryByIndex[i] ?? 'Uncategorized';
        case 'rarity':
          return RARITY_ORDER[getRarityTier(r.setCount) ?? 'common'] ?? 0;
        default:
          return '';
      }
    }

    function cmp(a: number, b: number): number {
      // When grouping, sort by group rank first so items cluster together.
      // Group order respects sortDir so desc flips the group sequence too.
      if (groupBy !== 'none') {
        const gA = getGroupRank(a);
        const gB = getGroupRank(b);
        let groupCmp: number;
        if (typeof gA === 'number' && typeof gB === 'number') {
          groupCmp = gA - gB;
        } else {
          groupCmp = String(gA).localeCompare(String(gB));
        }
        if (groupCmp !== 0) return sortDir === 'asc' ? groupCmp : -groupCmp;
      }

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
        case 'rarity': {
          const scA = ra.setCount ?? Infinity;
          const scB = rb.setCount ?? Infinity;
          base = scA - scB;
          break;
        }
        case 'quantity':
          base = ra.quantityRequired - rb.quantityRequired;
          break;
      }

      if (base === 0) {
        base = ra.partName.localeCompare(rb.partName);
      }

      return sortDir === 'asc' ? base : -base;
    }

    idxs.sort(cmp);

    return idxs;
  }, [
    rows,
    sortKey,
    sortDir,
    sizeByIndex,
    categoryByIndex,
    visibleIndices,
    groupBy,
  ]);

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
        case 'rarity':
          return getRarityTier(r.setCount) ?? 'common';
        default:
          return '';
      }
    });
  }, [rows, sizeByIndex, groupBy]);

  const gridSizeClass: Record<ItemSize, string> = {
    sm: 'grid-size-sm',
    md: 'grid-size-md',
    lg: 'grid-size-lg',
  };
  const gridSizes = gridSizeClass[itemSize];

  const countsByParent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const key = keys[i]!;
      const ownedValue = effectiveOwned(key, r, deferredOwnedByKey);

      if (filter.display === 'missing') {
        if (computeMissing(r.quantityRequired, ownedValue) === 0) continue;
      } else if (filter.display === 'owned') {
        if (ownedValue === 0) continue;
      }

      if (filter.colors && filter.colors.length > 0) {
        if (!filter.colors.includes(r.colorName)) {
          // When "Minifigures" color is selected, also show minifig subparts
          if (
            !(filter.colors.includes('—') && r.parentCategory === 'Minifigure')
          )
            continue;
        }
      }

      const parent = parentByIndex[i] ?? 'Misc';
      counts[parent] = (counts[parent] ?? 0) + 1;
    }
    return counts;
  }, [rows, keys, filter, parentByIndex, deferredOwnedByKey, effectiveOwned]);

  // Colors that have at least one matching piece after display and category filters
  // (but before color filter is applied) - used to disable color options with no matches
  const availableColors = useMemo(() => {
    const selectedParents =
      filter.parents && filter.parents.length > 0
        ? new Set(filter.parents)
        : null;

    const available = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const key = keys[i]!;
      const ownedValue = effectiveOwned(key, r, deferredOwnedByKey);

      // Apply display filter
      if (filter.display === 'missing') {
        if (computeMissing(r.quantityRequired, ownedValue) === 0) continue;
      } else if (filter.display === 'owned') {
        if (ownedValue === 0) continue;
      }

      // Apply category filter
      if (selectedParents) {
        const parent = parentByIndex[i];
        if (!selectedParents.has(parent)) continue;
        const explicitSubs = filter.subcategoriesByParent?.[parent];
        if (explicitSubs && explicitSubs.length > 0) {
          const category = categoryByIndex[i] ?? 'Uncategorized';
          if (!explicitSubs.includes(category)) continue;
        }
      }

      // Don't apply color filter - we want to know what colors ARE available
      available.add(r.colorName);
    }

    return available;
  }, [
    rows,
    keys,
    filter,
    parentByIndex,
    categoryByIndex,
    deferredOwnedByKey,
    effectiveOwned,
  ]);

  const parentOptions = useMemo(
    () => Array.from(new Set(parentByIndex)).filter(Boolean).sort(),
    [parentByIndex]
  );

  return {
    rows,
    keys,
    ownedByKey,
    minifigStatusByKey,
    isLoading,
    error,
    totalRequired,
    totalMissing,
    ownedTotal,
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
    getControlsState,
    sizeByIndex,
    categoryByIndex,
    parentByIndex,
    rarityByIndex,
    visibleIndices,
    sortedIndices,
    groupKeyByIndex,
    gridSizes,
    subcategoriesByParent,
    colorOptions,
    availableColors,
    countsByParent,
    parentOptions,
    computeMissingRows,
  };
}
