'use client';

import { readStorage, writeStorage } from '@/app/lib/persistence/storage';
import { create } from 'zustand';

export type SetStatusKey = 'owned' | 'wantToBuild';

export type SetStatus = {
  owned: boolean;
  wantToBuild: boolean;
};

export const EMPTY_SET_STATUS: SetStatus = {
  owned: false,
  wantToBuild: false,
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
};

type UserSetsState = {
  /**
   * Map of setNumber (case-insensitive key) to stored user-set entry.
   * Keys are normalized to lower-case to avoid duplicates.
   */
  sets: Record<string, UserSet>;
  /**
   * Set or unset a specific status flag for a set.
   * When all status flags become false, the set is removed from the store.
   */
  setStatus: (args: {
    meta?: UserSetMeta;
    setNumber: string;
    key: SetStatusKey;
    value: boolean;
  }) => void;
  /**
   * Clear all statuses for a given set, removing it from the store.
   */
  clearAllStatusesForSet: (setNumber: string) => void;
};

const STORAGE_KEY = 'quarry_user_sets_v1';

type PersistedUserSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  status: SetStatus;
  lastUpdatedAt: number;
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
  const obj = (raw ?? {}) as Partial<SetStatus> & { canBuild?: boolean };
  const owned = !!obj.owned;
  let wantToBuild = !!obj.wantToBuild || !!obj.canBuild;

  // Enforce mutual exclusivity when hydrating persisted state.
  if (owned) {
    wantToBuild = false;
  }

  return { owned, wantToBuild };
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
        const status = coerceStatus(v.status);

        // Drop entries that have no active status flags.
        if (!status.owned && !status.wantToBuild) {
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
  setStatus: ({ meta, setNumber, key, value }) => {
    const normKey = normalizeKey(setNumber);
    set(prevState => {
      const prevEntry = prevState.sets[normKey];
      let nextStatus: SetStatus;
      if (value) {
        // Turning a status "on" makes it the sole active status.
        nextStatus = {
          owned: false,
          wantToBuild: false,
          [key]: true,
        } as SetStatus;
      } else {
        // Turning a status "off" clears all flags, leaving the set untracked.
        nextStatus = {
          owned: false,
          wantToBuild: false,
        };
      }

      // If all flags are false, remove the entry entirely.
      if (!nextStatus.owned && !nextStatus.wantToBuild) {
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
            : prevEntry?.imageUrl ?? null,
        numParts:
          typeof meta?.numParts === 'number'
            ? meta.numParts
            : typeof prevEntry?.numParts === 'number'
              ? prevEntry.numParts
              : 0,
        themeId:
          typeof meta?.themeId === 'number'
            ? meta.themeId
            : prevEntry?.themeId ?? null,
      };

      const nextEntry: UserSet = {
        ...baseMeta,
        status: nextStatus,
        lastUpdatedAt: Date.now(),
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


