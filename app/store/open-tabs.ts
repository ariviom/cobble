'use client';

import { readStorage, writeStorage } from '@/app/lib/persistence/storage';
import type {
  GroupBy,
  InventoryFilter,
  ItemSize,
  SortKey,
  ViewType,
} from '@/app/components/set/types';
import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenTab = {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
  themeId?: number | null;
  themeName?: string | null;
};

export type TabViewState = {
  scrollTop: number;
  filter: InventoryFilter;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  view: ViewType;
  itemSize: ItemSize;
  groupBy: GroupBy;
};

type OpenTabsState = {
  tabs: OpenTab[];
  activeSetNumber: string | null;
  tabStates: Record<string, TabViewState>; // keyed by setNumber

  // Actions
  openTab: (tab: OpenTab) => void;
  closeTab: (setNumber: string) => void;
  setActiveTab: (setNumber: string) => void;
  saveTabState: (setNumber: string, state: Partial<TabViewState>) => void;
  getTabState: (setNumber: string) => TabViewState | undefined;
  getActiveTab: () => OpenTab | undefined;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'brick_party_open_tabs_v1';
const MAX_TABS = 10;

// ---------------------------------------------------------------------------
// Default filter state
// ---------------------------------------------------------------------------

export function createDefaultFilter(): InventoryFilter {
  return {
    display: 'all',
    parents: [],
    subcategoriesByParent: {},
    colors: [],
  };
}

export function createDefaultTabViewState(): TabViewState {
  return {
    scrollTop: 0,
    filter: createDefaultFilter(),
    sortKey: 'category',
    sortDir: 'asc',
    view: 'grid',
    itemSize: 'md',
    groupBy: 'none',
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type PersistedShape = {
  tabs: OpenTab[];
  activeSetNumber: string | null;
  tabStates: Record<string, TabViewState>;
};

function isValidOpenTab(obj: unknown): obj is OpenTab {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj as Partial<OpenTab>;
  return (
    typeof t.setNumber === 'string' &&
    t.setNumber.length > 0 &&
    typeof t.name === 'string' &&
    typeof t.numParts === 'number' &&
    typeof t.year === 'number'
  );
}

function isValidFilter(obj: unknown): obj is InventoryFilter {
  if (!obj || typeof obj !== 'object') return false;
  const f = obj as Partial<InventoryFilter>;
  return (
    (f.display === 'all' || f.display === 'missing' || f.display === 'owned') &&
    Array.isArray(f.parents) &&
    typeof f.subcategoriesByParent === 'object' &&
    Array.isArray(f.colors)
  );
}

function isValidTabViewState(obj: unknown): obj is TabViewState {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Partial<TabViewState>;
  return (
    // scrollTop is optional for backward compatibility
    (s.scrollTop === undefined || typeof s.scrollTop === 'number') &&
    isValidFilter(s.filter) &&
    typeof s.sortKey === 'string' &&
    (s.sortDir === 'asc' || s.sortDir === 'desc') &&
    (s.view === 'list' || s.view === 'grid') &&
    (s.itemSize === 'sm' || s.itemSize === 'md' || s.itemSize === 'lg') &&
    (s.groupBy === 'none' ||
      s.groupBy === 'color' ||
      s.groupBy === 'size' ||
      s.groupBy === 'category')
  );
}

function parsePersisted(
  raw: string | null
): Omit<
  OpenTabsState,
  | 'openTab'
  | 'closeTab'
  | 'setActiveTab'
  | 'saveTabState'
  | 'getTabState'
  | 'getActiveTab'
> {
  const empty = {
    tabs: [],
    activeSetNumber: null,
    tabStates: {},
  };

  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;

    const tabs: OpenTab[] = [];
    if (Array.isArray(parsed.tabs)) {
      for (const t of parsed.tabs) {
        if (isValidOpenTab(t)) {
          const rawThemeId = (t as OpenTab).themeId;
          const rawThemeName = (t as OpenTab).themeName;
          tabs.push({
            setNumber: t.setNumber,
            name: t.name,
            imageUrl:
              typeof t.imageUrl === 'string' || t.imageUrl === null
                ? t.imageUrl
                : null,
            numParts: t.numParts,
            year: t.year,
            ...(typeof rawThemeId === 'number' ? { themeId: rawThemeId } : {}),
            ...(typeof rawThemeName === 'string'
              ? { themeName: rawThemeName }
              : {}),
          });
        }
      }
    }

    const tabStates: Record<string, TabViewState> = {};
    if (parsed.tabStates && typeof parsed.tabStates === 'object') {
      for (const [setNumber, state] of Object.entries(parsed.tabStates)) {
        if (isValidTabViewState(state)) {
          // Ensure scrollTop has a default for backward compatibility
          tabStates[setNumber] = {
            ...state,
            scrollTop: (state as TabViewState).scrollTop ?? 0,
          };
        }
      }
    }

    // Validate activeSetNumber is in tabs
    let activeSetNumber: string | null = null;
    if (
      typeof parsed.activeSetNumber === 'string' &&
      tabs.some(
        t => t.setNumber.toLowerCase() === parsed.activeSetNumber?.toLowerCase()
      )
    ) {
      activeSetNumber = parsed.activeSetNumber;
    } else if (tabs.length > 0) {
      // Default to first tab if active is invalid
      activeSetNumber = tabs[0].setNumber;
    }

    return { tabs, activeSetNumber, tabStates };
  } catch {
    return empty;
  }
}

function loadInitialState(): Omit<
  OpenTabsState,
  | 'openTab'
  | 'closeTab'
  | 'setActiveTab'
  | 'saveTabState'
  | 'getTabState'
  | 'getActiveTab'
> {
  try {
    const raw = readStorage(STORAGE_KEY);
    return parsePersisted(raw);
  } catch {
    return {
      tabs: [],
      activeSetNumber: null,
      tabStates: {},
    };
  }
}

function persistState(state: OpenTabsState): void {
  try {
    const payload: PersistedShape = {
      tabs: state.tabs,
      activeSetNumber: state.activeSetNumber,
      tabStates: state.tabStates,
    };
    writeStorage(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore persistence errors
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOpenTabsStore = create<OpenTabsState>((set, get) => ({
  ...loadInitialState(),

  openTab: (tab: OpenTab) => {
    const { tabs, tabStates } = get();
    const normalizedSetNumber = tab.setNumber.toLowerCase();

    // Check if tab already exists
    const existingIndex = tabs.findIndex(
      t => t.setNumber.toLowerCase() === normalizedSetNumber
    );

    let nextTabs: OpenTab[];
    if (existingIndex >= 0) {
      // Tab exists - update metadata and make active
      nextTabs = tabs.map((t, i) =>
        i === existingIndex ? { ...t, ...tab } : t
      );
    } else {
      // New tab - add to end, respecting max limit
      nextTabs = [...tabs, tab].slice(-MAX_TABS);
    }

    // Initialize tab state if not exists
    const nextTabStates = { ...tabStates };
    if (!nextTabStates[tab.setNumber]) {
      nextTabStates[tab.setNumber] = createDefaultTabViewState();
    }

    const nextState: OpenTabsState = {
      ...get(),
      tabs: nextTabs,
      activeSetNumber: tab.setNumber,
      tabStates: nextTabStates,
    };
    set(nextState);
    persistState(nextState);
  },

  closeTab: (setNumber: string) => {
    const { tabs, activeSetNumber, tabStates } = get();
    const normalizedSetNumber = setNumber.toLowerCase();

    const tabIndex = tabs.findIndex(
      t => t.setNumber.toLowerCase() === normalizedSetNumber
    );
    if (tabIndex < 0) return;

    const nextTabs = tabs.filter((_, i) => i !== tabIndex);

    // Clean up tab state
    const nextTabStates = { ...tabStates };
    delete nextTabStates[setNumber];

    // Determine new active tab if closing the active one
    let nextActiveSetNumber = activeSetNumber;
    if (activeSetNumber?.toLowerCase() === normalizedSetNumber) {
      if (nextTabs.length === 0) {
        nextActiveSetNumber = null;
      } else if (tabIndex >= nextTabs.length) {
        // Was last tab, go to new last
        nextActiveSetNumber = nextTabs[nextTabs.length - 1].setNumber;
      } else {
        // Go to tab at same index (which is now the next tab)
        nextActiveSetNumber = nextTabs[tabIndex].setNumber;
      }
    }

    const nextState: OpenTabsState = {
      ...get(),
      tabs: nextTabs,
      activeSetNumber: nextActiveSetNumber,
      tabStates: nextTabStates,
    };
    set(nextState);
    persistState(nextState);
  },

  setActiveTab: (setNumber: string) => {
    const { tabs } = get();
    const normalizedSetNumber = setNumber.toLowerCase();

    // Verify tab exists
    const exists = tabs.some(
      t => t.setNumber.toLowerCase() === normalizedSetNumber
    );
    if (!exists) return;

    const nextState: OpenTabsState = {
      ...get(),
      activeSetNumber: setNumber,
    };
    set(nextState);
    persistState(nextState);
  },

  saveTabState: (setNumber: string, state: Partial<TabViewState>) => {
    const { tabStates } = get();
    const existing = tabStates[setNumber] ?? createDefaultTabViewState();

    const nextTabStates = {
      ...tabStates,
      [setNumber]: {
        ...existing,
        ...state,
      },
    };

    const nextState: OpenTabsState = {
      ...get(),
      tabStates: nextTabStates,
    };
    set(nextState);
    persistState(nextState);
  },

  getTabState: (setNumber: string) => {
    return get().tabStates[setNumber];
  },

  getActiveTab: () => {
    const { tabs, activeSetNumber } = get();
    if (!activeSetNumber) return undefined;
    return tabs.find(
      t => t.setNumber.toLowerCase() === activeSetNumber.toLowerCase()
    );
  },
}));

// ---------------------------------------------------------------------------
// Cross-tab sync
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = parsePersisted(event.newValue);
    // Sync tabs list and view states, but NOT activeSetNumber.
    // Each browser tab maintains its own active set independently
    // to prevent infinite switching loops when multiple tabs are open.
    useOpenTabsStore.setState(state => {
      // If current active tab was closed in another browser tab, pick a new one
      const activeStillExists = next.tabs.some(
        t => t.setNumber.toLowerCase() === state.activeSetNumber?.toLowerCase()
      );
      const nextActiveSetNumber = activeStillExists
        ? state.activeSetNumber
        : next.tabs.length > 0
          ? next.tabs[0].setNumber
          : null;

      return {
        ...state,
        tabs: next.tabs,
        activeSetNumber: nextActiveSetNumber,
        tabStates: next.tabStates,
      };
    });
  });
}
