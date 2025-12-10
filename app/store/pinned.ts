'use client';

import { readStorage, writeStorage } from '@/app/lib/persistence/storage';
import { create } from 'zustand';

export type PinnedMeta = {
  setNumber: string;
  setName?: string;
};

type PinnedState = {
  pinned: Record<string, Record<string, true>>; // setNumber -> { pieceKey: true }
  meta: Record<string, PinnedMeta>;
  autoUnpin: boolean;
  showOtherSets: boolean;
  togglePinned: (args: {
    setNumber: string;
    key: string;
    setName?: string;
  }) => void;
  setPinned: (
    setNumber: string,
    key: string,
    value: boolean,
    setName?: string
  ) => void;
  isPinned: (setNumber: string, key: string) => boolean;
  getPinnedKeysForSet: (setNumber: string) => string[];
  getPinnedSets: () => string[];
  getMetaForSet: (setNumber: string) => PinnedMeta | undefined;
  setAutoUnpin: (value: boolean) => void;
  setShowOtherSets: (value: boolean) => void;
};

const STORAGE_KEY = 'brick_party_pinned_v1';

type PersistedShape = {
  pinned: Record<string, string[]>; // setNumber -> piece keys
  meta: Record<string, PinnedMeta>;
  autoUnpin: boolean;
  showOtherSets: boolean;
};

type PersistedSubset = Pick<
  PinnedState,
  'pinned' | 'meta' | 'autoUnpin' | 'showOtherSets'
>;

function createEmptyPersistedState(): PersistedSubset {
  return {
    pinned: {},
    meta: {},
    autoUnpin: false,
    showOtherSets: false,
  };
}

function parsePersisted(raw: string | null): PersistedSubset {
  if (!raw) {
    return createEmptyPersistedState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;

    const pinned: Record<string, Record<string, true>> = {};
    if (parsed.pinned && typeof parsed.pinned === 'object') {
      for (const [setNumber, keys] of Object.entries(parsed.pinned)) {
        if (!Array.isArray(keys)) continue;
        const map: Record<string, true> = {};
        for (const key of keys) {
          if (typeof key === 'string' && key.length > 0) {
            map[key] = true;
          }
        }
        if (Object.keys(map).length > 0) {
          pinned[setNumber] = map;
        }
      }
    }

    const meta: Record<string, PinnedMeta> = {};
    if (parsed.meta && typeof parsed.meta === 'object') {
      for (const [setNumber, value] of Object.entries(parsed.meta)) {
        if (!value || typeof value !== 'object') continue;
        const m = value as Partial<PinnedMeta>;
        if (!m.setNumber || typeof m.setNumber !== 'string') continue;
        const entry: PinnedMeta = { setNumber: m.setNumber };
        if (typeof m.setName === 'string' && m.setName.length > 0) {
          entry.setName = m.setName;
        }
        meta[setNumber] = entry;
      }
    }

    const autoUnpin =
      typeof parsed.autoUnpin === 'boolean' ? parsed.autoUnpin : false;
    const showOtherSets =
      typeof parsed.showOtherSets === 'boolean' ? parsed.showOtherSets : false;

    return {
      pinned,
      meta,
      autoUnpin,
      showOtherSets,
    };
  } catch {
    return createEmptyPersistedState();
  }
}

function loadInitialState(): Pick<
  PinnedState,
  'pinned' | 'meta' | 'autoUnpin' | 'showOtherSets'
> {
  try {
    const raw = readStorage(STORAGE_KEY);
    return parsePersisted(raw);
  } catch {
    return createEmptyPersistedState();
  }
}

function persistState(state: PinnedState): void {
  try {
    const payload: PersistedShape = {
      pinned: {},
      meta: state.meta,
      autoUnpin: state.autoUnpin,
      showOtherSets: state.showOtherSets,
    };

    for (const [setNumber, keysMap] of Object.entries(state.pinned)) {
      const keys = Object.keys(keysMap);
      if (keys.length > 0) {
        payload.pinned[setNumber] = keys;
      }
    }

    writeStorage(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore persistence errors
  }
}

export const usePinnedStore = create<PinnedState>((set, get) => ({
  ...loadInitialState(),
  togglePinned: ({ setNumber, key, setName }) => {
    const { pinned, meta } = get();
    const existingForSet = pinned[setNumber] ?? {};
    const isCurrentlyPinned = !!existingForSet[key];

    const nextForSet = { ...existingForSet };
    if (isCurrentlyPinned) {
      delete nextForSet[key];
    } else {
      nextForSet[key] = true;
    }

    const nextPinned = { ...pinned };
    if (Object.keys(nextForSet).length === 0) {
      delete nextPinned[setNumber];
    } else {
      nextPinned[setNumber] = nextForSet;
    }

    const nextMeta: Record<string, PinnedMeta> = { ...meta };
    if (!isCurrentlyPinned) {
      // only update meta when pinning, not when unpinning
      const resolvedName = setName ?? meta[setNumber]?.setName;
      nextMeta[setNumber] =
        resolvedName && resolvedName.length > 0
          ? { setNumber, setName: resolvedName }
          : { setNumber };
    } else if (!nextPinned[setNumber]) {
      // clean up meta when no pins remain for this set
      delete nextMeta[setNumber];
    }

    const nextState: PinnedState = {
      ...get(),
      pinned: nextPinned,
      meta: nextMeta,
    };
    set(nextState);
    persistState(nextState);
  },
  setPinned: (setNumber, key, value, setName) => {
    const { pinned, meta } = get();
    const existingForSet = pinned[setNumber] ?? {};
    const nextForSet = { ...existingForSet };

    if (value) {
      nextForSet[key] = true;
    } else {
      delete nextForSet[key];
    }

    const nextPinned = { ...pinned };
    if (Object.keys(nextForSet).length === 0) {
      delete nextPinned[setNumber];
    } else {
      nextPinned[setNumber] = nextForSet;
    }

    const nextMeta: Record<string, PinnedMeta> = { ...meta };
    if (value) {
      const resolvedName = setName ?? meta[setNumber]?.setName;
      nextMeta[setNumber] =
        resolvedName && resolvedName.length > 0
          ? { setNumber, setName: resolvedName }
          : { setNumber };
    } else if (!nextPinned[setNumber]) {
      delete nextMeta[setNumber];
    }

    const nextState: PinnedState = {
      ...get(),
      pinned: nextPinned,
      meta: nextMeta,
    };
    set(nextState);
    persistState(nextState);
  },
  isPinned: (setNumber, key) => {
    const map = get().pinned[setNumber];
    return !!map && !!map[key];
  },
  getPinnedKeysForSet: (setNumber: string) => {
    const map = get().pinned[setNumber];
    return map ? Object.keys(map) : [];
  },
  getPinnedSets: () => {
    return Object.keys(get().pinned);
  },
  getMetaForSet: (setNumber: string) => {
    return get().meta[setNumber];
  },
  setAutoUnpin: (value: boolean) => {
    const nextState: PinnedState = {
      ...get(),
      autoUnpin: value,
    };
    set(nextState);
    persistState(nextState);
  },
  setShowOtherSets: (value: boolean) => {
    const nextState: PinnedState = {
      ...get(),
      showOtherSets: value,
    };
    set(nextState);
    persistState(nextState);
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = parsePersisted(event.newValue);
    usePinnedStore.setState(state => ({
      ...state,
      pinned: next.pinned,
      meta: next.meta,
      autoUnpin: next.autoUnpin,
      showOtherSets: next.showOtherSets,
    }));
  });
}
