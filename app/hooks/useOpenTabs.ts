'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addTab,
  clearAllTabs,
  getOpenTabs,
  getTab,
  hasTab,
  type AddTabResult,
  type OpenTab,
  removeTab,
  reorderTabs,
  subscribeToTabs,
  updateTabFilters,
  type TabFilterState,
} from '@/app/store/open-tabs';

export function useOpenTabs() {
  const [tabs, setTabs] = useState<OpenTab[]>([]);

  // Initialize and subscribe to changes
  useEffect(() => {
    // Load initial state
    setTabs(getOpenTabs());

    // Subscribe to changes
    const unsubscribe = subscribeToTabs(() => {
      setTabs(getOpenTabs());
    });

    return unsubscribe;
  }, []);

  const add = useCallback(
    (entry: {
      setNumber: string;
      name: string;
      imageUrl: string | null;
      numParts: number;
      year: number;
    }): AddTabResult => {
      return addTab(entry);
    },
    []
  );

  const remove = useCallback((setNumber: string) => {
    removeTab(setNumber);
  }, []);

  const updateFilters = useCallback(
    (setNumber: string, filters: Partial<TabFilterState>) => {
      updateTabFilters(setNumber, filters);
    },
    []
  );

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    reorderTabs(fromIndex, toIndex);
  }, []);

  const clearAll = useCallback(() => {
    clearAllTabs();
  }, []);

  const has = useCallback((setNumber: string): boolean => {
    return hasTab(setNumber);
  }, []);

  const get = useCallback((setNumber: string): OpenTab | undefined => {
    return getTab(setNumber);
  }, []);

  const count = tabs.length;
  const atLimit = count >= 8;

  return {
    tabs,
    count,
    atLimit,
    add,
    remove,
    updateFilters,
    reorder,
    clearAll,
    has,
    get,
  };
}

// Hook to use tab filter state for a specific set
export function useTabFilterState(setNumber: string) {
  const [filterState, setFilterState] = useState<TabFilterState | null>(null);

  useEffect(() => {
    // Load initial state
    const tab = getTab(setNumber);
    if (tab) {
      setFilterState(tab.filterState);
    }

    // Subscribe to changes
    const unsubscribe = subscribeToTabs(() => {
      const updatedTab = getTab(setNumber);
      if (updatedTab) {
        setFilterState(updatedTab.filterState);
      }
    });

    return unsubscribe;
  }, [setNumber]);

  const update = useCallback(
    (filters: Partial<TabFilterState>) => {
      updateTabFilters(setNumber, filters);
      // Optimistically update local state
      setFilterState(prev => (prev ? { ...prev, ...filters } : null));
    },
    [setNumber]
  );

  return { filterState, update };
}
