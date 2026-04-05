# Optimistic List Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix delayed checkmark and stale-closure race when creating lists from a set/minifig modal, using optimistic updates with functional state transitions and a new app-level error toast provider.

**Architecture:** Introduce a client-generated `tempId` that stands in for the new list across React state, in-memory cache, and localStorage between the create POST and its response. All state mutations are converted to functional (`setState(prev => ...)`) or read-modify-write form so concurrent `createList`/`toggleList`/`deleteList` calls never drop entries. Async failures surface through a new `ListToastProvider` that mirrors `SyncProvider`'s subscriber pattern, while synchronous validation errors continue to use the existing in-modal `ErrorBanner`.

**Tech Stack:** TypeScript, React 18, Next.js 15 (App Router), Vitest + jsdom, `@testing-library/react` `renderHook` / `act`, Supabase JS client (mocked in tests).

**Spec:** [docs/superpowers/specs/2026-04-04-list-creation-optimistic-design.md](../specs/2026-04-04-list-creation-optimistic-design.md)

---

## File Structure

**New files:**

- `app/components/providers/list-toast-provider.tsx` — React provider that renders a single `<Toast variant="error" />` for async list-operation failures. Exports module-level `emitListToast(message)` using the same subscriber pattern as `optimisticUpdateUserLists` in `useUserLists.ts`.
- `app/components/providers/__tests__/list-toast-provider.test.tsx` — Smoke test for the provider.
- `app/hooks/__tests__/useListMembership.test.tsx` — New tests for optimistic checkmark, rapid-create races, and error rollback paths. Uses `.tsx` extension because `renderHook` + JSX is involved in the existing codebase convention ([`app/hooks/__tests__/useSupabaseOwned.test.tsx`](../../../app/hooks/__tests__/useSupabaseOwned.test.tsx)).

**Modified files:**

- `app/hooks/useListMembership.ts` — Rewrite `createList`; introduce `updateCachesFunctional`; migrate `toggleList` and `deleteList` to functional form; replace async `setError` calls with `emitListToast`.
- `app/layout.tsx` — Mount `<ListToastProvider>` inside `<SyncProvider>`.

**Unchanged:** `useSetLists.ts`, `useMinifigLists.ts`, `CollectionsModals.tsx`, `CollectionsModalContent.tsx`, `SetOwnershipAndCollectionsRow.tsx`, `MinifigOwnershipAndCollectionsRow.tsx`, `ErrorBanner.tsx`, `app/api/lists/route.ts`, Supabase migrations.

---

## Task 1: Create `ListToastProvider` with subscriber pattern

**Files:**

- Create: `app/components/providers/list-toast-provider.tsx`
- Create: `app/components/providers/__tests__/list-toast-provider.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/components/providers/__tests__/list-toast-provider.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ListToastProvider,
  emitListToast,
} from '@/app/components/providers/list-toast-provider';

describe('ListToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a toast when emitListToast is called', () => {
    render(
      <ListToastProvider>
        <div>child</div>
      </ListToastProvider>
    );

    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      emitListToast('Something went wrong');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('auto-dismisses the toast after 4 seconds', () => {
    render(
      <ListToastProvider>
        <div>child</div>
      </ListToastProvider>
    );

    act(() => {
      emitListToast('Ephemeral');
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retriggers auto-dismiss when a second emit arrives', () => {
    render(
      <ListToastProvider>
        <div>child</div>
      </ListToastProvider>
    );

    act(() => {
      emitListToast('First');
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    act(() => {
      emitListToast('Second');
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Second');

    // 2s after the *second* emit is not yet 4s — still visible
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Second');

    // 4s after the second emit — gone
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is a no-op when emitListToast is called with no provider mounted', () => {
    expect(() => emitListToast('no listeners')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/components/providers/__tests__/list-toast-provider.test.tsx`
Expected: FAIL with module-not-found / import error for `list-toast-provider`.

- [ ] **Step 3: Implement the provider**

Create `app/components/providers/list-toast-provider.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState, type PropsWithChildren } from 'react';

import { Toast } from '@/app/components/ui/Toast';

type Listener = (message: string) => void;

const listeners = new Set<Listener>();

/**
 * Emit a transient error toast from anywhere in the app.
 * The active ListToastProvider (mounted in layout.tsx) will render it.
 * No-ops silently if no provider is mounted (e.g. during SSR).
 */
export function emitListToast(message: string): void {
  for (const listener of listeners) {
    listener(message);
  }
}

type ToastState = { message: string; id: number } | null;

const TOAST_DISMISS_MS = 4000;

export function ListToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const listener: Listener = message => {
      idRef.current += 1;
      setToast({ message, id: idRef.current });
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      {children}
      {toast && (
        <Toast
          variant="error"
          description={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/components/providers/__tests__/list-toast-provider.test.tsx`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/providers/list-toast-provider.tsx app/components/providers/__tests__/list-toast-provider.test.tsx
git commit -m "feat: add ListToastProvider for async list-operation errors"
```

---

## Task 2: Mount `ListToastProvider` in app layout

**Files:**

- Modify: `app/layout.tsx` (imports + provider tree near line 232)

- [ ] **Step 1: Add the import**

Open `app/layout.tsx`. Add this import alongside the other provider imports (near [app/layout.tsx:11](../../../app/layout.tsx#L11)):

```ts
import { ListToastProvider } from '@/app/components/providers/list-toast-provider';
```

- [ ] **Step 2: Wrap the tree inside `SyncProvider`**

Locate this block (approximately [app/layout.tsx:232-247](../../../app/layout.tsx#L232-L247)):

```tsx
<SyncProvider>
  <ThemeProvider
    initialTheme={initialTheme}
    initialThemeColor={dbThemeColor ?? undefined}
    isAuthenticated={!!initialUser}
  >
    <ReactQueryProvider>
      <ErrorBoundary>
        {children}
        <Analytics />
        <SpeedInsights />
        <TourCard />
      </ErrorBoundary>
    </ReactQueryProvider>
  </ThemeProvider>
</SyncProvider>
```

Replace with:

```tsx
<SyncProvider>
  <ListToastProvider>
    <ThemeProvider
      initialTheme={initialTheme}
      initialThemeColor={dbThemeColor ?? undefined}
      isAuthenticated={!!initialUser}
    >
      <ReactQueryProvider>
        <ErrorBoundary>
          {children}
          <Analytics />
          <SpeedInsights />
          <TourCard />
        </ErrorBoundary>
      </ReactQueryProvider>
    </ThemeProvider>
  </ListToastProvider>
</SyncProvider>
```

- [ ] **Step 3: Verify types and build**

Run: `npx tsc --noEmit`
Expected: clean exit (no errors).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: mount ListToastProvider in root layout"
```

---

## Task 3: Add failing test for optimistic checkmark on `createList`

**Files:**

- Create: `app/hooks/__tests__/useListMembership.test.tsx`

- [ ] **Step 1: Write the test file scaffold and first test**

Create `app/hooks/__tests__/useListMembership.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

// --- Mocks ---

const mockUser = { id: 'user-1' };
vi.mock('@/app/hooks/useSupabaseUser', () => ({
  useSupabaseUser: () => ({ user: mockUser }),
}));

vi.mock('@/app/components/providers/entitlements-provider', () => ({
  useEntitlements: () => ({ hasFeature: () => true }),
}));

// Mock emitListToast so we can assert on it
const emitListToastMock = vi.fn();
vi.mock('@/app/components/providers/list-toast-provider', () => ({
  emitListToast: (...args: unknown[]) => emitListToastMock(...args),
}));

// Mock useUserLists — provide a tiny in-memory store so optimistic updates
// from useListMembership are visible to assertions.
let mockAllLists: Array<{ id: string; name: string; isSystem: boolean }> = [];
const optimisticUpdateUserListsMock = vi.fn(
  (
    _userId: string,
    updater: (
      prev: Array<{ id: string; name: string; isSystem: boolean }>
    ) => Array<{ id: string; name: string; isSystem: boolean }>
  ) => {
    mockAllLists = updater(mockAllLists);
  }
);
vi.mock('@/app/hooks/useUserLists', () => ({
  useUserLists: () => ({
    allLists: mockAllLists,
    lists: mockAllLists.filter(l => !l.isSystem),
    wishlist: null,
    isLoading: false,
    error: null,
  }),
  optimisticUpdateUserLists: (
    userId: string,
    updater: (
      prev: Array<{ id: string; name: string; isSystem: boolean }>
    ) => Array<{ id: string; name: string; isSystem: boolean }>
  ) => optimisticUpdateUserListsMock(userId, updater),
}));

// Supabase chainable mock. Terminal operations (.then on the query chain
// for upsert/delete/eq) resolve to the configured result.
type QueryResult = { data: unknown; error: { message: string } | null };
let mockMembershipResult: QueryResult = { data: [], error: null };
let mockUpsertResult: QueryResult = { data: null, error: null };
let mockDeleteResult: QueryResult = { data: null, error: null };

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.eq = self;
  chain.in = self;
  chain.not = self;
  chain.order = self;
  // Await on the chain resolves to mockMembershipResult (initial membership load)
  chain.then = (resolve: (v: QueryResult) => unknown) =>
    Promise.resolve(resolve(mockMembershipResult));
  return chain;
}

function makeUpsertChain() {
  return {
    then: (resolve: (v: QueryResult) => unknown) =>
      Promise.resolve(resolve(mockUpsertResult)),
  };
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.eq = self;
  chain.then = (resolve: (v: QueryResult) => unknown) =>
    Promise.resolve(resolve(mockDeleteResult));
  return chain;
}

vi.mock('@/app/lib/supabaseClient', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => makeQueryChain(),
      upsert: () => makeUpsertChain(),
      delete: () => makeDeleteChain(),
    }),
  }),
}));

// Stub global fetch for POST /api/lists
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

// localStorage
const lsStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => lsStore.set(k, v),
  removeItem: (k: string) => lsStore.delete(k),
  clear: () => lsStore.clear(),
  get length() {
    return lsStore.size;
  },
  key: (i: number) => Array.from(lsStore.keys())[i] ?? null,
});

// Now import the hook under test (after all mocks are set up)
import { useListMembership } from '@/app/hooks/useListMembership';

beforeEach(() => {
  mockAllLists = [];
  optimisticUpdateUserListsMock.mockClear();
  emitListToastMock.mockClear();
  fetchMock.mockReset();
  mockMembershipResult = { data: [], error: null };
  mockUpsertResult = { data: null, error: null };
  mockDeleteResult = { data: null, error: null };
  lsStore.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useListMembership — createList optimistic behavior', () => {
  it('adds the item to the new list synchronously via a temp id', async () => {
    // fetch never resolves so we can assert synchronous state
    let resolveFetch!: (value: Response) => void;
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>(res => (resolveFetch = res))
    );

    const { result } = renderHook(() =>
      useListMembership('set', '75192-1', 'set_num')
    );

    // Wait for initial membership load to settle
    await waitFor(() => {
      expect(result.current.listsLoading).toBe(false);
    });

    act(() => {
      result.current.createList('My List');
    });

    // selectedListIds should already contain a temp id, synchronously
    expect(result.current.selectedListIds).toHaveLength(1);
    expect(result.current.selectedListIds[0]).toMatch(/^temp-/);

    // Cleanup: resolve the fetch so any trailing microtasks settle
    resolveFetch(
      new Response(
        JSON.stringify({ id: 'real-1', name: 'My List', is_system: false }),
        { status: 201 }
      )
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run app/hooks/__tests__/useListMembership.test.tsx`
Expected: FAIL. The current implementation ([useListMembership.ts:485-487](../../../app/hooks/useListMembership.ts#L485-L487)) only updates `selectedListIds` _after_ the POST resolves, so `selectedListIds` will still be empty when asserted.

- [ ] **Step 3: Commit the failing test**

```bash
git add app/hooks/__tests__/useListMembership.test.tsx
git commit -m "test: add failing test for optimistic list creation"
```

---

## Task 4: Implement optimistic `createList` with temp id

**Files:**

- Modify: `app/hooks/useListMembership.ts:402-516` (rewrite `createList`)

- [ ] **Step 1: Replace `createList` in `useListMembership.ts`**

Replace the existing `createList` function (currently at [app/hooks/useListMembership.ts:402-516](../../../app/hooks/useListMembership.ts#L402-L516)) with this implementation. Do NOT remove `updateCaches` yet — it will be replaced in Task 5. For now, introduce a local helper so the new flow can be written functionally:

At the top of the file, add the import for `emitListToast`:

```ts
import { emitListToast } from '@/app/components/providers/list-toast-provider';
```

Then replace the `createList` function body:

```ts
const createList = (name: string) => {
  const trimmed = name.trim();
  if (!user || !trimmed) return;

  // Client-side pre-check for fast UX rejection (server enforces authoritatively)
  const customListCount = lists.filter(l => !l.isSystem).length;
  if (customListCount >= FREE_LIST_LIMIT && !hasFeature('lists.unlimited')) {
    setShowListUpgradeModal(true);
    return;
  }

  const exists = lists.some(
    list => list.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (exists) {
    setError('A list with that name already exists.');
    return;
  }

  const tempId = `temp-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  const optimistic: UserListSummary = {
    id: tempId,
    name: trimmed,
    isSystem: false,
  };

  // 1. Optimistic add to userLists (existing helper, already functional)
  optimisticUpdateUserLists(user.id, prev => [...prev, optimistic]);

  // 2. Optimistic add to selectedListIds (functional)
  setSelectedListIds(prev =>
    prev.includes(tempId) ? prev : [...prev, tempId]
  );

  // 3. Optimistic add to in-memory + localStorage caches (functional)
  updateCachesFunctional(prev =>
    prev.includes(tempId) ? prev : [...prev, tempId]
  );

  void (async () => {
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });

      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        // Rollback all optimistic state
        optimisticUpdateUserLists(user.id, prev =>
          prev.filter(list => list.id !== tempId)
        );
        setSelectedListIds(prev => prev.filter(id => id !== tempId));
        updateCachesFunctional(prev => prev.filter(id => id !== tempId));
        if (body?.error === 'feature_unavailable') {
          setShowListUpgradeModal(true);
        } else {
          emitListToast(body?.message || 'Failed to create list');
        }
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        logger.error('list.create_failed', {
          error: body?.message || body?.error,
        });
        optimisticUpdateUserLists(user.id, prev =>
          prev.filter(list => list.id !== tempId)
        );
        setSelectedListIds(prev => prev.filter(id => id !== tempId));
        updateCachesFunctional(prev => prev.filter(id => id !== tempId));
        emitListToast(body?.message || body?.error || 'Failed to create list');
        return;
      }

      const data = (await res.json()) as {
        id: string;
        name: string;
        is_system: boolean;
      };
      const created: UserListSummary = {
        id: data.id,
        name: data.name,
        isSystem: data.is_system,
      };

      // 4. Swap tempId -> realId in userLists (functional, with sort)
      optimisticUpdateUserLists(user.id, prev =>
        prev
          .map(list => (list.id === tempId ? created : list))
          .sort((a, b) => a.name.localeCompare(b.name))
      );

      // 5. Swap tempId -> realId in selectedListIds (functional)
      setSelectedListIds(prev =>
        prev.map(id => (id === tempId ? created.id : id))
      );

      // 6. Swap tempId -> realId in caches (functional)
      updateCachesFunctional(prev =>
        prev.map(id => (id === tempId ? created.id : id))
      );

      // 7. Persist the item-to-list association
      const supabase = getSupabaseBrowserClient();
      void supabase
        .from('user_list_items')
        .upsert(makeUpsertRow(user.id, created.id), {
          onConflict: upsertConflict(),
        })
        .then(({ error: membershipError }) => {
          if (membershipError) {
            logger.error('list.add_to_new_list_failed', {
              itemType,
              error: membershipError.message,
            });
            // List was created successfully; roll back only the item-to-list link
            setSelectedListIds(prev => prev.filter(id => id !== created.id));
            updateCachesFunctional(prev =>
              prev.filter(id => id !== created.id)
            );
            emitListToast(
              `List created, but failed to add ${itemType}. Try again.`
            );
          } else {
            onToggleAdd?.(user.id, normItemId, created.id);
          }
        });
    } catch (err) {
      logger.error('list.create_failed', {
        error: (err as Error)?.message ?? String(err),
      });
      optimisticUpdateUserLists(user.id, prev =>
        prev.filter(list => list.id !== tempId)
      );
      setSelectedListIds(prev => prev.filter(id => id !== tempId));
      updateCachesFunctional(prev => prev.filter(id => id !== tempId));
      emitListToast('Failed to create list');
    }
  })();
};
```

- [ ] **Step 2: Add `updateCachesFunctional` helper**

Immediately above the `createList` function, add this helper alongside the existing `updateCaches`:

```ts
function updateCachesFunctional(updater: (prev: string[]) => string[]): void {
  if (cacheKey) {
    const prev = membershipCache.get(cacheKey)?.selectedIds ?? [];
    membershipCache.set(cacheKey, {
      selectedIds: updater(prev),
      updatedAt: Date.now(),
    });
  }
  if (user) {
    const prev = getPersistedMembership(user.id, persistKey) ?? [];
    updatePersistedMembership(user.id, persistKey, updater(prev));
  }
}
```

- [ ] **Step 3: Run the optimistic test to verify it passes**

Run: `npm test -- --run app/hooks/__tests__/useListMembership.test.tsx`
Expected: the "adds the item to the new list synchronously via a temp id" test PASSES.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 5: Commit**

```bash
git add app/hooks/useListMembership.ts
git commit -m "feat: optimistically add item to new list with temp id"
```

---

## Task 5: Migrate `toggleList` and `deleteList` to functional cache updates

**Files:**

- Modify: `app/hooks/useListMembership.ts` (`toggleList`, `deleteList`, remove old `updateCaches`)

- [ ] **Step 1: Add a failing test for rapid toggle race**

Append to `app/hooks/__tests__/useListMembership.test.tsx` inside the existing `describe('useListMembership — createList optimistic behavior', ...)` block OR add a new describe:

```tsx
describe('useListMembership — toggleList race safety', () => {
  it('preserves final state when add and remove fire in quick succession', async () => {
    // Initial membership: already in list 'list-a'
    mockMembershipResult = {
      data: [{ list_id: 'list-a' }],
      error: null,
    };
    mockUpsertResult = { data: null, error: null };
    mockDeleteResult = { data: null, error: null };

    const { result } = renderHook(() =>
      useListMembership('set', '75192-1', 'set_num')
    );

    await waitFor(() => {
      expect(result.current.selectedListIds).toEqual(['list-a']);
    });

    // Rapidly remove then re-add
    act(() => {
      result.current.toggleList('list-a'); // remove
      result.current.toggleList('list-a'); // add back
    });

    // Let pending supabase .then callbacks resolve
    await waitFor(() => {
      expect(result.current.selectedListIds).toEqual(['list-a']);
    });
  });
});
```

- [ ] **Step 2: Run the test — it should already pass with existing toggleList for single-call cases, but verify rapid-fire works**

Run: `npm test -- --run app/hooks/__tests__/useListMembership.test.tsx -t "toggleList race safety"`
Expected: may pass or fail depending on setState functional form in existing code — the existing code uses `prevSelected` snapshots which are closure-captured. Document whichever result occurs; the migration below makes it robust regardless.

- [ ] **Step 3: Rewrite `toggleList` using functional updates**

Replace the existing `toggleList` ([useListMembership.ts:344-400](../../../app/hooks/useListMembership.ts#L344-L400)) with:

```ts
const toggleList = (listId: string) => {
  if (!user) return;

  const supabase = getSupabaseBrowserClient();
  const wasSelected = selectedListIds.includes(listId);

  // Optimistic state update (functional)
  setSelectedListIds(prev =>
    wasSelected ? prev.filter(id => id !== listId) : [...prev, listId]
  );
  updateCachesFunctional(prev =>
    wasSelected ? prev.filter(id => id !== listId) : [...prev, listId]
  );

  if (wasSelected) {
    void supabase
      .from('user_list_items')
      .delete()
      .eq('user_id', user.id)
      .eq('list_id', listId)
      .eq('item_type', itemType)
      .eq(itemColumn, normItemId)
      .then(({ error: err }) => {
        if (err) {
          logger.error('list.toggle_remove_failed', {
            listId,
            itemType,
            error: err.message,
          });
          // Rollback: add the id back if it's still absent
          setSelectedListIds(prev =>
            prev.includes(listId) ? prev : [...prev, listId]
          );
          updateCachesFunctional(prev =>
            prev.includes(listId) ? prev : [...prev, listId]
          );
          emitListToast('Failed to update lists');
        } else {
          onToggleRemove?.(user.id, normItemId, listId);
        }
      });
  } else {
    void supabase
      .from('user_list_items')
      .upsert(makeUpsertRow(user.id, listId), {
        onConflict: upsertConflict(),
      })
      .then(({ error: err }) => {
        if (err) {
          logger.error('list.toggle_add_failed', {
            listId,
            itemType,
            error: err.message,
          });
          // Rollback: remove the id if it's still present
          setSelectedListIds(prev => prev.filter(id => id !== listId));
          updateCachesFunctional(prev => prev.filter(id => id !== listId));
          emitListToast('Failed to update lists');
        } else {
          onToggleAdd?.(user.id, normItemId, listId);
        }
      });
  }
};
```

**Note on `wasSelected`:** this value is captured at call time and used only to pick the branch (add vs remove) and the rollback direction. Since it reflects the state at the moment the user clicked, that's the correct semantic. The race fix comes from the functional form of `setSelectedListIds` and `updateCachesFunctional` in both the optimistic update and the rollback.

- [ ] **Step 4: Rewrite `deleteList` using functional updates**

Replace the existing `deleteList` ([useListMembership.ts:555-599](../../../app/hooks/useListMembership.ts#L555-L599)) with:

```ts
const deleteList = (listId: string) => {
  if (!user) return;

  // Snapshot only for userLists rollback on failure (useUserLists store
  // doesn't expose a functional "restore" helper, so we capture the full
  // previous list and restore from it if the delete fails).
  const prevLists = allLists;

  optimisticUpdateUserLists(user.id, prev => prev.filter(l => l.id !== listId));

  setSelectedListIds(prev => prev.filter(id => id !== listId));
  updateCachesFunctional(prev => prev.filter(id => id !== listId));

  const supabase = getSupabaseBrowserClient();
  void supabase
    .from('user_lists')
    .delete()
    .eq('id', listId)
    .eq('user_id', user.id)
    .then(({ error: err }) => {
      if (err) {
        logger.error('list.delete_failed', { listId, error: err.message });
        optimisticUpdateUserLists(user.id, () => prevLists);
        setSelectedListIds(prev =>
          prev.includes(listId) ? prev : [...prev, listId]
        );
        updateCachesFunctional(prev =>
          prev.includes(listId) ? prev : [...prev, listId]
        );
        emitListToast('Failed to delete list');
      }
    });
};
```

- [ ] **Step 5: Delete the now-unused `updateCaches` helper**

Remove the `updateCaches` function (the old non-functional version, at [useListMembership.ts:330-340](../../../app/hooks/useListMembership.ts#L330-L340)). Verify no other references remain with:

Run: `grep -n "updateCaches\b" app/hooks/useListMembership.ts`
Expected: no matches (only `updateCachesFunctional` remains).

- [ ] **Step 6: Update `renameList` to use `emitListToast` on async failure**

In `renameList` ([useListMembership.ts:518-553](../../../app/hooks/useListMembership.ts#L518-L553)), replace `setError('Failed to rename list')` with:

```ts
emitListToast('Failed to rename list');
```

Keep the existing `setError('A list with that name already exists.')` for the synchronous duplicate-name pre-check — that remains a banner error.

- [ ] **Step 7: Run all useListMembership tests**

Run: `npm test -- --run app/hooks/__tests__/useListMembership.test.tsx`
Expected: all tests pass, including the toggle race test.

- [ ] **Step 8: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 9: Commit**

```bash
git add app/hooks/useListMembership.ts app/hooks/__tests__/useListMembership.test.tsx
git commit -m "refactor: migrate toggleList/deleteList/renameList to functional cache updates"
```

---

## Task 6: Add rapid-create race tests

**Files:**

- Modify: `app/hooks/__tests__/useListMembership.test.tsx` (append tests)

- [ ] **Step 1: Write the rapid-create in-order test**

Append inside the `describe('useListMembership — createList optimistic behavior', ...)` block:

```tsx
it('preserves all selections when multiple creates resolve in order', async () => {
  const pending: Array<(res: Response) => void> = [];
  fetchMock.mockImplementation(
    () => new Promise<Response>(resolve => pending.push(resolve))
  );

  const { result } = renderHook(() =>
    useListMembership('set', '75192-1', 'set_num')
  );

  await waitFor(() => {
    expect(result.current.listsLoading).toBe(false);
  });

  act(() => {
    result.current.createList('A');
    result.current.createList('B');
    result.current.createList('C');
  });

  // All three temp ids should be present
  expect(result.current.selectedListIds).toHaveLength(3);
  expect(
    result.current.selectedListIds.every(id => id.startsWith('temp-'))
  ).toBe(true);

  // Resolve in order A, B, C
  await act(async () => {
    pending[0](
      new Response(
        JSON.stringify({ id: 'real-a', name: 'A', is_system: false }),
        { status: 201 }
      )
    );
    pending[1](
      new Response(
        JSON.stringify({ id: 'real-b', name: 'B', is_system: false }),
        { status: 201 }
      )
    );
    pending[2](
      new Response(
        JSON.stringify({ id: 'real-c', name: 'C', is_system: false }),
        { status: 201 }
      )
    );
    // Flush microtasks so all .then callbacks settle
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(result.current.selectedListIds.sort()).toEqual([
      'real-a',
      'real-b',
      'real-c',
    ]);
  });
});

it('preserves all selections when creates resolve out of order', async () => {
  const pending: Array<(res: Response) => void> = [];
  fetchMock.mockImplementation(
    () => new Promise<Response>(resolve => pending.push(resolve))
  );

  const { result } = renderHook(() =>
    useListMembership('set', '75192-1', 'set_num')
  );

  await waitFor(() => {
    expect(result.current.listsLoading).toBe(false);
  });

  act(() => {
    result.current.createList('A');
    result.current.createList('B');
    result.current.createList('C');
  });

  // Resolve in reverse order: C, B, A
  await act(async () => {
    pending[2](
      new Response(
        JSON.stringify({ id: 'real-c', name: 'C', is_system: false }),
        { status: 201 }
      )
    );
    pending[1](
      new Response(
        JSON.stringify({ id: 'real-b', name: 'B', is_system: false }),
        { status: 201 }
      )
    );
    pending[0](
      new Response(
        JSON.stringify({ id: 'real-a', name: 'A', is_system: false }),
        { status: 201 }
      )
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(result.current.selectedListIds.sort()).toEqual([
      'real-a',
      'real-b',
      'real-c',
    ]);
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- --run app/hooks/__tests__/useListMembership.test.tsx`
Expected: both rapid-create tests PASS thanks to the functional updates from Tasks 4 and 5.

- [ ] **Step 3: Commit**

```bash
git add app/hooks/__tests__/useListMembership.test.tsx
git commit -m "test: add rapid-create race tests for useListMembership"
```

---

## Task 7: Add error-path tests (POST failure, 403, upsert failure)

**Files:**

- Modify: `app/hooks/__tests__/useListMembership.test.tsx`

- [ ] **Step 1: Write the POST network failure test**

Append to the `createList optimistic behavior` describe block:

```tsx
it('rolls back temp id and emits toast on POST failure', async () => {
  fetchMock.mockRejectedValueOnce(new Error('network down'));

  const { result } = renderHook(() =>
    useListMembership('set', '75192-1', 'set_num')
  );

  await waitFor(() => {
    expect(result.current.listsLoading).toBe(false);
  });

  act(() => {
    result.current.createList('Doomed');
  });

  // Initially optimistic: temp id present
  expect(result.current.selectedListIds).toHaveLength(1);

  await waitFor(() => {
    expect(result.current.selectedListIds).toEqual([]);
  });

  expect(emitListToastMock).toHaveBeenCalledWith(
    expect.stringMatching(/failed to create list/i)
  );
});

it('rolls back and shows upgrade modal on POST 403', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'feature_unavailable' }), {
      status: 403,
    })
  );

  const { result } = renderHook(() =>
    useListMembership('set', '75192-1', 'set_num')
  );

  await waitFor(() => {
    expect(result.current.listsLoading).toBe(false);
  });

  act(() => {
    result.current.createList('Over limit');
  });

  await waitFor(() => {
    expect(result.current.selectedListIds).toEqual([]);
  });

  expect(result.current.showListUpgradeModal).toBe(true);
  expect(emitListToastMock).not.toHaveBeenCalled();
});

it('keeps list but rolls back membership when upsert fails after successful POST', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ id: 'real-x', name: 'X', is_system: false }),
      { status: 201 }
    )
  );
  mockUpsertResult = {
    data: null,
    error: { message: 'upsert boom' },
  };

  const { result } = renderHook(() =>
    useListMembership('set', '75192-1', 'set_num')
  );

  await waitFor(() => {
    expect(result.current.listsLoading).toBe(false);
  });

  act(() => {
    result.current.createList('X');
  });

  // Wait for the POST + upsert chain to settle
  await waitFor(() => {
    expect(emitListToastMock).toHaveBeenCalled();
  });

  // The list id should be rolled back from selectedListIds
  expect(result.current.selectedListIds).not.toContain('real-x');

  // But the list itself should still exist in userLists (via the
  // optimisticUpdateUserLists mock's in-memory store)
  expect(mockAllLists.some(l => l.id === 'real-x')).toBe(true);

  expect(emitListToastMock).toHaveBeenCalledWith(
    expect.stringMatching(/failed to add set/i)
  );
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- --run app/hooks/__tests__/useListMembership.test.tsx`
Expected: all new tests pass.

- [ ] **Step 3: Run the full test suite to make sure nothing else regressed**

Run: `npm test -- --run`
Expected: all tests pass. If anything else fails, it's likely an incidental mock issue — investigate and fix before committing.

- [ ] **Step 4: Commit**

```bash
git add app/hooks/__tests__/useListMembership.test.tsx
git commit -m "test: add error-path tests for createList rollback"
```

---

## Task 8: Lint, typecheck, and manual smoke verification

**Files:** none (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: clean exit.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Run the full test suite once more**

Run: `npm test -- --run`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke test checklist (dev server already running — do not start it)**

In a browser with the dev server:

1. Open a set page and click "Collections".
2. Type a new list name and click Create. Verify the list appears in the modal with its checkbox already checked, **immediately** (no ~1s delay).
3. Close the modal, reopen it. The new list should still be checked.
4. Open the modal again. Type and create 3 lists in rapid succession (Enter, Enter, Enter). All three should appear with their checkboxes checked. Reload the page — all three should remain checked.
5. Disconnect network (DevTools → Network → Offline). Try to create a list. Verify: the list appears optimistically, then disappears after the request fails, and an error toast appears at the bottom of the screen.
6. Reconnect network.
7. As a user who has hit the free list limit on a non-paid account: try to create a list. Verify: the list does NOT persist optimistically (server 403 triggers rollback), and the upgrade modal opens. No toast.

If any step fails, stop and debug before proceeding.

- [ ] **Step 5: Commit (if any fixes were needed)**

If no fixes were needed during smoke testing, skip this step. Otherwise:

```bash
git add <files>
git commit -m "fix: <what was fixed>"
```

---

## Task 9: Update MANUAL_TESTING_CHECKLIST.md

**Files:**

- Modify: `docs/dev/MANUAL_TESTING_CHECKLIST.md`

- [ ] **Step 1: Read the existing checklist to find the right section**

Read `docs/dev/MANUAL_TESTING_CHECKLIST.md`. Locate the section covering Collections / Lists (or a close analogue such as "Set ownership and collections"). If no such section exists, add one at the bottom under a new heading `## Collections / Lists`.

- [ ] **Step 2: Append these test cases**

Add the following checklist items under the Collections / Lists section:

```markdown
### Optimistic list creation

- [ ] Opening a set modal and creating a new list shows the list as checked immediately (no perceptible delay).
- [ ] Creating three lists in rapid succession from a set modal: all three appear checked, and remain checked after a page reload.
- [ ] With network offline, creating a list briefly shows it optimistically, then removes it and shows an error toast at the bottom of the screen.
- [ ] On a free-tier account at the list limit, attempting to create a list rolls back the optimistic entry and opens the upgrade modal (no error toast).
- [ ] Toggling a set in/out of a list rapidly (click, click, click) converges to a correct final state after the page reloads.
- [ ] The same flows work from a minifig modal.
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/MANUAL_TESTING_CHECKLIST.md
git commit -m "docs: add optimistic list creation to manual testing checklist"
```

---

## Task 10: Update active context memory

**Files:**

- Modify: `memory/active-context.md`

- [ ] **Step 1: Read the current active-context.md**

Read `memory/active-context.md` to understand its structure.

- [ ] **Step 2: Add a completion note**

Append a short entry to the "Recent changes" (or equivalent) section noting:

```markdown
- **2026-04-04** — Fixed delayed checkmark and rapid-create race in list creation from set/minifig modals. Introduced `ListToastProvider` (`app/components/providers/list-toast-provider.tsx`) for async list-operation errors; migrated `useListMembership` to functional state/cache updates; item-to-list association is now optimistic with temp id swap on POST success. Spec: `docs/superpowers/specs/2026-04-04-list-creation-optimistic-design.md`.
```

(Adapt wording if the existing file uses a different format.)

- [ ] **Step 3: Commit**

```bash
git add memory/active-context.md
git commit -m "docs: update active context with optimistic list creation fix"
```

---

## Self-review notes

**Spec coverage:**

- Problem — Bug 1 (delay): addressed in Task 4 (optimistic tempId added to `selectedListIds` before POST).
- Problem — Bug 2 (race): addressed in Tasks 4 and 5 (functional updates everywhere).
- Goal: rapid creation never drops items — Task 6 tests.
- Goal: async failures reach the user even after modal close — Tasks 1, 2, 4, 5, 7.
- Goal: synchronous validation stays in banner — preserved in Task 4 (duplicate name pre-check still calls `setError`).
- Goal: no API/schema changes — verified (only client files touched).
- Goal: applies to sets and minifigs — automatic via shared `useListMembership`.
- Design §1 (state model) — Task 4.
- Design §2 (createList flow) — Task 4.
- Design §3 (functional cache helper) — Task 4 (helper) + Task 5 (old `updateCaches` removed).
- Design §4 (`ListToastProvider`) — Task 1.
- Design §5 (error classification) — Tasks 4 (createList) + Task 5 (toggleList, deleteList, renameList).
- Design §6 (files touched) — Tasks 1–5.
- Design §7 (testing) — Tasks 3, 5, 6, 7; provider smoke test in Task 1.

**Placeholder scan:** No TBDs, no "handle edge cases", no "similar to Task N". Every step shows the code or command.

**Type consistency:**

- `updateCachesFunctional(updater: (prev: string[]) => string[])` — consistent signature across Tasks 4 and 5.
- `emitListToast(message: string)` — consistent signature across Tasks 1, 4, 5.
- `UserListSummary` type referenced in Task 4 matches the existing import from `useUserLists.ts` (already imported at the top of `useListMembership.ts`).
- `tempId` format `temp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` — slightly more entropy than the spec to avoid collisions when multiple `createList` calls fire in the same millisecond. Consistent use across create flow.

**Implementation notes for executor:**

- The mock Supabase chain in `useListMembership.test.tsx` is deliberately simple. If the initial membership `select` query needs additional chained methods beyond `.eq`, add them as `chain.methodName = self`. The pattern matches `app/hooks/__tests__/useSupabaseOwned.test.tsx`.
- `renderHook` + `act` usage is required for state assertions. Async `act` (using `await act(async () => {...})`) is needed around any operation that flushes microtasks (POST resolution, Supabase .then handlers).
- Do NOT use `amend` or force-push. Each task is a separate commit.
