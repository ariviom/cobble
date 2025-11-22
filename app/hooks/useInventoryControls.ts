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

export function useInventoryControls() {
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

  // Hydrate from localStorage on first mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
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

      if (parsed.sortKey) setSortKey(parsed.sortKey);
      if (parsed.sortDir) setSortDir(parsed.sortDir);
      if (parsed.groupBy) setGroupBy(parsed.groupBy);
      if (parsed.view) setView(parsed.view);
      if (parsed.itemSize) setItemSize(parsed.itemSize);
      if (parsed.display) {
        setFilter(prev => ({
          ...prev,
          display: parsed.display!,
        }));
      }
    } catch {
      // Ignore storage errors; fall back to defaults
    }
  }, []);

  // Persist a minimal snapshot of controls to localStorage
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


