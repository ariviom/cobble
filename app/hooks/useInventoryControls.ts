'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  SortKey,
  ViewType,
} from '@/app/components/set/types';
import {
  getFiltersForSet,
  hasTab,
  updateTabFilters,
} from '@/app/store/open-tabs';

const STORAGE_KEY = 'ui:inventoryControls';

type UseInventoryControlsOptions = {
  /** Set number for per-tab filter persistence */
  setNumber?: string;
};

export function useInventoryControls(options?: UseInventoryControlsOptions) {
  const setNumber = options?.setNumber;
  const [sortKey, setSortKeyState] = useState<SortKey>('color');
  const [sortDir, setSortDirState] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilterState] = useState<InventoryFilter>({
    display: 'all',
    parents: [],
    subcategoriesByParent: {},
    colors: [],
  });
  const [view, setViewState] = useState<ViewType>('list');
  const [itemSize, setItemSizeState] = useState<ItemSize>('md');
  const [groupBy, setGroupByState] = useState<GroupBy>('none');

  // Track if we've hydrated from tab state to avoid double-hydration
  const hydratedFromTabRef = useRef(false);
  // Track if we've hydrated from global storage
  const hydratedFromGlobalRef = useRef(false);
  // Debounce timer for tab filter updates
  const tabUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from tab state first if setNumber provided and tab exists
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!setNumber) return;
    if (hydratedFromTabRef.current) return;

    // Check if this set has a tab with saved filter state
    if (hasTab(setNumber)) {
      const tabFilters = getFiltersForSet(setNumber);
      if (tabFilters) {
        hydratedFromTabRef.current = true;
        setSortKeyState(tabFilters.sortKey);
        setSortDirState(tabFilters.sortDir);
        setViewState(tabFilters.viewType);
        setItemSizeState(tabFilters.itemSize);
        setGroupByState(tabFilters.groupBy);
        setFilterState({
          display: tabFilters.display,
          parents: tabFilters.selectedParents,
          subcategoriesByParent: tabFilters.subcategoriesByParent,
          colors: tabFilters.selectedColors,
        });
        return;
      }
    }
    // Mark as checked even if no tab found
    hydratedFromTabRef.current = true;
  }, [setNumber]);

  // Hydrate from global localStorage as fallback (only for global settings like view/itemSize)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedFromGlobalRef.current) return;
    // Only use global storage if we didn't hydrate from tab
    if (hydratedFromTabRef.current && setNumber && hasTab(setNumber)) {
      hydratedFromGlobalRef.current = true;
      return;
    }

    hydratedFromGlobalRef.current = true;
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

      if (parsed.sortKey) setSortKeyState(parsed.sortKey);
      if (parsed.sortDir) setSortDirState(parsed.sortDir);
      if (parsed.groupBy) setGroupByState(parsed.groupBy);
      if (parsed.view) setViewState(parsed.view);
      if (parsed.itemSize) setItemSizeState(parsed.itemSize);
      if (parsed.display) {
        setFilterState(prev => ({
          ...prev,
          display: parsed.display!,
        }));
      }
    } catch {
      // Ignore storage errors; fall back to defaults
    }
  }, [setNumber]);

  // Persist to global localStorage (for settings that should persist across sessions)
  useEffect(() => {
    if (typeof window === 'undefined') return;
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
  }, [sortKey, sortDir, groupBy, view, itemSize, filter.display]);

  // Sync to tab filter state with debouncing
  const syncToTab = useCallback(() => {
    if (!setNumber || !hasTab(setNumber)) return;

    // Clear any pending timer
    if (tabUpdateTimerRef.current) {
      clearTimeout(tabUpdateTimerRef.current);
    }

    // Debounce the update to avoid excessive localStorage writes
    tabUpdateTimerRef.current = setTimeout(() => {
      updateTabFilters(setNumber, {
        sortKey,
        sortDir,
        viewType: view,
        itemSize,
        groupBy,
        display: filter.display,
        selectedColors: filter.colors,
        selectedParents: filter.parents,
        subcategoriesByParent: filter.subcategoriesByParent,
      });
    }, 100);
  }, [setNumber, sortKey, sortDir, view, itemSize, groupBy, filter]);

  // Sync to tab whenever state changes
  useEffect(() => {
    syncToTab();
  }, [syncToTab]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (tabUpdateTimerRef.current) {
        clearTimeout(tabUpdateTimerRef.current);
      }
    };
  }, []);

  // Wrapped setters that update both local state and tab state
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
