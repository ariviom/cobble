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

export function useInventoryControls() {
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

  // Track if we've hydrated from storage
  const hydratedRef = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hydratedRef.current) return;

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
  }, []);

  // Persist to localStorage
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
