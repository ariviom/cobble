'use client';

import { create } from 'zustand';
import {
  ALL_ITEM_IDS,
  PARENT_COMPLETION_MAP,
  TOP_LEVEL_IDS,
  type TourItemId,
} from '@/app/components/onboarding/tourConfig';

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

function readStorage(userId?: string): LocalState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(persistKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(state: LocalState, userId?: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(persistKey(userId), JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

type OnboardingState = {
  completedSteps: string[];
  dismissed: boolean;
  collapsed: boolean;
  _userId: string | undefined;

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
    writeStorage(
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
    writeStorage({ completedSteps, dismissed: true, collapsed }, _userId);
  },

  reEnable: () => {
    const { _userId, completedSteps } = get();
    set({ dismissed: false, collapsed: false });
    writeStorage(
      { completedSteps, dismissed: false, collapsed: false },
      _userId
    );
  },

  collapse: () => {
    const { _userId, completedSteps, dismissed } = get();
    set({ collapsed: true });
    writeStorage({ completedSteps, dismissed, collapsed: true }, _userId);
  },
  expand: () => {
    const { _userId, completedSteps, dismissed } = get();
    set({ collapsed: false });
    writeStorage({ completedSteps, dismissed, collapsed: false }, _userId);
  },

  hydrate: (userId?: string) => {
    const stored = readStorage(userId);
    if (stored) {
      set({
        completedSteps: stored.completedSteps,
        dismissed: stored.dismissed,
        collapsed: stored.collapsed ?? false,
        _userId: userId,
      });
    } else {
      set({ _userId: userId });
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
    writeStorage(
      { completedSteps: merged, dismissed, collapsed: get().collapsed },
      _userId
    );
  },
}));
