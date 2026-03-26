'use client';

import { create } from 'zustand';
import {
  ALL_ITEM_IDS,
  PARENT_COMPLETION_MAP,
  TOP_LEVEL_IDS,
  type TourItemId,
} from '@/app/components/onboarding/tourConfig';
import {
  readStorage as readStorageRaw,
  writeStorage as writeStorageRaw,
} from '@/app/lib/persistence/storage';

const STORAGE_KEY = 'onboarding:progress';

type PersistedState = {
  completedSteps: string[];
  dismissed: boolean;
};

/** localStorage includes collapsed; Supabase does not */
type LocalState = PersistedState & { collapsed?: boolean };

function persistKey(userId?: string): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function readOnboardingState(userId?: string): LocalState | null {
  const raw = readStorageRaw(persistKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeOnboardingState(state: LocalState, userId?: string): void {
  writeStorageRaw(persistKey(userId), JSON.stringify(state));
}

type OnboardingState = {
  completedSteps: string[];
  dismissed: boolean;
  collapsed: boolean;
  _userId: string | undefined;
  /** True once hydrate() has been called (localStorage read complete) */
  _hydrated: boolean;

  complete: (id: TourItemId) => void;
  dismiss: () => void;
  reEnable: () => void;
  collapse: () => void;
  expand: () => void;
  hydrate: (userId?: string) => void;
  isComplete: () => boolean;
  progress: () => { completed: number; total: number };
  /** Replace state from Supabase (source of truth for auth users) */
  mergeFromRemote: (remote: PersistedState) => void;
};

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  completedSteps: [],
  dismissed: false,
  collapsed: false,
  _userId: undefined,
  _hydrated: false,

  complete: (id: TourItemId) => {
    const { completedSteps, _userId } = get();
    if (completedSteps.includes(id)) return;

    const next = [...completedSteps, id];

    // Auto-complete parent if this subtask is the trigger
    for (const [parentId, triggerId] of Object.entries(PARENT_COMPLETION_MAP)) {
      if (id === triggerId && !next.includes(parentId)) {
        next.push(parentId as TourItemId);
      }
    }

    set({ completedSteps: next });
    writeOnboardingState(
      {
        completedSteps: next,
        dismissed: get().dismissed,
        collapsed: get().collapsed,
      },
      _userId
    );
  },

  dismiss: () => {
    const { _userId, completedSteps, collapsed } = get();
    set({ dismissed: true });
    writeOnboardingState(
      { completedSteps, dismissed: true, collapsed },
      _userId
    );
  },

  reEnable: () => {
    const { _userId, completedSteps } = get();
    set({ dismissed: false, collapsed: false });
    writeOnboardingState(
      { completedSteps, dismissed: false, collapsed: false },
      _userId
    );
  },

  collapse: () => {
    const { _userId, completedSteps, dismissed } = get();
    set({ collapsed: true });
    writeOnboardingState(
      { completedSteps, dismissed, collapsed: true },
      _userId
    );
  },
  expand: () => {
    const { _userId, completedSteps, dismissed } = get();
    set({ collapsed: false });
    writeOnboardingState(
      { completedSteps, dismissed, collapsed: false },
      _userId
    );
  },

  hydrate: (userId?: string) => {
    const stored = readOnboardingState(userId);
    if (stored) {
      set({
        completedSteps: stored.completedSteps,
        dismissed: stored.dismissed,
        collapsed: stored.collapsed ?? false,
        _userId: userId,
        _hydrated: true,
      });
    } else {
      // For new authenticated users with no prior stored state,
      // reset any anonymous dismissal so the tour appears fresh.
      set({
        _userId: userId,
        _hydrated: true,
        ...(userId ? { dismissed: false, collapsed: false } : {}),
      });
    }
  },

  isComplete: () => {
    const { completedSteps } = get();
    return TOP_LEVEL_IDS.every(id => completedSteps.includes(id));
  },

  progress: () => {
    const { completedSteps } = get();
    const completed = TOP_LEVEL_IDS.filter(id =>
      completedSteps.includes(id)
    ).length;
    return { completed, total: TOP_LEVEL_IDS.length };
  },

  mergeFromRemote: (remote: PersistedState) => {
    const { completedSteps: local, dismissed: localDismissed, _userId } = get();
    // Validate remote steps against known IDs
    const validRemote = remote.completedSteps.filter(s =>
      (ALL_ITEM_IDS as string[]).includes(s)
    );
    // Union of local and remote completed steps
    const merged = [...new Set([...local, ...validRemote])];
    // OR so a local dismiss isn't overwritten by a stale remote value
    const dismissed = localDismissed || remote.dismissed;
    set({ completedSteps: merged, dismissed });
    writeOnboardingState(
      { completedSteps: merged, dismissed, collapsed: get().collapsed },
      _userId
    );
  },
}));
