'use client';

import {
  DEFAULT_PARTS_CONTROLS,
  type PartsControlsState,
  type PartsFilter,
  type PartsSortKey,
} from '@/app/components/collection/parts/types';
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'brick_party_parts_controls';

function loadFromStorage(): PartsControlsState {
  if (typeof window === 'undefined') return DEFAULT_PARTS_CONTROLS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PARTS_CONTROLS;
    const parsed = JSON.parse(stored) as Partial<PartsControlsState>;
    return {
      ...DEFAULT_PARTS_CONTROLS,
      ...parsed,
      filter: { ...DEFAULT_PARTS_CONTROLS.filter, ...parsed.filter },
    };
  } catch {
    return DEFAULT_PARTS_CONTROLS;
  }
}

function saveToStorage(state: PartsControlsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

export function useCollectionPartsControls() {
  const [state, setStateRaw] = useState<PartsControlsState>(loadFromStorage);

  const setState = useCallback(
    (
      next:
        | PartsControlsState
        | ((prev: PartsControlsState) => PartsControlsState)
    ) => {
      setStateRaw(prev => {
        const nextState = typeof next === 'function' ? next(prev) : next;
        saveToStorage(nextState);
        return nextState;
      });
    },
    []
  );

  const setFilter = useCallback(
    (filter: PartsFilter) => {
      setState(prev => ({ ...prev, filter, page: 1 }));
    },
    [setState]
  );

  const setSortKey = useCallback(
    (sortKey: PartsSortKey) => {
      setState(prev => ({ ...prev, sortKey, page: 1 }));
    },
    [setState]
  );

  const toggleSortDir = useCallback(() => {
    setState(prev => ({
      ...prev,
      sortDir: prev.sortDir === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));
  }, [setState]);

  const setGroupBy = useCallback(
    (groupBy: PartsControlsState['groupBy']) => {
      setState(prev => ({ ...prev, groupBy }));
    },
    [setState]
  );

  const setView = useCallback(
    (view: PartsControlsState['view']) => {
      setState(prev => ({ ...prev, view }));
    },
    [setState]
  );

  const setItemSize = useCallback(
    (itemSize: PartsControlsState['itemSize']) => {
      setState(prev => ({ ...prev, itemSize }));
    },
    [setState]
  );

  const setPage = useCallback(
    (page: number) => {
      setState(prev => ({ ...prev, page }));
    },
    [setState]
  );

  const setSourceFilter = useCallback(
    (source: PartsFilter['source']) => {
      setState(prev => ({
        ...prev,
        filter: { ...prev.filter, source },
        page: 1,
      }));
    },
    [setState]
  );

  return {
    ...state,
    setFilter,
    setSortKey,
    toggleSortDir,
    setGroupBy,
    setView,
    setItemSize,
    setPage,
    setSourceFilter,
  };
}
