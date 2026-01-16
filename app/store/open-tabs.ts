'use client';

import { readStorage, writeStorage } from '@/app/lib/persistence/storage';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  SortKey,
  ViewType,
} from '@/app/components/set/types';

const STORAGE_KEY = 'brick_party_open_tabs_v1';
const MAX_TABS = 8;

export type TabFilterState = {
  display: InventoryFilter['display'];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  viewType: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
  selectedColors: string[];
  selectedParents: string[];
  subcategoriesByParent: Record<string, string[]>;
};

export type OpenTab = {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
  addedAt: number;
  filterState: TabFilterState;
};

// Cached snapshot for useSyncExternalStore compatibility
let cachedSnapshot: OpenTab[] = [];
let isInitialized = false;

// Event for cross-tab sync
type TabsChangeListener = () => void;
const listeners = new Set<TabsChangeListener>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

// Default filter state for new tabs
function getDefaultFilterState(): TabFilterState {
  return {
    display: 'all',
    sortKey: 'color',
    sortDir: 'asc',
    viewType: 'list',
    itemSize: 'md',
    groupBy: 'none',
    selectedColors: [],
    selectedParents: [],
    subcategoriesByParent: {},
  };
}

function loadTabsUnsafe(): OpenTab[] {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((it): OpenTab | null => {
        if (!it || typeof it !== 'object') return null;
        const obj = it as Partial<OpenTab>;
        if (
          !obj.setNumber ||
          typeof obj.setNumber !== 'string' ||
          !obj.name ||
          typeof obj.name !== 'string'
        ) {
          return null;
        }
        const year =
          typeof obj.year === 'number' && Number.isFinite(obj.year)
            ? obj.year
            : 0;
        const numParts =
          typeof obj.numParts === 'number' && Number.isFinite(obj.numParts)
            ? obj.numParts
            : 0;
        const imageUrl =
          typeof obj.imageUrl === 'string' || obj.imageUrl === null
            ? obj.imageUrl
            : null;
        const addedAt =
          typeof obj.addedAt === 'number' && Number.isFinite(obj.addedAt)
            ? obj.addedAt
            : Date.now();

        // Parse filter state with defaults for missing fields
        const defaultFilter = getDefaultFilterState();
        let filterState = defaultFilter;
        if (obj.filterState && typeof obj.filterState === 'object') {
          const fs = obj.filterState as Partial<TabFilterState>;
          filterState = {
            display:
              fs.display === 'all' ||
              fs.display === 'missing' ||
              fs.display === 'owned'
                ? fs.display
                : defaultFilter.display,
            sortKey:
              fs.sortKey === 'name' ||
              fs.sortKey === 'color' ||
              fs.sortKey === 'size' ||
              fs.sortKey === 'category' ||
              fs.sortKey === 'price'
                ? fs.sortKey
                : defaultFilter.sortKey,
            sortDir:
              fs.sortDir === 'asc' || fs.sortDir === 'desc'
                ? fs.sortDir
                : defaultFilter.sortDir,
            viewType:
              fs.viewType === 'list' || fs.viewType === 'grid'
                ? fs.viewType
                : defaultFilter.viewType,
            itemSize:
              fs.itemSize === 'sm' ||
              fs.itemSize === 'md' ||
              fs.itemSize === 'lg'
                ? fs.itemSize
                : defaultFilter.itemSize,
            groupBy:
              fs.groupBy === 'none' ||
              fs.groupBy === 'color' ||
              fs.groupBy === 'size' ||
              fs.groupBy === 'category'
                ? fs.groupBy
                : defaultFilter.groupBy,
            selectedColors: Array.isArray(fs.selectedColors)
              ? fs.selectedColors.filter(
                  (c): c is string => typeof c === 'string'
                )
              : defaultFilter.selectedColors,
            selectedParents: Array.isArray(fs.selectedParents)
              ? fs.selectedParents.filter(
                  (p): p is string => typeof p === 'string'
                )
              : defaultFilter.selectedParents,
            subcategoriesByParent:
              fs.subcategoriesByParent &&
              typeof fs.subcategoriesByParent === 'object'
                ? fs.subcategoriesByParent
                : defaultFilter.subcategoriesByParent,
          };
        }

        return {
          setNumber: obj.setNumber,
          name: obj.name,
          year,
          imageUrl,
          numParts,
          addedAt,
          filterState,
        };
      })
      .filter((x): x is OpenTab => x !== null);
  } catch {
    return [];
  }
}

// Update the cached snapshot and notify listeners
function updateSnapshot(): void {
  const tabs = loadTabsUnsafe();
  // Sort by addedAt ascending (oldest first)
  cachedSnapshot = [...tabs].sort((a, b) => a.addedAt - b.addedAt);
  notifyListeners();
}

function saveTabs(tabs: OpenTab[]): void {
  try {
    writeStorage(STORAGE_KEY, JSON.stringify(tabs));
    updateSnapshot();
  } catch {
    // ignore storage errors
  }
}

// Initialize snapshot (lazy, called on first access)
function ensureInitialized(): void {
  if (isInitialized) return;
  if (typeof window === 'undefined') return;

  isInitialized = true;
  const tabs = loadTabsUnsafe();
  cachedSnapshot = [...tabs].sort((a, b) => a.addedAt - b.addedAt);
}

// getSnapshot for useSyncExternalStore - returns cached reference
export function getOpenTabs(): OpenTab[] {
  ensureInitialized();
  return cachedSnapshot;
}

export function getTab(setNumber: string): OpenTab | undefined {
  ensureInitialized();
  return cachedSnapshot.find(
    t => t.setNumber.toLowerCase() === setNumber.toLowerCase()
  );
}

export function hasTab(setNumber: string): boolean {
  return getTab(setNumber) !== undefined;
}

export function getTabCount(): number {
  ensureInitialized();
  return cachedSnapshot.length;
}

export function isAtTabLimit(): boolean {
  return getTabCount() >= MAX_TABS;
}

export type AddTabResult =
  | { success: true; isNew: boolean }
  | { success: false; reason: 'limit_reached' };

export function addTab(entry: {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
}): AddTabResult {
  try {
    const existing = loadTabsUnsafe();
    const existingIndex = existing.findIndex(
      t => t.setNumber.toLowerCase() === entry.setNumber.toLowerCase()
    );

    // If tab already exists, just return success (no duplicate)
    if (existingIndex !== -1) {
      return { success: true, isNew: false };
    }

    // Check tab limit
    if (existing.length >= MAX_TABS) {
      return { success: false, reason: 'limit_reached' };
    }

    // Add new tab
    const newTab: OpenTab = {
      ...entry,
      addedAt: Date.now(),
      filterState: getDefaultFilterState(),
    };

    const next = [...existing, newTab];
    saveTabs(next);
    return { success: true, isNew: true };
  } catch {
    return { success: false, reason: 'limit_reached' };
  }
}

export function removeTab(setNumber: string): void {
  try {
    const existing = loadTabsUnsafe();
    const next = existing.filter(
      t => t.setNumber.toLowerCase() !== setNumber.toLowerCase()
    );
    saveTabs(next);
  } catch {
    // ignore storage errors
  }
}

export function updateTabFilters(
  setNumber: string,
  filters: Partial<TabFilterState>
): void {
  try {
    const existing = loadTabsUnsafe();
    const next = existing.map(t => {
      if (t.setNumber.toLowerCase() === setNumber.toLowerCase()) {
        return {
          ...t,
          filterState: { ...t.filterState, ...filters },
        };
      }
      return t;
    });
    saveTabs(next);
  } catch {
    // ignore storage errors
  }
}

export function getFiltersForSet(
  setNumber: string
): TabFilterState | undefined {
  const tab = getTab(setNumber);
  return tab?.filterState;
}

export function reorderTabs(fromIndex: number, toIndex: number): void {
  try {
    ensureInitialized();
    const tabs = [...cachedSnapshot];
    if (
      fromIndex < 0 ||
      fromIndex >= tabs.length ||
      toIndex < 0 ||
      toIndex >= tabs.length
    ) {
      return;
    }
    const [removed] = tabs.splice(fromIndex, 1);
    tabs.splice(toIndex, 0, removed!);
    // Update addedAt to preserve new order
    const now = Date.now();
    const reordered = tabs.map((t, i) => ({
      ...t,
      addedAt: now + i,
    }));
    saveTabs(reordered);
  } catch {
    // ignore errors
  }
}

export function clearAllTabs(): void {
  saveTabs([]);
}

// Subscribe function for useSyncExternalStore
export function subscribeToTabs(listener: TabsChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Cross-tab sync via storage events
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === STORAGE_KEY) {
      updateSnapshot();
    }
  });
}
