'use client';

import { useEffect, useState } from 'react';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  SortKey,
  ViewType,
} from '@/app/components/set/types';

const STORAGE_KEY = 'ui:inventoryControls';

export type InventoryControlsState = {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  filter: InventoryFilter;
  view: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
};

export type UseInventoryControlsOptions = {
  /** Initial state to use instead of defaults (for tab restoration) */
  initialState?: Partial<InventoryControlsState> | undefined;
  /** Skip localStorage hydration when using tab-specific state */
  skipStorageHydration?: boolean;
};

function createDefaultFilter(): InventoryFilter {
  return {
    display: 'all',
    parents: [],
    subcategoriesByParent: {},
    colors: [],
  };
}

function readStoredControls(): Partial<{
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  groupBy: GroupBy;
  view: ViewType;
  itemSize: ItemSize;
  display: InventoryFilter['display'];
}> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useInventoryControls(options?: UseInventoryControlsOptions) {
  const { initialState, skipStorageHydration = false } = options ?? {};

  // Parse localStorage once upfront (not inside each useState initializer)
  const stored = skipStorageHydration ? null : readStoredControls();

  const [sortKey, setSortKey] = useState<SortKey>(
    initialState?.sortKey ?? stored?.sortKey ?? 'color'
  );

  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    initialState?.sortDir ?? stored?.sortDir ?? 'asc'
  );

  const [filter, setFilter] = useState<InventoryFilter>(() => {
    if (initialState?.filter) return initialState.filter;
    if (stored?.display) {
      return { ...createDefaultFilter(), display: stored.display };
    }
    return createDefaultFilter();
  });

  const [view, setView] = useState<ViewType>(
    initialState?.view ?? stored?.view ?? 'grid'
  );

  const [itemSize, setItemSize] = useState<ItemSize>(
    initialState?.itemSize ?? stored?.itemSize ?? 'sm'
  );

  const [groupBy, setGroupBy] = useState<GroupBy>(
    initialState?.groupBy ?? stored?.groupBy ?? 'none'
  );

  // Persist to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipStorageHydration) return;
    try {
      const payload = {
        sortKey,
        sortDir,
        groupBy,
        view,
        itemSize,
        display: filter.display,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors; runtime UX should not break
    }
  }, [
    sortKey,
    sortDir,
    groupBy,
    view,
    itemSize,
    filter.display,
    skipStorageHydration,
  ]);

  return {
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
  };
}
