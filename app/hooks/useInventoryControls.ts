'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

export function useInventoryControls(options?: UseInventoryControlsOptions) {
  const { initialState, skipStorageHydration = false } = options ?? {};

  const [sortKey, setSortKeyState] = useState<SortKey>(
    initialState?.sortKey ?? 'color'
  );
  const [sortDir, setSortDirState] = useState<'asc' | 'desc'>(
    initialState?.sortDir ?? 'asc'
  );
  const [filter, setFilterState] = useState<InventoryFilter>(
    initialState?.filter ?? createDefaultFilter()
  );
  const [view, setViewState] = useState<ViewType>(initialState?.view ?? 'grid');
  const [itemSize, setItemSizeState] = useState<ItemSize>(
    initialState?.itemSize ?? 'sm'
  );
  const [groupBy, setGroupByState] = useState<GroupBy>(
    initialState?.groupBy ?? 'none'
  );

  // Track if we've hydrated from storage
  const hydratedRef = useRef(false);

  // Hydrate from localStorage (only for default/global controls, not tab-specific)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedRef.current) return;
    if (skipStorageHydration) {
      hydratedRef.current = true;
      return;
    }

    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        sortKey: SortKey;
        sortDir: 'asc' | 'desc';
        groupBy: GroupBy;
        view: ViewType;
        itemSize: ItemSize;
        display: InventoryFilter['display'];
      }>;

      // Only apply storage values if no initial state was provided for that field
      if (!initialState?.sortKey && parsed.sortKey)
        setSortKeyState(parsed.sortKey);
      if (!initialState?.sortDir && parsed.sortDir)
        setSortDirState(parsed.sortDir);
      if (!initialState?.groupBy && parsed.groupBy)
        setGroupByState(parsed.groupBy);
      if (!initialState?.view && parsed.view) setViewState(parsed.view);
      if (!initialState?.itemSize && parsed.itemSize)
        setItemSizeState(parsed.itemSize);
      if (!initialState?.filter && parsed.display) {
        setFilterState(prev => ({
          ...prev,
          display: parsed.display!,
        }));
      }
    } catch {
      // Ignore storage errors; fall back to defaults
    }
  }, [initialState, skipStorageHydration]);

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

  // Setters
  const setSortKey = useCallback(
    (value: SortKey | ((prev: SortKey) => SortKey)) => {
      setSortKeyState(value);
    },
    []
  );

  const setSortDir = useCallback(
    (value: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => {
      setSortDirState(value);
    },
    []
  );

  const setFilter = useCallback(
    (value: InventoryFilter | ((prev: InventoryFilter) => InventoryFilter)) => {
      setFilterState(value);
    },
    []
  );

  const setView = useCallback(
    (value: ViewType | ((prev: ViewType) => ViewType)) => {
      setViewState(value);
    },
    []
  );

  const setItemSize = useCallback(
    (value: ItemSize | ((prev: ItemSize) => ItemSize)) => {
      setItemSizeState(value);
    },
    []
  );

  const setGroupBy = useCallback(
    (value: GroupBy | ((prev: GroupBy) => GroupBy)) => {
      setGroupByState(value);
    },
    []
  );

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
