# Optimistic list creation with functional state updates

**Date:** 2026-04-04
**Status:** Draft — pending review
**Scope:** Fix delayed/lost item-to-list association when creating lists from a set or minifig modal

## Problem

In [app/hooks/useListMembership.ts](../../../app/hooks/useListMembership.ts), `createList` has two related bugs that degrade UX when a user creates a new list from inside the collections modal of a set or minifig.

### Bug 1: Perceived delay adding the source item to the new list

`createList` optimistically adds the new list to `userLists` immediately, but the source item (set or minifig) is only marked as belonging to that list **after** `POST /api/lists` returns and the follow-up `user_list_items` upsert completes. This introduces a ~300–800ms window where the new list appears unchecked for the item that launched the modal.

### Bug 2: Stale-closure race on rapid creation

Each `createList` call captures `selectedListIds` at invocation time ([useListMembership.ts:485](../../../app/hooks/useListMembership.ts#L485)):

```ts
const nextSelected = [...selectedListIds, created.id];
setSelectedListIds(nextSelected);
```

When a user rapidly creates multiple lists, both invocations close over the same base value of `selectedListIds`. When the second POST resolves, its `setSelectedListIds` call overwrites the first with a value that only contains the second list's id. The first list disappears from both `selectedListIds` (React state) and the localStorage membership cache.

The Supabase `user_list_items` upserts both succeed — this is a pure client-state coherence bug. On page reload the state becomes correct, but within the session the user sees their first N-1 lists lose the item they were created to contain.

## Goals

- Creating a list from an item modal shows the item as belonging to that list **immediately**.
- Rapid creation of multiple lists never drops items from any of them.
- Asynchronous failures reach the user even if they have closed the modal.
- Synchronous validation errors stay in their existing contextual location (modal banner).
- No API or schema changes.
- Fix applies transparently to both `useSetLists` and `useMinifigLists` (they share `useListMembership`).

## Non-goals

- Rewriting the membership cache layer.
- Consolidating `ErrorBanner` and `Toast` into a single notification system.
- Adding a server-side "create list and add item" combined endpoint.
- Addressing ownership/other-state races outside list creation.

## Design

### 1. Optimistic state model

Before `POST /api/lists` returns, `selectedListIds` and `userLists` will both contain a client-generated `tempId` with format `temp-${Date.now().toString(36)}`.

- On POST success: the `tempId` is swapped for the real UUID returned by the server in both collections via functional updates.
- On POST failure: the `tempId` is removed from both collections via functional updates.

The `tempId` never reaches Supabase, the `/api/lists` endpoint, or any cross-session cache (localStorage writes happen only after it has been swapped for a real id, and rollbacks clean up any temp ids written to persistence during the optimistic window).

**Consumer impact:** only the modal's checkmark renderer reads `selectedListIds`. It matches list ids against the entries in `userLists`, which also carry the temp id during the optimistic window, so the UI remains internally consistent.

### 2. Revised `createList` flow

```
on createList(name):
  1. Synchronous validation (duplicate name, empty name, list limit).
     Failures: setError(msg) for inline banner OR setShowListUpgradeModal(true).
     No async work; no temp id created.
  2. tempId = `temp-${Date.now().toString(36)}`
  3. optimisticUpdateUserLists(userId, prev => [...prev, { id: tempId, name, isSystem: false }])
  4. setSelectedListIds(prev => prev.includes(tempId) ? prev : [...prev, tempId])
  5. updateCachesFunctional(prev => prev.includes(tempId) ? prev : [...prev, tempId])
  6. fetch POST /api/lists

  on success (realList):
    7. optimisticUpdateUserLists(userId, prev =>
         prev.map(l => l.id === tempId ? realList : l)
             .sort((a, b) => a.name.localeCompare(b.name)))
    8. setSelectedListIds(prev => prev.map(id => id === tempId ? realList.id : id))
    9. updateCachesFunctional(prev => prev.map(id => id === tempId ? realList.id : id))
   10. supabase.from('user_list_items').upsert(makeUpsertRow(userId, realList.id), { onConflict })
   11. on upsert success: onToggleAdd?.(userId, normItemId, realList.id)
   12. on upsert failure:
         emitListToast('List created, but failed to add item. Try again.')
         setSelectedListIds(prev => prev.filter(id => id !== realList.id))
         updateCachesFunctional(prev => prev.filter(id => id !== realList.id))
         // list itself is NOT removed — it was created successfully

  on POST failure (network, 500, other non-403 errors):
    7'. optimisticUpdateUserLists(userId, prev => prev.filter(l => l.id !== tempId))
    8'. setSelectedListIds(prev => prev.filter(id => id !== tempId))
    9'. updateCachesFunctional(prev => prev.filter(id => id !== tempId))
   10'. emitListToast(message || 'Failed to create list')

  on POST 403 (feature_unavailable):
    7''-9''. Same rollback as POST failure.
   10''. setShowListUpgradeModal(true)  // no toast; upgrade modal is the affordance

  on POST 400 (server-side name validation):
   Same rollback. emitListToast('A list with that name already exists.')
```

**Invariant:** every state and cache mutation uses the functional form (`setState(prev => ...)`) or read-modify-write. No step closes over `selectedListIds` as a captured value. This is the entire fix for the race.

### 3. Functional cache helper

Today's `updateCaches(nextSelected: string[])` takes a precomputed array. Two concurrent callers compute from the same stale base and one overwrites the other. Replace with:

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

Both reads (`membershipCache.get`, `getPersistedMembership`) return the latest values at call time rather than closure-captured values. The helper is synchronous, so read-then-write is safe within a single call; the race only existed across async boundaries.

Migrate `toggleList` and `deleteList` to use `updateCachesFunctional`. Both have the same latent race pattern (rapid toggles or a toggle during a delete could drop entries). Migration is mechanical — compute the mutation as a `prev => next` function instead of `nextArray`.

### 4. `ListToastProvider`

New file: `app/components/providers/list-toast-provider.tsx`. Mirrors the structure of [sync-provider.tsx](../../../app/components/providers/sync-provider.tsx).

```ts
'use client';

import { Toast } from '@/app/components/ui/Toast';
import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

type Listener = (message: string) => void;
const listeners = new Set<Listener>();

/**
 * Emit a transient error toast from anywhere in the app.
 * The active ListToastProvider (mounted in layout.tsx) will display it.
 */
export function emitListToast(message: string): void {
  for (const listener of listeners) listener(message);
}

type ToastState = { message: string; id: number } | null;

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
    const timer = setTimeout(() => setToast(null), 4000);
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

**Design notes:**

- The `id` field in `ToastState` increments on every emit so that identical consecutive error messages still retrigger the auto-dismiss effect.
- The subscriber pattern matches `optimisticUpdateUserLists` in [useUserLists.ts:136-154](../../../app/hooks/useUserLists.ts#L136-L154), which is already used for cross-hook optimistic updates in this codebase.
- The provider is mounted once at the app root. Only one provider instance exists in the tree at a time; there is no need for fan-out to multiple listeners.
- The hook (`useListMembership`) imports `emitListToast` directly. No React context plumbing — matches how `optimisticUpdateUserLists` is called from hooks without a context.

**Mounting:** in [app/layout.tsx](../../../app/layout.tsx), wrap alongside `SyncProvider`:

```tsx
<SyncProvider>
  <ListToastProvider>
    <ThemeProvider ...>
      ...
    </ThemeProvider>
  </ListToastProvider>
</SyncProvider>
```

Position inside `SyncProvider` so that the list toast renders above the sync toast if both are visible simultaneously (uncommon but possible). Both use `position: fixed` and the same z-index, so the latter in DOM order wins. Either order is acceptable; placing `ListToastProvider` inside keeps its toasts more prominent.

### 5. Error classification

| Error                                                        | Surface                          | How                                                                 |
| ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------- | --- | ------------------------- |
| Duplicate name (client pre-check)                            | Banner                           | `setError('A list with that name already exists.')`                 |
| Empty/whitespace name (client)                               | (silent; Create button disabled) | —                                                                   |
| Free list limit reached (client)                             | Upgrade modal                    | `setShowListUpgradeModal(true)`                                     |
| POST `/api/lists` network/500                                | Toast                            | `emitListToast(message                                              |     | 'Failed to create list')` |
| POST 403 `feature_unavailable`                               | Upgrade modal                    | `setShowListUpgradeModal(true)`                                     |
| POST 400 server validation (e.g. name collision at DB level) | Toast                            | `emitListToast(message)`                                            |
| `user_list_items` upsert failure after successful create     | Toast                            | `emitListToast('List created, but failed to add item. Try again.')` |
| `toggle_add_failed` / `toggle_remove_failed`                 | Toast                            | `emitListToast('Failed to update lists')`                           |
| `rename_failed`                                              | Toast                            | `emitListToast('Failed to rename list')`                            |
| `delete_failed`                                              | Toast                            | `emitListToast('Failed to delete list')`                            |
| Initial membership load failure                              | Banner                           | `setError(...)` (modal is open; user is still in context)           |

**Rule:** synchronous validation → inline banner. Asynchronous failure → toast. This matches existing patterns in the codebase: `ErrorBanner` for in-form validation ([login](../../../app/login/page.tsx), [signup](../../../app/signup/page.tsx), [AccountPageClient](../../../app/account/AccountPageClient.tsx), [IdentifyClient](../../../app/identify/IdentifyClient.tsx)), `Toast` for background async errors ([sync-provider](../../../app/components/providers/sync-provider.tsx), [SetTabContainer](../../../app/components/set/SetTabContainer.tsx) for search party, [GroupSessionPageClient](../../../app/components/group/GroupSessionPageClient.tsx)).

### 6. Files touched

| File                                                              | Change                                                                                                                                                                                  |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/hooks/useListMembership.ts`                                  | Rewrite `createList` per flow above. Add `updateCachesFunctional`. Migrate `toggleList` and `deleteList` to the functional helper. Replace async `setError` calls with `emitListToast`. |
| `app/components/providers/list-toast-provider.tsx`                | **New.** Provider + `emitListToast` module function.                                                                                                                                    |
| `app/layout.tsx`                                                  | Mount `<ListToastProvider>` inside `<SyncProvider>`.                                                                                                                                    |
| `app/hooks/__tests__/useListMembership.test.ts`                   | **New.** Seven tests (see Testing).                                                                                                                                                     |
| `app/components/providers/__tests__/list-toast-provider.test.tsx` | **New.** Smoke test.                                                                                                                                                                    |

No changes to: `useSetLists`, `useMinifigLists`, `useSetOwnershipState`, `useMinifigOwnershipState`, `CollectionsModals`, `CollectionsModalContent`, `SetOwnershipAndCollectionsRow`, `MinifigOwnershipAndCollectionsRow`, `ErrorBanner`, `/api/lists` route, Supabase schema.

## Testing

### `app/hooks/__tests__/useListMembership.test.ts` (new)

Mock `getSupabaseBrowserClient` with a chained-method stub; mock `fetch` for `/api/lists`; mock `emitListToast` via `vi.mock` on the provider module.

1. **Optimistic checkmark appears synchronously.** Call `createList('My List')` with `fetch` mocked to a never-resolving promise. Assert that `selectedListIds` contains a tempId (`temp-...`) immediately after the call returns, before any microtask flush.

2. **Rapid creation — all IDs present.** Fire `createList('A')`, `createList('B')`, `createList('C')` in immediate succession with all three POSTs returning real uuids `real-a`, `real-b`, `real-c` in order. Assert final `selectedListIds` is `['real-a', 'real-b', 'real-c']` (order not strictly required, but all three present). Assert localStorage membership cache also contains all three.

3. **Rapid creation — out-of-order resolution.** Same as #2 but resolve POSTs in reverse order (`real-c`, `real-b`, `real-a`). Assert all three real ids are present in final state.

4. **POST network failure rollback.** Mock `fetch` to reject. Assert: tempId removed from `selectedListIds`, from `userLists`, from in-memory cache, from localStorage. Assert `emitListToast` called once with a failure message.

5. **POST 403 → upgrade modal.** Mock `fetch` to resolve with 403 and `{ error: 'feature_unavailable' }`. Assert: rollback as in #4; `showListUpgradeModal` is `true`; `emitListToast` NOT called.

6. **POST success, upsert failure.** Mock `fetch` ok; mock Supabase upsert to return `{ error: { message: 'boom' } }`. Assert: the real list persists in `userLists` (user created it); the real id is rolled back from `selectedListIds` and caches; `emitListToast` called with 'List created, but failed to add item...' message.

7. **Rapid toggle race.** With a list already selected, call `toggleList(id)` twice in immediate succession (remove, then add back). Assert final `selectedListIds` contains the id. Simulates the same functional-update correctness for `toggleList` that #2 covers for `createList`.

### `app/components/providers/__tests__/list-toast-provider.test.tsx` (new)

1. Render `ListToastProvider` with a child. Call `emitListToast('Test error')`. Assert a toast with that text renders. Advance fake timers 4000ms. Assert toast is removed.
2. Call `emitListToast('First')`, then `emitListToast('Second')` within the dismiss window. Assert the latest message is shown (id-based retrigger works).

## Open questions

None. Design is internally consistent with the existing codebase patterns and requires no external coordination.

## Risks and mitigations

- **Temp id leaking into persistence.** Mitigated by the rollback paths and by the fact that localStorage writes in the optimistic window contain temp ids only transiently; any failure path removes them before the next render. Tests #4, #5, #6 verify this.
- **Modal consumer reads `selectedListIds` mid-swap.** Step 7 (swap in `userLists`) and step 8 (swap in `selectedListIds`) happen in the same synchronous callback after POST success. React batches the updates; the modal never observes a state where `userLists` has real id but `selectedListIds` has temp id (or vice versa) across a render.
- **`emitListToast` called before provider mounts.** Listeners set is empty → no-op. Acceptable; this only happens during SSR or before hydration, neither of which matches a real user action.
- **Double-mount of provider (e.g. React strict mode).** The listener set uses `.add` and cleanup removes only the specific listener registered by that effect. Safe.
