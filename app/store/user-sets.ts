'use client';

import { readStorage, writeStorage } from '@/app/lib/persistence/storage';
import { create } from 'zustand';

export type SetStatus = {
  owned: boolean;
};

export const EMPTY_SET_STATUS: SetStatus = {
  owned: false,
};

export type UserSetMeta = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
};

export type UserSet = UserSetMeta & {
  status: SetStatus;
  lastUpdatedAt: number;
  foundCount: number;
};

export type HydratedSetInput = {
  setNumber: string;
  name?: string;
  year?: number;
  imageUrl?: string | null;
  numParts?: number;
  themeId?: number | null;
  status: SetStatus;
  updatedAt?: number;
  foundCount?: number;
};

type UserSetsState = {
  /**
   * Map of setNumber (case-insensitive key) to stored user-set entry.
   * Keys are normalized to lower-case to avoid duplicates.
   */
  sets: Record<string, UserSet>;
  /**
   * Set or unset the owned flag for a set.
   * When owned becomes false, the set is removed from the store.
   */
  setOwned: (args: {
    meta?: UserSetMeta;
    setNumber: string;
    owned: boolean;
  }) => void;
  /**
   * Clear all statuses for a given set, removing it from the store.
   */
  clearAllStatusesForSet: (setNumber: string) => void;
  /**
   * Merge a batch of Supabase-hydrated sets into the local store.
   */
  hydrateFromSupabase: (entries: HydratedSetInput[]) => void;
};

const STORAGE_KEY = 'brick_party_user_sets_v1';

type PersistedUserSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  status: SetStatus;
  lastUpdatedAt: number;
  foundCount: number;
};

type PersistedShape = {
  sets: Record<string, PersistedUserSet>;
};

function createEmptyState(): Pick<UserSetsState, 'sets'> {
  return { sets: {} };
}

function normalizeKey(setNumber: string): string {
  return setNumber.trim().toLowerCase();
}

function coerceStatus(raw: unknown): SetStatus {
  // Handle legacy format with wantToBuild or canBuild
  const obj = (raw ?? {}) as Partial<SetStatus> & {
    wantToBuild?: boolean;
    canBuild?: boolean;
  };
  // Legacy wantToBuild/canBuild values are ignored in the new model
  // Sets on wishlist are now tracked via user_list_items
  return { owned: !!obj.owned };
}

function parsePersisted(raw: string | null): Pick<UserSetsState, 'sets'> {
  if (!raw) return createEmptyState();
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedShape>;
    const sets: Record<string, UserSet> = {};

    if (parsed && parsed.sets && typeof parsed.sets === 'object') {
      for (const value of Object.values(parsed.sets)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Partial<PersistedUserSet>;
        if (
          !v.setNumber ||
          typeof v.setNumber !== 'string' ||
          !v.name ||
          typeof v.name !== 'string'
        ) {
          continue;
        }
        const setNumber = v.setNumber;
        const normKey = normalizeKey(setNumber);
        const year =
          typeof v.year === 'number' && Number.isFinite(v.year) ? v.year : 0;
        const numParts =
          typeof v.numParts === 'number' && Number.isFinite(v.numParts)
            ? v.numParts
            : 0;
        const imageUrl =
          typeof v.imageUrl === 'string' || v.imageUrl === null
            ? v.imageUrl
            : null;
        const themeId =
          typeof v.themeId === 'number' && Number.isFinite(v.themeId)
            ? v.themeId
            : null;
        const lastUpdatedAt =
          typeof v.lastUpdatedAt === 'number' &&
          Number.isFinite(v.lastUpdatedAt)
            ? v.lastUpdatedAt
            : 0;
        const foundCount =
          typeof v.foundCount === 'number' && Number.isFinite(v.foundCount)
            ? v.foundCount
            : 0;
        const status = coerceStatus(v.status);

        // Drop entries that are not owned.
        if (!status.owned) {
          continue;
        }

        sets[normKey] = {
          setNumber,
          name: v.name,
          year,
          imageUrl,
          numParts,
          themeId,
          status,
          lastUpdatedAt,
          foundCount,
        };
      }
    }

    return { sets };
  } catch {
    return createEmptyState();
  }
}

function persistState(state: UserSetsState): void {
  try {
    const payload: PersistedShape = { sets: {} };
    for (const [key, value] of Object.entries(state.sets)) {
      const entry: PersistedUserSet = {
        setNumber: value.setNumber,
        name: value.name,
        year: value.year,
        imageUrl: value.imageUrl,
        numParts: value.numParts,
        themeId: value.themeId,
        status: value.status,
        lastUpdatedAt: value.lastUpdatedAt,
        foundCount: value.foundCount,
      };
      payload.sets[key] = entry;
    }
    writeStorage(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore persistence errors
  }
}

function loadInitialState(): Pick<UserSetsState, 'sets'> {
  try {
    const raw = readStorage(STORAGE_KEY);
    return parsePersisted(raw);
  } catch {
    return createEmptyState();
  }
}

export const useUserSetsStore = create<UserSetsState>(set => ({
  ...loadInitialState(),
  setOwned: ({ meta, setNumber, owned }) => {
    const normKey = normalizeKey(setNumber);
    set(prevState => {
      const prevEntry = prevState.sets[normKey];

      // If not owned, remove the entry entirely.
      if (!owned) {
        const nextSets = { ...prevState.sets };
        delete nextSets[normKey];
        const nextState: UserSetsState = {
          ...prevState,
          sets: nextSets,
        };
        persistState(nextState);
        return nextState;
      }

      const baseMeta: UserSetMeta = {
        setNumber: prevEntry?.setNumber ?? meta?.setNumber ?? setNumber,
        name: meta?.name ?? prevEntry?.name ?? setNumber,
        year:
          typeof meta?.year === 'number'
            ? meta.year
            : typeof prevEntry?.year === 'number'
              ? prevEntry.year
              : 0,
        imageUrl:
          typeof meta?.imageUrl === 'string' || meta?.imageUrl === null
            ? meta.imageUrl
            : (prevEntry?.imageUrl ?? null),
        numParts:
          typeof meta?.numParts === 'number'
            ? meta.numParts
            : typeof prevEntry?.numParts === 'number'
              ? prevEntry.numParts
              : 0,
        themeId:
          typeof meta?.themeId === 'number'
            ? meta.themeId
            : (prevEntry?.themeId ?? null),
      };

      const nextEntry: UserSet = {
        ...baseMeta,
        status: { owned: true },
        lastUpdatedAt: Date.now(),
        foundCount: prevEntry?.foundCount ?? 0,
      };

      const nextSets: Record<string, UserSet> = {
        ...prevState.sets,
        [normKey]: nextEntry,
      };

      const nextState: UserSetsState = {
        ...prevState,
        sets: nextSets,
      };
      persistState(nextState);
      return nextState;
    });
  },
  clearAllStatusesForSet: (setNumber: string) => {
    const normKey = normalizeKey(setNumber);
    set(prevState => {
      const nextSets = { ...prevState.sets };
      delete nextSets[normKey];
      const nextState: UserSetsState = {
        ...prevState,
        sets: nextSets,
      };
      persistState(nextState);
      return nextState;
    });
  },
  hydrateFromSupabase: (entries: HydratedSetInput[]) => {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }
    set(prevState => {
      let mutated = false;
      const nextSets = { ...prevState.sets };

      for (const entry of entries) {
        if (!entry || typeof entry.setNumber !== 'string') {
          continue;
        }
        const normKey = normalizeKey(entry.setNumber);
        const existing = nextSets[normKey];
        const incomingUpdatedAt =
          typeof entry.updatedAt === 'number' &&
          Number.isFinite(entry.updatedAt)
            ? entry.updatedAt
            : Date.now();

        const shouldUpdate =
          !existing || incomingUpdatedAt >= (existing.lastUpdatedAt ?? 0);

        if (!shouldUpdate) continue;

        nextSets[normKey] = {
          setNumber: entry.setNumber,
          name: entry.name ?? existing?.name ?? entry.setNumber,
          year:
            typeof entry.year === 'number' ? entry.year : (existing?.year ?? 0),
          imageUrl:
            typeof entry.imageUrl === 'string'
              ? entry.imageUrl
              : (existing?.imageUrl ?? null),
          numParts:
            typeof entry.numParts === 'number'
              ? entry.numParts
              : (existing?.numParts ?? 0),
          themeId:
            typeof entry.themeId === 'number'
              ? entry.themeId
              : (existing?.themeId ?? null),
          status: entry.status ?? existing?.status ?? EMPTY_SET_STATUS,
          lastUpdatedAt: incomingUpdatedAt,
          foundCount:
            typeof entry.foundCount === 'number'
              ? entry.foundCount
              : (existing?.foundCount ?? 0),
        };
        mutated = true;
      }

      if (!mutated) {
        return prevState;
      }

      const nextState: UserSetsState = {
        ...prevState,
        sets: nextSets,
      };
      persistState(nextState);
      return nextState;
    });
  },
}));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    const next = parsePersisted(event.newValue);
    useUserSetsStore.setState(state => ({
      ...state,
      sets: next.sets,
    }));
  });
}
