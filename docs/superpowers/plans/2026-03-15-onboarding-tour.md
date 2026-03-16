# Onboarding Tour Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Stripe-style checklist tour that guides users through Brick Party's key features, with a sign-up prompt for anonymous users and an interactive checklist for authenticated users.

**Architecture:** Zustand store with localStorage persistence + Supabase sync via `user_preferences.settings` JSONB. Tour UI is a fixed-position card rendered from root layout. Completion is automatic via one-liner hooks in existing code paths.

**Tech Stack:** React, Zustand, Supabase, TanStack Query, Tailwind CSS v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-15-onboarding-tour-design.md`

---

## Chunk 1: Data Layer

### Task 1: Tour Configuration

**Files:**

- Create: `app/components/onboarding/tourConfig.ts`

- [ ] **Step 1: Create the tour config file**

```ts
export type TourItemId =
  | 'search_set'
  | 'add_set'
  | 'identify_part'
  | 'mark_piece'
  | 'mark_piece_select'
  | 'mark_piece_filter_color'
  | 'mark_piece_group_category'
  | 'start_search_party'
  | 'review_settings';

export type TourItem = {
  id: TourItemId;
  label: string;
  subtext: string;
  route: string;
  routeLabel: string;
  requiresAuth: boolean;
  subtasks?: TourItem[];
  /** For mark_piece: use recent set route if available */
  dynamicRoute?: boolean;
};

export const TOUR_ITEMS: TourItem[] = [
  {
    id: 'search_set',
    label: 'Search for a set',
    subtext: 'Find sets by name or number',
    route: '/search',
    routeLabel: 'Go to Search',
    requiresAuth: false,
  },
  {
    id: 'add_set',
    label: 'Add a set to your collection',
    subtext: 'Mark a set as owned',
    route: '/sets',
    routeLabel: 'Go to Sets',
    requiresAuth: true,
  },
  {
    id: 'identify_part',
    label: 'Identify a part',
    subtext: 'Snap a photo to identify a piece',
    route: '/identify',
    routeLabel: 'Go to Identify',
    requiresAuth: true,
  },
  {
    id: 'mark_piece',
    label: 'Mark a piece found',
    subtext: 'Track your progress on a set',
    route: '/search',
    routeLabel: 'Go to Search',
    requiresAuth: true,
    dynamicRoute: true,
    subtasks: [
      {
        id: 'mark_piece_select',
        label: 'Select a part found',
        subtext: 'Tap a part to mark it found',
        route: '',
        routeLabel: '',
        requiresAuth: true,
      },
      {
        id: 'mark_piece_filter_color',
        label: 'Filter by color',
        subtext: 'Narrow parts by color',
        route: '',
        routeLabel: '',
        requiresAuth: true,
      },
      {
        id: 'mark_piece_group_category',
        label: 'Group by category',
        subtext: 'Organize parts by category',
        route: '',
        routeLabel: '',
        requiresAuth: true,
      },
    ],
  },
  {
    id: 'start_search_party',
    label: 'Start a Search Party',
    subtext: 'Search for pieces with friends',
    route: '/sets',
    routeLabel: 'Go to Sets',
    requiresAuth: true,
  },
  {
    id: 'review_settings',
    label: 'Review account settings',
    subtext: 'Customize your experience',
    route: '/account',
    routeLabel: 'Go to Account',
    requiresAuth: true,
  },
];

/** Top-level item IDs only (not subtasks) */
export const TOP_LEVEL_IDS: TourItemId[] = TOUR_ITEMS.map(i => i.id);

/** All item IDs including subtasks */
export const ALL_ITEM_IDS: TourItemId[] = TOUR_ITEMS.flatMap(i => [
  i.id,
  ...(i.subtasks?.map(s => s.id) ?? []),
]);

/** Parent completes when this subtask is done */
export const PARENT_COMPLETION_MAP: Partial<Record<TourItemId, TourItemId>> = {
  mark_piece: 'mark_piece_select',
};
```

- [ ] **Step 2: Commit**

```bash
git add app/components/onboarding/tourConfig.ts
git commit -m "feat(onboarding): add tour checklist configuration"
```

---

### Task 2: Onboarding Zustand Store

**Files:**

- Create: `app/store/onboarding.ts`
- Create: `app/store/__tests__/onboarding.test.ts`

- [ ] **Step 1: Write failing tests for the onboarding store**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage
const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, val),
  removeItem: (key: string) => storage.delete(key),
});

import { useOnboardingStore } from '../onboarding';

describe('onboarding store', () => {
  beforeEach(() => {
    storage.clear();
    useOnboardingStore.setState({
      completedSteps: [],
      dismissed: false,
      collapsed: false,
    });
  });

  it('starts with empty state', () => {
    const state = useOnboardingStore.getState();
    expect(state.completedSteps).toEqual([]);
    expect(state.dismissed).toBe(false);
    expect(state.collapsed).toBe(false);
  });

  it('completes a step', () => {
    useOnboardingStore.getState().complete('search_set');
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'search_set'
    );
  });

  it('does not duplicate completed steps', () => {
    useOnboardingStore.getState().complete('search_set');
    useOnboardingStore.getState().complete('search_set');
    const steps = useOnboardingStore.getState().completedSteps;
    expect(steps.filter(s => s === 'search_set')).toHaveLength(1);
  });

  it('auto-completes parent when trigger subtask completes', () => {
    useOnboardingStore.getState().complete('mark_piece_select');
    const steps = useOnboardingStore.getState().completedSteps;
    expect(steps).toContain('mark_piece_select');
    expect(steps).toContain('mark_piece');
  });

  it('dismisses the tour', () => {
    useOnboardingStore.getState().dismiss();
    expect(useOnboardingStore.getState().dismissed).toBe(true);
  });

  it('re-enables the tour', () => {
    useOnboardingStore.getState().dismiss();
    useOnboardingStore.getState().reEnable();
    expect(useOnboardingStore.getState().dismissed).toBe(false);
    expect(useOnboardingStore.getState().collapsed).toBe(false);
  });

  it('collapses and expands', () => {
    useOnboardingStore.getState().collapse();
    expect(useOnboardingStore.getState().collapsed).toBe(true);
    useOnboardingStore.getState().expand();
    expect(useOnboardingStore.getState().collapsed).toBe(false);
  });

  it('persists to localStorage on complete', () => {
    useOnboardingStore.getState().complete('search_set');
    const raw = storage.get('onboarding:progress');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.completedSteps).toContain('search_set');
  });

  it('hydrates from localStorage', () => {
    storage.set(
      'onboarding:progress',
      JSON.stringify({
        completedSteps: ['search_set', 'add_set'],
        dismissed: false,
      })
    );
    useOnboardingStore.getState().hydrate();
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'search_set'
    );
    expect(useOnboardingStore.getState().completedSteps).toContain('add_set');
  });

  it('hydrates per-user key when userId provided', () => {
    storage.set(
      'onboarding:progress:user-123',
      JSON.stringify({
        completedSteps: ['identify_part'],
        dismissed: false,
      })
    );
    useOnboardingStore.getState().hydrate('user-123');
    expect(useOnboardingStore.getState().completedSteps).toContain(
      'identify_part'
    );
  });

  it('computes isComplete when all top-level items are done', () => {
    const { complete } = useOnboardingStore.getState();
    complete('search_set');
    complete('add_set');
    complete('identify_part');
    complete('mark_piece_select'); // triggers mark_piece
    complete('start_search_party');
    complete('review_settings');
    expect(useOnboardingStore.getState().isComplete()).toBe(true);
  });

  it('computes progress fraction', () => {
    useOnboardingStore.getState().complete('search_set');
    const { completed, total } = useOnboardingStore.getState().progress();
    expect(completed).toBe(1);
    expect(total).toBe(6);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run app/store/__tests__/onboarding.test.ts`
Expected: FAIL — module `../onboarding` not found

- [ ] **Step 3: Implement the onboarding store**

```ts
import { create } from 'zustand';
import {
  PARENT_COMPLETION_MAP,
  TOP_LEVEL_IDS,
  type TourItemId,
} from '@/app/components/onboarding/tourConfig';

const STORAGE_KEY = 'onboarding:progress';

type PersistedState = {
  completedSteps: string[];
  dismissed: boolean;
};

function persistKey(userId?: string): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

function readStorage(userId?: string): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(persistKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(state: PersistedState, userId?: string): void {
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
        next.push(parentId);
      }
    }

    set({ completedSteps: next });
    writeStorage({ completedSteps: next, dismissed: get().dismissed }, _userId);
  },

  dismiss: () => {
    const { _userId, completedSteps } = get();
    set({ dismissed: true });
    writeStorage({ completedSteps, dismissed: true }, _userId);
  },

  reEnable: () => {
    const { _userId, completedSteps } = get();
    set({ dismissed: false, collapsed: false });
    writeStorage({ completedSteps, dismissed: false }, _userId);
  },

  collapse: () => set({ collapsed: true }),
  expand: () => set({ collapsed: false }),

  hydrate: (userId?: string) => {
    const stored = readStorage(userId);
    if (stored) {
      set({
        completedSteps: stored.completedSteps,
        dismissed: stored.dismissed,
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
    const { completedSteps: local, _userId } = get();
    // Union of local and remote completed steps
    const merged = [...new Set([...local, ...remote.completedSteps])];
    const dismissed = remote.dismissed;
    set({ completedSteps: merged, dismissed });
    writeStorage({ completedSteps: merged, dismissed }, _userId);
  },
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/store/__tests__/onboarding.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/store/onboarding.ts app/store/__tests__/onboarding.test.ts
git commit -m "feat(onboarding): add onboarding Zustand store with tests"
```

---

### Task 3: useOnboarding Hook

**Files:**

- Create: `app/hooks/useOnboarding.ts`

- [ ] **Step 1: Create the hook**

This hook wraps the store to provide a clean API for components and integration points.

```ts
'use client';

import { useOnboardingStore } from '@/app/store/onboarding';
import {
  TOUR_ITEMS,
  type TourItemId,
} from '@/app/components/onboarding/tourConfig';
import { getRecentSets } from '@/app/store/recent-sets';

export function useOnboarding() {
  const {
    completedSteps,
    dismissed,
    collapsed,
    complete,
    dismiss,
    reEnable,
    collapse,
    expand,
    isComplete,
    progress,
  } = useOnboardingStore();

  const isStepComplete = (id: TourItemId): boolean =>
    completedSteps.includes(id);

  /** Resolve dynamic route for mark_piece (recent set or /search fallback) */
  const resolveRoute = (item: (typeof TOUR_ITEMS)[number]): string => {
    if (!item.dynamicRoute) return item.route;
    const recent = getRecentSets();
    if (recent.length > 0) {
      return `/sets/${recent[0].setNumber}`;
    }
    return '/search';
  };

  /** Resolve route label for mark_piece edge case */
  const resolveRouteLabel = (item: (typeof TOUR_ITEMS)[number]): string => {
    if (!item.dynamicRoute) return item.routeLabel;
    const recent = getRecentSets();
    return recent.length > 0 ? `Go to ${recent[0].setNumber}` : 'Go to Search';
  };

  return {
    completedSteps,
    dismissed,
    collapsed,
    complete,
    dismiss,
    reEnable,
    collapse,
    expand,
    isComplete,
    progress,
    isStepComplete,
    resolveRoute,
    resolveRouteLabel,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add app/hooks/useOnboarding.ts
git commit -m "feat(onboarding): add useOnboarding hook"
```

---

### Task 4: Supabase Sync Hook

**Files:**

- Create: `app/hooks/useOnboardingSync.ts`

This hook handles hydration from Supabase on login and debounced writes back.

- [ ] **Step 1: Create the sync hook**

Reference the existing pattern in `app/lib/userPricingPreferences.ts` for reading/writing `user_preferences.settings`.

```ts
'use client';

import { useEffect, useRef } from 'react';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useOnboardingStore } from '@/app/store/onboarding';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';

type OnboardingSettings = {
  completedSteps: string[];
  dismissed: boolean;
};

async function readRemoteOnboarding(
  userId: string
): Promise<OnboardingSettings | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.settings) return null;

  const settings = data.settings as Record<string, unknown>;
  const onboarding = settings.onboarding as OnboardingSettings | undefined;
  return onboarding ?? null;
}

async function writeRemoteOnboarding(
  userId: string,
  onboarding: OnboardingSettings
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  // Read current settings to avoid overwriting other keys
  const { data } = await supabase
    .from('user_preferences')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();

  const existingSettings = (data?.settings as Record<string, unknown>) ?? {};
  const mergedSettings = { ...existingSettings, onboarding };

  await supabase.from('user_preferences').upsert(
    {
      user_id: userId,
      settings: mergedSettings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
}

export function useOnboardingSync() {
  const { user } = useSupabaseUser();
  const hasHydrated = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  // Hydrate from Supabase on first auth
  useEffect(() => {
    if (!user || hasHydrated.current) return;
    hasHydrated.current = true;

    const store = useOnboardingStore.getState();
    store.hydrate(user.id);

    readRemoteOnboarding(user.id).then(remote => {
      if (remote) {
        useOnboardingStore.getState().mergeFromRemote(remote);
      }
    });
  }, [user]);

  // Debounced write to Supabase on state changes
  useEffect(() => {
    if (!user) return;

    const unsub = useOnboardingStore.subscribe((state, prevState) => {
      if (
        state.completedSteps === prevState.completedSteps &&
        state.dismissed === prevState.dismissed
      ) {
        return;
      }

      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        writeRemoteOnboarding(user.id, {
          completedSteps: state.completedSteps,
          dismissed: state.dismissed,
        });
      }, 2000);
    });

    return () => {
      unsub();
      clearTimeout(debounceTimer.current);
    };
  }, [user]);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/hooks/useOnboardingSync.ts
git commit -m "feat(onboarding): add Supabase sync hook for onboarding state"
```

---

## Chunk 2: UI Components

### Task 5: TourSignupPrompt Component

**Files:**

- Create: `app/components/onboarding/TourSignupPrompt.tsx`

- [ ] **Step 1: Create the anonymous sign-up prompt**

```tsx
'use client';

import { Button } from '@/app/components/ui/Button';
import {
  getSupabaseBrowserClient,
  getAuthRedirectUrl,
} from '@/app/lib/supabaseClient';

type Props = {
  onDismiss: () => void;
};

export function TourSignupPrompt({ onDismiss }: Props) {
  const handleSignUp = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-lg font-bold text-foreground">Tour Brick Party</h3>
      <p className="text-sm text-foreground-muted">
        Create an account to get a guided tour of the app&apos;s features.
      </p>
      <Button variant="primary" onClick={handleSignUp}>
        Create account
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-xs text-foreground-muted hover:text-foreground"
      >
        Skip
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/onboarding/TourSignupPrompt.tsx
git commit -m "feat(onboarding): add anonymous sign-up prompt component"
```

---

### Task 6: TourChecklist Component

**Files:**

- Create: `app/components/onboarding/TourChecklist.tsx`

- [ ] **Step 1: Create the checklist component**

```tsx
'use client';

import { TOUR_ITEMS, type TourItem } from './tourConfig';
import { useOnboarding } from '@/app/hooks/useOnboarding';

type Props = {
  onItemClick: (item: TourItem) => void;
  onDismiss: () => void;
  onCollapse: () => void;
};

function ChecklistItem({
  item,
  isComplete,
  onClick,
  indent = false,
}: {
  item: TourItem;
  isComplete: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-foreground/5 ${indent ? 'pl-9' : ''} ${isComplete ? 'opacity-60' : ''}`}
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
        {isComplete ? (
          <svg
            className="h-5 w-5 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <span className="h-4 w-4 rounded-full border-2 border-foreground-muted" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span
          className={`text-sm font-medium ${isComplete ? 'text-foreground-muted line-through' : 'text-foreground'}`}
        >
          {item.label}
        </span>
        <p className="text-xs text-foreground-muted">{item.subtext}</p>
      </div>
    </button>
  );
}

export function TourChecklist({ onItemClick, onDismiss, onCollapse }: Props) {
  const { isStepComplete, progress } = useOnboarding();
  const { completed, total } = progress();

  return (
    <div className="flex flex-col gap-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-lg font-bold text-foreground">Tour Brick Party</h3>
        <button
          type="button"
          onClick={onCollapse}
          className="flex h-6 w-6 items-center justify-center rounded text-foreground-muted hover:text-foreground"
          aria-label="Minimize tour"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {TOUR_ITEMS.map(item => (
          <div key={item.id}>
            <ChecklistItem
              item={item}
              isComplete={isStepComplete(item.id)}
              onClick={() => onItemClick(item)}
            />
            {item.subtasks?.map(sub => (
              <ChecklistItem
                key={sub.id}
                item={sub}
                isComplete={isStepComplete(sub.id)}
                onClick={() => onItemClick(item)}
                indent
              />
            ))}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-theme-primary transition-all duration-300"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
        <span className="text-xs text-foreground-muted">
          {completed}/{total}
        </span>
      </div>

      {/* Dismiss link */}
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 self-start text-xs text-foreground-muted hover:text-foreground"
      >
        Skip tour
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/onboarding/TourChecklist.tsx
git commit -m "feat(onboarding): add tour checklist component"
```

---

### Task 7: TourItemModal Component

**Files:**

- Create: `app/components/onboarding/TourItemModal.tsx`

- [ ] **Step 1: Create the item modal**

Uses the existing `Modal` component from `app/components/ui/Modal.tsx`.

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Modal } from '@/app/components/ui/Modal';
import { Button } from '@/app/components/ui/Button';
import { useOnboarding } from '@/app/hooks/useOnboarding';
import type { TourItem } from './tourConfig';
import { getRecentSets } from '@/app/store/recent-sets';

type Props = {
  item: TourItem | null;
  open: boolean;
  onClose: () => void;
  videoUrl?: string;
};

export function TourItemModal({ item, open, onClose, videoUrl }: Props) {
  const router = useRouter();
  const { resolveRoute, resolveRouteLabel, collapse } = useOnboarding();

  if (!item) return null;

  const route = resolveRoute(item);
  const routeLabel = resolveRouteLabel(item);
  const needsSetFirst = item.dynamicRoute && getRecentSets().length === 0;

  const handleGo = () => {
    onClose();
    collapse();
    router.push(route);
  };

  return (
    <Modal open={open} title={item.label} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-foreground-muted">{item.subtext}</p>

        {needsSetFirst && (
          <p className="text-sm text-foreground-muted italic">
            Add a set first to mark pieces found.
          </p>
        )}

        {videoUrl && (
          <video
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
            className="w-full rounded-md"
          />
        )}

        <Button variant="primary" onClick={handleGo}>
          {routeLabel}
        </Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/onboarding/TourItemModal.tsx
git commit -m "feat(onboarding): add tour item modal component"
```

---

### Task 8: TourCard Container Component

**Files:**

- Create: `app/components/onboarding/TourCard.tsx`

- [ ] **Step 1: Create the main tour card container**

This component handles all states: anonymous (sign-up prompt), expanded checklist, collapsed bar, dismissed, and completed.

```tsx
'use client';

import { useState } from 'react';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useOnboarding } from '@/app/hooks/useOnboarding';
import { useOnboardingSync } from '@/app/hooks/useOnboardingSync';
import { TourSignupPrompt } from './TourSignupPrompt';
import { TourChecklist } from './TourChecklist';
import { TourItemModal } from './TourItemModal';
import type { TourItem } from './tourConfig';

export function TourCard() {
  const { user, isLoading } = useSupabaseUser();
  const {
    dismissed,
    collapsed,
    dismiss,
    collapse,
    expand,
    isComplete,
    progress,
  } = useOnboarding();

  // Activate Supabase sync
  useOnboardingSync();

  const [selectedItem, setSelectedItem] = useState<TourItem | null>(null);
  const [showDismissedNote, setShowDismissedNote] = useState(false);

  // Don't render during loading
  if (isLoading) return null;

  // Completed + dismissed = permanently hidden
  if (isComplete() && dismissed) return null;

  // Completed but not yet dismissed = show completion message
  if (isComplete()) {
    return (
      <TourCardShell>
        <div className="flex items-center justify-between p-4">
          <p className="text-sm font-medium text-foreground">
            You&apos;re all set!
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs text-foreground-muted hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      </TourCardShell>
    );
  }

  // Dismissed state — show note briefly, then hide
  if (dismissed && !showDismissedNote) return null;
  if (dismissed && showDismissedNote) {
    return (
      <TourCardShell>
        <div className="flex items-center justify-between p-4">
          <p className="text-xs text-foreground-muted">
            Re-enable the tour in Account Settings.
          </p>
          <button
            type="button"
            onClick={() => setShowDismissedNote(false)}
            className="text-xs text-foreground-muted hover:text-foreground"
          >
            Got it
          </button>
        </div>
      </TourCardShell>
    );
  }

  // Collapsed state
  if (collapsed) {
    const { completed, total } = progress();
    return (
      <TourCardShell>
        <button
          type="button"
          onClick={expand}
          className="flex w-full items-center justify-between p-3"
        >
          <span className="text-sm font-medium text-foreground">
            Tour Brick Party
          </span>
          <span className="text-xs text-foreground-muted">
            {completed}/{total} complete
          </span>
        </button>
      </TourCardShell>
    );
  }

  const handleDismiss = () => {
    dismiss();
    setShowDismissedNote(true);
  };

  // Anonymous state
  if (!user) {
    return (
      <TourCardShell>
        <TourSignupPrompt onDismiss={handleDismiss} />
      </TourCardShell>
    );
  }

  // Authenticated — full checklist
  return (
    <>
      <TourCardShell>
        <TourChecklist
          onItemClick={setSelectedItem}
          onDismiss={handleDismiss}
          onCollapse={collapse}
        />
      </TourCardShell>
      <TourItemModal
        item={selectedItem}
        open={selectedItem !== null}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
}

function TourCardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed right-0 bottom-[var(--spacing-nav-height)] left-0 z-70 border-t border-subtle bg-card shadow-lg lg:right-4 lg:bottom-4 lg:left-auto lg:w-96 lg:rounded-lg lg:border">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/onboarding/TourCard.tsx
git commit -m "feat(onboarding): add tour card container component"
```

---

## Chunk 3: Integration

### Task 9: Layout Integration

**Files:**

- Modify: `app/layout.tsx`

- [ ] **Step 1: Add TourCard to root layout**

Add the `<TourCard />` component inside `<ReactQueryProvider>`, after `<ErrorBoundary>`.

In `app/layout.tsx`, find:

```tsx
<ReactQueryProvider>
  <ErrorBoundary>{children}</ErrorBoundary>
</ReactQueryProvider>
```

Change to:

```tsx
<ReactQueryProvider>
  <ErrorBoundary>{children}</ErrorBoundary>
  <TourCard />
</ReactQueryProvider>
```

Add the import at top of file:

```tsx
import { TourCard } from '@/app/components/onboarding/TourCard';
```

Note: `TourCard` must be outside `<ErrorBoundary>` so it doesn't disappear if page content errors.

- [ ] **Step 2: Verify dev server renders without errors**

Open the app in a browser and verify the tour card appears (sign-up prompt for anonymous, checklist for authenticated).

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(onboarding): render tour card in root layout"
```

---

### Task 10: Completion Triggers

**Files:**

- Modify: `app/components/search/SearchResults.tsx`
- Modify: `app/store/user-sets.ts`
- Modify: `app/identify/IdentifyClient.tsx`
- Modify: `app/store/owned.ts`
- Modify: `app/components/set/InventoryControls.tsx`
- Modify: `app/hooks/useSearchPartyLifecycle.ts`
- Modify: `app/account/AccountPageClient.tsx`

Each integration is a one-liner. Add the import and call at the appropriate trigger point.

- [ ] **Step 1: Search completion trigger**

In `app/components/search/SearchResults.tsx`, add a `useEffect` that fires when search results are successfully loaded.

Find the section where `setData` (the successful infinite query result) is destructured (around line 310). After the existing destructuring block, add:

```tsx
import { useOnboardingStore } from '@/app/store/onboarding';
import { useRef } from 'react';

// After the setQuery destructuring, add:
const searchTourFired = useRef(false);
useEffect(() => {
  if (searchTourFired.current) return;
  if (setData?.pages?.length && setData.pages[0].results.length > 0) {
    searchTourFired.current = true;
    useOnboardingStore.getState().complete('search_set');
  }
}, [setData?.pages?.length]);
```

Note: Use `useOnboardingStore.getState()` directly instead of the hook to avoid unnecessary re-renders. The `useRef` flag ensures completion fires only once per mount, and `setData?.pages?.length` is a stable numeric dependency.

- [ ] **Step 2: Add set to collection trigger**

In `app/store/user-sets.ts`, inside the `setOwned` function, add completion call after the `owned: true` branch persists state.

Find the `setOwned` implementation (around line 221). After `persistState(nextState)` in the `owned: true` branch, add:

```ts
import { useOnboardingStore } from '@/app/store/onboarding';

// Inside setOwned, after persistState(nextState) in the owned=true branch:
if (owned) {
  useOnboardingStore.getState().complete('add_set');
}
```

Note: Since this is a Zustand store (not a React component), use `useOnboardingStore.getState()` directly.

- [ ] **Step 3: Identify part trigger**

In `app/identify/IdentifyClient.tsx`, find where a successful identification response is received (where `addRecentIdentify` is called). After that call, add:

```tsx
import { useOnboardingStore } from '@/app/store/onboarding';

// After addRecentIdentify():
useOnboardingStore.getState().complete('identify_part');
```

- [ ] **Step 4: Mark piece found trigger**

In `app/store/owned.ts`, inside the `setOwned` function (around line 319), after `write(setNumber, updated)` when qty > 0:

```ts
import { useOnboardingStore } from '@/app/store/onboarding';

// After write(setNumber, updated), when setting a positive quantity:
if (nextQty > 0) {
  useOnboardingStore.getState().complete('mark_piece_select');
}
```

- [ ] **Step 5: Filter by color trigger**

In `app/components/set/InventoryControls.tsx`, find the `handleToggleColor` function (around line 134). After the `setFilter` call, add:

```tsx
import { useOnboardingStore } from '@/app/store/onboarding';

// Inside handleToggleColor, after setFilter():
useOnboardingStore.getState().complete('mark_piece_filter_color');
```

- [ ] **Step 6: Group by category trigger**

In `app/components/set/InventoryControls.tsx`, the `setGroupBy` function is passed directly to `TopBarControls` via `onChangeGroupBy`. Wrap it to also trigger onboarding completion:

```tsx
import { useOnboardingStore } from '@/app/store/onboarding';

// Create a wrapper around setGroupBy (near top of component):
const handleGroupByChange = useCallback(
  (g: GroupBy) => {
    setGroupBy(g);
    if (g !== 'none') {
      useOnboardingStore.getState().complete('mark_piece_group_category');
    }
  },
  [setGroupBy]
);

// Then replace all usages of setGroupBy passed to child components with handleGroupByChange.
// In handleDropdownChange, replace the setGroupBy call:
// setGroupBy(key as ...) → handleGroupByChange(key as ...)
// And pass handleGroupByChange to TopBarControls:
// onChangeGroupBy={handleGroupByChange}
```

- [ ] **Step 7: Start Search Party trigger**

In `app/hooks/useSearchPartyLifecycle.ts`, find where a successful session creation response is handled. After the success path (after `joinAndRegister(session)`), add:

```ts
import { useOnboardingStore } from '@/app/store/onboarding';

// After successful session creation:
useOnboardingStore.getState().complete('start_search_party');
```

- [ ] **Step 8: Review account settings trigger**

In `app/account/AccountPageClient.tsx`, add a `useEffect` on mount:

```tsx
import { useEffect } from 'react';
import { useOnboardingStore } from '@/app/store/onboarding';

// Inside the component, near other useEffects:
useEffect(() => {
  useOnboardingStore.getState().complete('review_settings');
}, []);
```

- [ ] **Step 9: Commit**

```bash
git add app/components/search/SearchResults.tsx app/store/user-sets.ts app/identify/IdentifyClient.tsx app/store/owned.ts app/components/set/InventoryControls.tsx app/hooks/useSearchPartyLifecycle.ts app/account/AccountPageClient.tsx
git commit -m "feat(onboarding): add completion triggers to existing code paths"
```

---

### Task 11: Account Settings — Re-enable Tour

**Files:**

- Modify: `app/account/AccountPageClient.tsx`

- [ ] **Step 1: Add tour re-enable toggle to account settings**

Find the settings section in `AccountPageClient.tsx` and add a toggle for re-enabling the tour. This should only be visible when the tour is dismissed.

```tsx
import { useOnboarding } from '@/app/hooks/useOnboarding';

// Inside the component:
const { dismissed: tourDismissed, reEnable: reEnableTour } = useOnboarding();

// In the settings JSX, add a section:
{
  tourDismissed && (
    <div className="flex items-center justify-between rounded-lg border border-subtle p-4">
      <div>
        <p className="text-sm font-medium text-foreground">App Tour</p>
        <p className="text-xs text-foreground-muted">
          Re-enable the guided tour of Brick Party
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reEnableTour}>
        Show tour
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/account/AccountPageClient.tsx
git commit -m "feat(onboarding): add tour re-enable toggle in account settings"
```

---

### Task 12: Hydration on App Load

**Files:**

- Modify: `app/components/onboarding/TourCard.tsx`

- [ ] **Step 1: Add initial hydration for anonymous users**

The `TourCard` component already calls `useOnboardingSync()` which hydrates authenticated users. For anonymous users, we need to hydrate from localStorage on first render.

In `TourCard.tsx`, add hydration at the top of the component:

```tsx
import { useEffect } from 'react';

// Inside TourCard, before other logic:
useEffect(() => {
  if (!user && !isLoading) {
    useOnboardingStore.getState().hydrate();
  }
}, [user, isLoading]);
```

Add the import:

```tsx
import { useOnboardingStore } from '@/app/store/onboarding';
```

- [ ] **Step 2: Commit**

```bash
git add app/components/onboarding/TourCard.tsx
git commit -m "feat(onboarding): add localStorage hydration for anonymous users"
```

---

## Chunk 4: Video Pipeline Scaffolding

### Task 13: Video Pipeline Setup

**Files:**

- Create: `scripts/videos/record.ts`
- Create: `scripts/videos/scenarios/search-set.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add output directory to .gitignore**

Append to `.gitignore`:

```
# Video recording output
scripts/videos/output/
```

- [ ] **Step 2: Create the video scripts directory with a template recording script**

Create `scripts/videos/record.ts` — a template Playwright script showing the CDP screencast + FFmpeg pattern:

```ts
/**
 * Video recording template using Playwright + CDP Screencast + FFmpeg.
 *
 * Usage:
 *   npx tsx scripts/videos/record.ts <script-name>
 *
 * Each script in scripts/videos/scenarios/ exports a `run` function
 * that receives a Playwright Page and performs scripted interactions.
 *
 * Output: scripts/videos/output/<script-name>.mp4
 *
 * Prerequisites:
 *   - App running at localhost:3000
 *   - FFmpeg installed
 *   - npm install playwright (dev dependency)
 */

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = join(__dirname, 'output');
const FRAMES_DIR = join(OUTPUT_DIR, 'frames');
const VIEWPORT = { width: 1280, height: 720 };
const BASE_URL = 'http://localhost:3000';

async function main() {
  const scriptName = process.argv[2];
  if (!scriptName) {
    console.error('Usage: npx tsx scripts/videos/record.ts <script-name>');
    process.exit(1);
  }

  // Dynamic import of scenario script
  const scenario = await import(`./scenarios/${scriptName}`);

  mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Start CDP screencast
  const client = await page.context().newCDPSession(page);
  let frameIndex = 0;

  client.on('Page.screencastFrame', async params => {
    const framePath = join(
      FRAMES_DIR,
      `frame_${String(frameIndex).padStart(5, '0')}.png`
    );
    writeFileSync(framePath, Buffer.from(params.data, 'base64'));
    frameIndex++;
    await client.send('Page.screencastFrameAck', {
      sessionId: params.sessionId,
    });
  });

  await client.send('Page.startScreencast', {
    format: 'png',
    everyNthFrame: 1,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
  });

  // Run the scenario
  await page.goto(BASE_URL);
  await scenario.run(page);

  // Stop screencast
  await client.send('Page.stopScreencast');
  await browser.close();

  // Encode with FFmpeg
  const outputPath = join(OUTPUT_DIR, `${scriptName}.mp4`);
  execSync(
    `ffmpeg -y -framerate 30 -i "${FRAMES_DIR}/frame_%05d.png" -c:v libx264 -crf 18 -pix_fmt yuv420p "${outputPath}"`,
    { stdio: 'inherit' }
  );

  // Clean up frames
  execSync(`rm -rf "${FRAMES_DIR}"`);

  console.log(`Video saved to: ${outputPath}`);
}

main().catch(console.error);
```

- [ ] **Step 3: Create a sample scenario file**

Create `scripts/videos/scenarios/search-set.ts`:

```ts
import type { Page } from 'playwright';

export async function run(page: Page) {
  // Navigate to search
  await page.goto('http://localhost:3000/search');
  await page.waitForTimeout(1000);

  // Type a search query
  const searchInput = page.getByPlaceholder(/search/i);
  await searchInput.click();
  await searchInput.type('10497', { delay: 100 });
  await page.waitForTimeout(2000);

  // Click first result (adjust selector as needed)
  // await page.locator('[data-testid="search-result"]').first().click();
  // await page.waitForTimeout(2000);
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/videos/record.ts scripts/videos/scenarios/search-set.ts .gitignore
git commit -m "feat(onboarding): add video recording pipeline scaffolding"
```

---

## Final Verification

### Task 14: End-to-End Verification

- [ ] **Step 1: Type-check the entire project**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 3: Manual smoke test**

1. Open app in incognito → tour sign-up prompt should appear at bottom
2. Dismiss → note about re-enabling in settings should appear briefly
3. Sign in → full checklist should appear
4. Search for a set → "Search for a set" should auto-complete
5. Click a checklist item → modal should open with description and "Go to" button
6. Collapse the checklist → slim bar should show progress
7. Go to Account → "Review account settings" should auto-complete
8. Dismiss tour → re-enable toggle should appear in account settings
9. Re-enable → checklist should reappear with previous progress

- [ ] **Step 4: Commit any fixes from smoke testing**
