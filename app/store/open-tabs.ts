'use client';

import {
  readStorage,
  removeStorage,
  writeStorage,
} from '@/app/lib/persistence/storage';
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

export type SetTab = {
  type: 'set';
  id: string; // set number e.g. '75192-1'
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
  themeId?: number | null;
  themeName?: string | null;
};

export type LandingTab = {
  type: 'landing';
  id: string; // generated e.g. 'landing-1709234567890'
};

export type OpenTab = SetTab | LandingTab;

export function isSetTab(tab: OpenTab): tab is SetTab {
  return tab.type === 'set';
}

export function isLandingTab(tab: OpenTab): tab is LandingTab {
  return tab.type === 'landing';
}

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
  activeTabId: string | null;
  tabStates: Record<string, TabViewState>; // keyed by tab id

  // Actions
  openTab: (tab: SetTab) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  openLandingTab: () => void;
  replaceLandingWithSet: (landingTabId: string, setTab: SetTab) => void;
  saveTabState: (id: string, state: Partial<TabViewState>) => void;
  getTabState: (id: string) => TabViewState | undefined;
  getActiveTab: () => OpenTab | undefined;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY_V1 = 'brick_party_open_tabs_v1';
const STORAGE_KEY = 'brick_party_open_tabs_v2';
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
// Landing tab ID generator
// ---------------------------------------------------------------------------

let landingCounter = 0;
function generateLandingId(): string {
  return `landing-${Date.now()}-${++landingCounter}`;
}

function createLandingTab(): LandingTab {
  return { type: 'landing', id: generateLandingId() };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type PersistedShape = {
  tabs: OpenTab[];
  activeTabId: string | null;
  tabStates: Record<string, TabViewState>;
};

function isValidSetTab(obj: unknown): obj is SetTab {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj as Partial<SetTab>;
  return (
    t.type === 'set' &&
    typeof t.id === 'string' &&
    t.id.length > 0 &&
    typeof t.name === 'string' &&
    typeof t.numParts === 'number' &&
    typeof t.year === 'number'
  );
}

function isValidLandingTab(obj: unknown): obj is LandingTab {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj as Partial<LandingTab>;
  return t.type === 'landing' && typeof t.id === 'string' && t.id.length > 0;
}

function isValidOpenTab(obj: unknown): obj is OpenTab {
  return isValidSetTab(obj) || isValidLandingTab(obj);
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

// ---------------------------------------------------------------------------
// v1 → v2 migration
// ---------------------------------------------------------------------------

type V1Tab = {
  setNumber: string;
  name: string;
  imageUrl: string | null;
  numParts: number;
  year: number;
  themeId?: number | null;
  themeName?: string | null;
};

type V1Shape = {
  tabs: V1Tab[];
  activeSetNumber: string | null;
  tabStates: Record<string, TabViewState>;
};

function migrateV1ToV2(): PersistedShape | null {
  try {
    const raw = readStorage(STORAGE_KEY_V1);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<V1Shape>;
    if (!Array.isArray(parsed.tabs)) return null;

    const tabs: OpenTab[] = [];
    const tabStates: Record<string, TabViewState> = {};

    for (const t of parsed.tabs) {
      if (
        t &&
        typeof t === 'object' &&
        typeof (t as V1Tab).setNumber === 'string' &&
        (t as V1Tab).setNumber.length > 0
      ) {
        const v1 = t as V1Tab;
        const setTab: SetTab = {
          type: 'set',
          id: v1.setNumber,
          name: v1.name,
          imageUrl:
            typeof v1.imageUrl === 'string' || v1.imageUrl === null
              ? v1.imageUrl
              : null,
          numParts: v1.numParts,
          year: v1.year,
          ...(typeof v1.themeId === 'number' ? { themeId: v1.themeId } : {}),
          ...(typeof v1.themeName === 'string'
            ? { themeName: v1.themeName }
            : {}),
        };
        tabs.push(setTab);
      }
    }

    // Migrate tab states (keys were setNumber, now id — same value for set tabs)
    if (parsed.tabStates && typeof parsed.tabStates === 'object') {
      for (const [key, state] of Object.entries(parsed.tabStates)) {
        if (isValidTabViewState(state)) {
          tabStates[key] = {
            ...state,
            scrollTop: (state as TabViewState).scrollTop ?? 0,
          };
        }
      }
    }

    // Map activeSetNumber → activeTabId
    let activeTabId: string | null = null;
    if (
      typeof parsed.activeSetNumber === 'string' &&
      tabs.some(
        t =>
          isSetTab(t) &&
          t.id.toLowerCase() === parsed.activeSetNumber?.toLowerCase()
      )
    ) {
      activeTabId = parsed.activeSetNumber;
    } else if (tabs.length > 0) {
      activeTabId = tabs[0].id;
    }

    const v2: PersistedShape = { tabs, activeTabId, tabStates };

    // Persist v2 and remove v1
    writeStorage(STORAGE_KEY, JSON.stringify(v2));
    removeStorage(STORAGE_KEY_V1);

    return v2;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parse persisted v2 data
// ---------------------------------------------------------------------------

type DataState = Omit<
  OpenTabsState,
  | 'openTab'
  | 'closeTab'
  | 'setActiveTab'
  | 'openLandingTab'
  | 'replaceLandingWithSet'
  | 'saveTabState'
  | 'getTabState'
  | 'getActiveTab'
>;

function parsePersisted(raw: string | null): DataState {
  const empty: DataState = {
    tabs: [],
    activeTabId: null,
    tabStates: {},
  };

  if (!raw) return empty;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;

    const tabs: OpenTab[] = [];
    if (Array.isArray(parsed.tabs)) {
      for (const t of parsed.tabs) {
        if (isValidOpenTab(t)) {
          if (isSetTab(t)) {
            tabs.push({
              type: 'set',
              id: t.id,
              name: t.name,
              imageUrl:
                typeof t.imageUrl === 'string' || t.imageUrl === null
                  ? t.imageUrl
                  : null,
              numParts: t.numParts,
              year: t.year,
              ...(typeof t.themeId === 'number' ? { themeId: t.themeId } : {}),
              ...(typeof t.themeName === 'string'
                ? { themeName: t.themeName }
                : {}),
            });
          } else {
            tabs.push({ type: 'landing', id: t.id });
          }
        }
      }
    }

    const tabStates: Record<string, TabViewState> = {};
    if (parsed.tabStates && typeof parsed.tabStates === 'object') {
      for (const [id, state] of Object.entries(parsed.tabStates)) {
        if (isValidTabViewState(state)) {
          tabStates[id] = {
            ...state,
            scrollTop: (state as TabViewState).scrollTop ?? 0,
          };
        }
      }
    }

    // Validate activeTabId is in tabs
    let activeTabId: string | null = null;
    if (
      typeof parsed.activeTabId === 'string' &&
      tabs.some(t => t.id.toLowerCase() === parsed.activeTabId?.toLowerCase())
    ) {
      activeTabId = parsed.activeTabId;
    } else if (tabs.length > 0) {
      activeTabId = tabs[0].id;
    }

    return { tabs, activeTabId, tabStates };
  } catch {
    return empty;
  }
}

function loadInitialState(): DataState {
  try {
    // Try v2 first
    const raw = readStorage(STORAGE_KEY);
    if (raw) return parsePersisted(raw);

    // Try migrating from v1
    const migrated = migrateV1ToV2();
    if (migrated) {
      return {
        tabs: migrated.tabs,
        activeTabId: migrated.activeTabId,
        tabStates: migrated.tabStates,
      };
    }

    return {
      tabs: [],
      activeTabId: null,
      tabStates: {},
    };
  } catch {
    return {
      tabs: [],
      activeTabId: null,
      tabStates: {},
    };
  }
}

function persistState(state: OpenTabsState): void {
  try {
    const payload: PersistedShape = {
      tabs: state.tabs,
      activeTabId: state.activeTabId,
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

  openTab: (tab: SetTab) => {
    const { tabs, tabStates } = get();
    const normalizedId = tab.id.toLowerCase();

    // Check if a set tab with same id already exists
    const existingIndex = tabs.findIndex(
      t => isSetTab(t) && t.id.toLowerCase() === normalizedId
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
    if (!nextTabStates[tab.id]) {
      nextTabStates[tab.id] = createDefaultTabViewState();
    }

    const nextState: OpenTabsState = {
      ...get(),
      tabs: nextTabs,
      activeTabId: tab.id,
      tabStates: nextTabStates,
    };
    set(nextState);
    persistState(nextState);
  },

  closeTab: (id: string) => {
    const { tabs, activeTabId, tabStates } = get();
    const normalizedId = id.toLowerCase();

    const tabIndex = tabs.findIndex(t => t.id.toLowerCase() === normalizedId);
    if (tabIndex < 0) return;

    const nextTabs = tabs.filter((_, i) => i !== tabIndex);

    // Clean up tab state
    const nextTabStates = { ...tabStates };
    delete nextTabStates[id];

    // Determine new active tab if closing the active one
    let nextActiveTabId = activeTabId;
    if (activeTabId?.toLowerCase() === normalizedId) {
      if (nextTabs.length === 0) {
        nextActiveTabId = null;
      } else if (tabIndex >= nextTabs.length) {
        // Was last tab, go to new last
        nextActiveTabId = nextTabs[nextTabs.length - 1].id;
      } else {
        // Go to tab at same index (which is now the next tab)
        nextActiveTabId = nextTabs[tabIndex].id;
      }
    }

    const nextState: OpenTabsState = {
      ...get(),
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
      tabStates: nextTabStates,
    };
    set(nextState);
    persistState(nextState);
  },

  setActiveTab: (id: string) => {
    const { tabs } = get();
    const normalizedId = id.toLowerCase();

    // Verify tab exists
    const exists = tabs.some(t => t.id.toLowerCase() === normalizedId);
    if (!exists) return;

    const nextState: OpenTabsState = {
      ...get(),
      activeTabId: id,
    };
    set(nextState);
    persistState(nextState);
  },

  openLandingTab: () => {
    const { tabs } = get();
    const landing = createLandingTab();
    const nextTabs = [...tabs, landing].slice(-MAX_TABS);

    const nextState: OpenTabsState = {
      ...get(),
      tabs: nextTabs,
      activeTabId: landing.id,
    };
    set(nextState);
    persistState(nextState);
  },

  replaceLandingWithSet: (landingTabId: string, setTab: SetTab) => {
    const { tabs, tabStates } = get();

    // Check if a set tab with same id already exists
    const existingSetIndex = tabs.findIndex(
      t => isSetTab(t) && t.id.toLowerCase() === setTab.id.toLowerCase()
    );

    let nextTabs: OpenTab[];
    if (existingSetIndex >= 0) {
      // Set tab already open — just remove the landing tab and activate the existing set tab
      nextTabs = tabs
        .filter(t => t.id !== landingTabId)
        .map(t =>
          isSetTab(t) && t.id.toLowerCase() === setTab.id.toLowerCase()
            ? { ...t, ...setTab }
            : t
        );
    } else {
      // Replace landing tab in-place with the set tab
      nextTabs = tabs.map(t => (t.id === landingTabId ? setTab : t));
    }

    // Initialize tab state if not exists
    const nextTabStates = { ...tabStates };
    if (!nextTabStates[setTab.id]) {
      nextTabStates[setTab.id] = createDefaultTabViewState();
    }
    // Clean up landing tab state if any
    delete nextTabStates[landingTabId];

    const nextState: OpenTabsState = {
      ...get(),
      tabs: nextTabs,
      activeTabId: setTab.id,
      tabStates: nextTabStates,
    };
    set(nextState);
    persistState(nextState);
  },

  saveTabState: (id: string, state: Partial<TabViewState>) => {
    const { tabStates } = get();
    const existing = tabStates[id] ?? createDefaultTabViewState();

    const nextTabStates = {
      ...tabStates,
      [id]: {
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

  getTabState: (id: string) => {
    return get().tabStates[id];
  },

  getActiveTab: () => {
    const { tabs, activeTabId } = get();
    if (!activeTabId) return undefined;
    return tabs.find(t => t.id.toLowerCase() === activeTabId.toLowerCase());
  },
}));

// ---------------------------------------------------------------------------
// Cross-tab sync
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = parsePersisted(event.newValue);
    // Sync tabs list and view states, but NOT activeTabId.
    // Each browser tab maintains its own active set independently
    // to prevent infinite switching loops when multiple tabs are open.
    useOpenTabsStore.setState(state => {
      // If current active tab was closed in another browser tab, pick a new one
      const activeStillExists = next.tabs.some(
        t => t.id.toLowerCase() === state.activeTabId?.toLowerCase()
      );
      const nextActiveTabId = activeStillExists
        ? state.activeTabId
        : next.tabs.length > 0
          ? next.tabs[0].id
          : null;

      return {
        ...state,
        tabs: next.tabs,
        activeTabId: nextActiveTabId,
        tabStates: next.tabStates,
      };
    });
  });
}
