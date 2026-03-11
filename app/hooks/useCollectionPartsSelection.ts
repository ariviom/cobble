'use client';

import type { PartSelection } from '@/app/components/collection/parts/types';
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'brick_party_parts_selection';

function loadSelections(): Map<string, PartSelection> {
  if (typeof window === 'undefined') return new Map();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();
    const arr: PartSelection[] = JSON.parse(stored);
    const map = new Map<string, PartSelection>();
    for (const s of arr) {
      const key = s.setNumber
        ? `${s.canonicalKey}:${s.setNumber}`
        : s.canonicalKey;
      map.set(key, s);
    }
    return map;
  } catch {
    return new Map();
  }
}

function saveSelections(selections: Map<string, PartSelection>) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(selections.values()))
    );
  } catch {}
}

export function useCollectionPartsSelection() {
  const [selections, setSelectionsRaw] =
    useState<Map<string, PartSelection>>(loadSelections);

  const setSelections = useCallback(
    (
      nextOrUpdater:
        | Map<string, PartSelection>
        | ((prev: Map<string, PartSelection>) => Map<string, PartSelection>)
    ) => {
      setSelectionsRaw(prev => {
        const next =
          typeof nextOrUpdater === 'function'
            ? nextOrUpdater(prev)
            : nextOrUpdater;
        saveSelections(next);
        return next;
      });
    },
    []
  );

  const toggleSelection = useCallback(
    (canonicalKey: string, quantity: number, setNumber?: string) => {
      setSelections(prev => {
        const next = new Map(prev);
        const key = setNumber ? `${canonicalKey}:${setNumber}` : canonicalKey;
        if (next.has(key)) {
          next.delete(key);
        } else {
          const selection: PartSelection = setNumber
            ? { canonicalKey, quantity, setNumber }
            : { canonicalKey, quantity };
          next.set(key, selection);
        }
        return next;
      });
    },
    [setSelections]
  );

  const selectAll = useCallback(
    (
      items: Array<{
        canonicalKey: string;
        quantity: number;
        setNumber?: string;
      }>
    ) => {
      setSelections(prev => {
        const next = new Map(prev);
        for (const item of items) {
          const key = item.setNumber
            ? `${item.canonicalKey}:${item.setNumber}`
            : item.canonicalKey;
          next.set(key, item);
        }
        return next;
      });
    },
    [setSelections]
  );

  const deselectAll = useCallback(
    (keys: string[]) => {
      setSelections(prev => {
        const next = new Map(prev);
        for (const key of keys) next.delete(key);
        return next;
      });
    },
    [setSelections]
  );

  const clearAll = useCallback(() => {
    setSelections(new Map());
  }, [setSelections]);

  const updateQuantity = useCallback(
    (key: string, quantity: number) => {
      setSelections(prev => {
        const next = new Map(prev);
        const existing = next.get(key);
        if (existing) next.set(key, { ...existing, quantity });
        return next;
      });
    },
    [setSelections]
  );

  const isSelected = useCallback(
    (canonicalKey: string, setNumber?: string) => {
      const key = setNumber ? `${canonicalKey}:${setNumber}` : canonicalKey;
      return selections.has(key);
    },
    [selections]
  );

  return {
    selections,
    selectionCount: selections.size,
    toggleSelection,
    selectAll,
    deselectAll,
    clearAll,
    updateQuantity,
    isSelected,
  };
}
