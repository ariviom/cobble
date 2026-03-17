# Owned Hydration Race Condition Fix

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix race condition where `resetOwnedCache()` aborts in-flight hydration on every authenticated page load, causing the UI to show 0 owned pieces until the user navigates away and back.

**Architecture:** Three targeted fixes: (1) eliminate the spurious `resetOwnedCache` call on the `null → userId` auth hydration transition, (2) make `hydrateFromIndexedDB` self-healing when epoch-aborted so it can never get stuck, (3) fix a localStorage safety-net race in `flushAllPendingWrites` that clears the backup when `storageAvailable === false`.

**Tech Stack:** TypeScript, Zustand, Dexie/IndexedDB, Vitest

---

## File Map

| File                                        | Action                                            | Purpose                                                                                      |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `app/lib/sync/SyncWorker.ts`                | Modify (lines 137-157)                            | Skip `resetOwnedCache` on `null → userId` transition                                         |
| `app/store/owned.ts`                        | Modify (lines 142-150, 199-217, 237-259, 354-426) | Self-healing hydration + flushAll localStorage fix + resetOwnedCache version bump            |
| `app/hooks/useSupabaseOwned.ts`             | Modify (lines 62-80)                              | Add `_version` to hydration effect deps so epoch-abort `_version` bump re-triggers hydration |
| `app/hooks/useOwnedSnapshot.ts`             | Modify (lines 28-31)                              | Add `isHydrated` guard + `_version` dep to hydration effect                                  |
| `app/lib/sync/__tests__/SyncWorker.test.ts` | Modify                                            | Add test for null→userId skip, update existing tests                                         |
| `app/store/__tests__/owned.test.ts`         | Modify                                            | Add tests for epoch-abort recovery, flushAll LS race                                         |

---

### Task 1: Skip `resetOwnedCache` on null → userId transition

The `null → userId` transition happens on every page load when auth hydrates. It's not a real user switch — no cache clearing is needed. Only reset when switching between two different real user IDs.

**Files:**

- Modify: `app/lib/sync/SyncWorker.ts:137-157`
- Test: `app/lib/sync/__tests__/SyncWorker.test.ts`

- [ ] **Step 1: Write failing test — null→userId should not reset cache**

In `app/lib/sync/__tests__/SyncWorker.test.ts`, add a test in the `setUserId` describe block:

```typescript
it('does not reset owned cache on null → userId transition (auth hydration)', async () => {
  const { resetOwnedCache } = vi.mocked(await import('@/app/store/owned'));
  worker = new SyncWorker();
  await worker.init();
  await flushPromises();

  resetOwnedCache.mockClear();
  await worker.setUserId('user-123');
  await flushPromises();

  expect(resetOwnedCache).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write failing test — real user switch should reset cache**

```typescript
it('resets owned cache when switching between real user IDs', async () => {
  const { resetOwnedCache } = vi.mocked(await import('@/app/store/owned'));
  worker = new SyncWorker();
  await worker.init();
  await worker.setUserId('user-A');
  await flushPromises();

  resetOwnedCache.mockClear();
  await worker.setUserId('user-B');
  await flushPromises();

  expect(resetOwnedCache).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Write failing test — userId→null (logout) should reset cache**

```typescript
it('resets owned cache on logout (userId → null)', async () => {
  const { resetOwnedCache } = vi.mocked(await import('@/app/store/owned'));
  worker = new SyncWorker();
  await worker.init();
  await worker.setUserId('user-123');
  await flushPromises();

  resetOwnedCache.mockClear();
  await worker.setUserId(null);
  await flushPromises();

  expect(resetOwnedCache).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- --run app/lib/sync/__tests__/SyncWorker.test.ts`
Expected: First test FAILS (resetOwnedCache IS called for null→userId currently)

- [ ] **Step 5: Implement the fix in SyncWorker.setUserId**

In `app/lib/sync/SyncWorker.ts`, change `setUserId`:

```typescript
async setUserId(userId: string | null): Promise<void> {
  const previousUserId = this.userId;
  this.userId = userId;

  // Only reset owned caches on a real user switch (A→B or A→null).
  // The null→userId transition is auth hydration on page load — the
  // data in IndexedDB already belongs to this user, no reset needed.
  const isRealUserSwitch =
    previousUserId !== userId && previousUserId !== null;
  if (isRealUserSwitch) {
    await resetOwnedCache();
  }

  if (this.isAvailable && this.isReady) {
    void setStoredUserId(userId);
  }

  if (userId && this.isReady) {
    void this.performSync();
    void this.updatePendingCount();
    this.startSyncLoop();
  } else {
    this.stopSyncLoop();
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run app/lib/sync/__tests__/SyncWorker.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add app/lib/sync/SyncWorker.ts app/lib/sync/__tests__/SyncWorker.test.ts
git commit -m "fix(sync): skip resetOwnedCache on null→userId auth hydration"
```

---

### Task 2: Make `hydrateFromIndexedDB` self-healing on epoch abort

Defense-in-depth: if `hydrateFromIndexedDB` is aborted by an epoch mismatch (from a legitimate `resetOwnedCache` call like logout→login), it must clean up `hydrationPromises` and bump `_version` so the hydration effect re-fires. Currently the early return skips the `finally` block and leaves stale state.

The `_version` bump alone is not enough — the hydration effects in `useSupabaseOwned.ts` and `useOwnedSnapshot.ts` must also include `_version` in their dependency arrays, otherwise they won't re-fire when `_version` changes.

**Files:**

- Modify: `app/store/owned.ts:354-426`
- Modify: `app/hooks/useSupabaseOwned.ts:62-80`
- Modify: `app/hooks/useOwnedSnapshot.ts:28-31`
- Test: `app/store/__tests__/owned.test.ts`

- [ ] **Step 1: Write failing test — epoch abort triggers re-render**

In `app/store/__tests__/owned.test.ts`:

```typescript
it('bumps _version when hydrateFromIndexedDB is aborted by epoch change', async () => {
  const setNumber = '8888-1';
  mockGetOwnedForSet.mockImplementation(async () => {
    // Simulate resetOwnedCache during hydration read
    const { resetOwnedCache } = await import('@/app/store/owned');
    await resetOwnedCache();
    mockSetOwnedForSet.mockClear(); // clear calls from reset
    return { 'part:1': 5 };
  });

  const versionBefore = useOwnedStore.getState()._version;
  await useOwnedStore.getState().hydrateFromIndexedDB(setNumber);
  const versionAfter = useOwnedStore.getState()._version;

  // Version must have bumped so the hydration effect re-fires
  expect(versionAfter).toBeGreaterThan(versionBefore);
  // Set should NOT be marked as hydrated (data was stale)
  expect(useOwnedStore.getState()._hydratedSets).not.toHaveProperty(setNumber);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/store/__tests__/owned.test.ts`
Expected: FAIL — `_version` is not bumped on epoch abort

- [ ] **Step 3: Implement self-healing in hydrateFromIndexedDB**

In `app/store/owned.ts`, restructure the hydration promise to handle epoch aborts. Replace the inner async function in `hydrateFromIndexedDB`:

```typescript
const hydrationPromise = (async () => {
  const myEpoch = cacheEpoch;

  await reconcilePendingFromLocalStorage();
  if (myEpoch !== cacheEpoch) {
    // Epoch changed during reconcile — abort but ensure we can retry.
    // Bump _version so the effect that called us detects a change and re-fires.
    hydrationPromises.delete(setNumber);
    set(state => ({ ...state, _version: state._version + 1 }));
    return;
  }

  const available = checkStorageAvailable();
  if (!available) {
    if (myEpoch !== cacheEpoch) return;
    hydrationPromises.delete(setNumber);
    set(state => ({
      ...state,
      _storageAvailable: false,
      _hydratedSets: { ...state._hydratedSets, [setNumber]: true as const },
    }));
    return;
  }

  try {
    const indexedDBData = await getOwnedForSet(setNumber);

    if (myEpoch !== cacheEpoch) {
      // Epoch changed during read — abort but allow retry.
      hydrationPromises.delete(setNumber);
      set(state => ({ ...state, _version: state._version + 1 }));
      return;
    }

    cache.set(setNumber, indexedDBData);

    set(state => ({
      ...state,
      _version: state._version + 1,
      _hydratedSets: { ...state._hydratedSets, [setNumber]: true as const },
    }));
  } catch (error) {
    if (myEpoch !== cacheEpoch) {
      hydrationPromises.delete(setNumber);
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      console.warn('[owned] Failed to hydrate from IndexedDB:', error);
    }
    storageAvailable = false;
    set(state => ({
      ...state,
      _storageAvailable: false,
      _hydratedSets: { ...state._hydratedSets, [setNumber]: true as const },
    }));
  } finally {
    hydrationPromises.delete(setNumber);
  }
})();
```

Key changes:

- Every epoch-abort path now calls `hydrationPromises.delete(setNumber)` AND bumps `_version`
- The `finally` block still runs for the try/catch paths, providing belt-and-suspenders cleanup

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/store/__tests__/owned.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Also fix resetOwnedCache to always bump \_version (never reset to 0)**

In `app/store/owned.ts`, change `resetOwnedCache`:

```typescript
export async function resetOwnedCache(): Promise<void> {
  await flushPendingWritesAsync();

  cacheEpoch++;

  cache.clear();
  pendingWrites.clear();
  scheduledMicrotasks.clear();
  consecutiveWriteFailures = 0;
  storageAvailable = null;
  hydrationPromises.clear();
  reconcilePromise = null;

  // Always INCREMENT _version (never reset to 0) so Zustand detects a change
  // even if _hydratedSets was already {}.
  useOwnedStore.setState(state => ({
    _version: state._version + 1,
    _hydratedSets: {},
    _storageAvailable: true,
  }));
}
```

- [ ] **Step 6: Add `_version` to hydration effect deps in useSupabaseOwned**

In `app/hooks/useSupabaseOwned.ts`, subscribe to `_version` and add it to the hydration effect deps:

```typescript
const version = useOwnedStore((state: OwnedState) => state._version);
```

Update the hydration effect:

```typescript
useEffect(() => {
  if (isOwnedHydrated) return;
  void hydrateFromIndexedDB(setNumber);
}, [setNumber, hydrateFromIndexedDB, isOwnedHydrated, version]);
```

The `isOwnedHydrated` guard ensures the extra re-fires from `_version` changes are no-ops after initial hydration — negligible overhead.

- [ ] **Step 7: Add `isHydrated` guard + `_version` dep to useOwnedSnapshot hydration effect**

In `app/hooks/useOwnedSnapshot.ts`, `version` is already subscribed (line 17). Add `isHydrated` guard and `version` dep:

```typescript
const isHydrated = setNumber in hydratedSets;

// Trigger IndexedDB hydration on mount (or retry after epoch abort)
useEffect(() => {
  if (isHydrated) return;
  void hydrateFromIndexedDB(setNumber);
}, [setNumber, hydrateFromIndexedDB, isHydrated, version]);
```

- [ ] **Step 8: Run full test suite**

Run: `npm test -- --run`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add app/store/owned.ts app/hooks/useSupabaseOwned.ts app/hooks/useOwnedSnapshot.ts app/store/__tests__/owned.test.ts
git commit -m "fix(owned): self-healing hydration on epoch abort, always bump _version"
```

---

### Task 3: Fix `flushAllPendingWrites` localStorage race

When `storageAvailable === false`, `flushWriteToIndexedDB` resolves immediately after deleting from `pendingWrites`. The `.then()` callback sees `pendingWrites.size === 0` and clears the localStorage backup that was just saved. Fix: don't clear the localStorage backup from within `flushAllPendingWrites` — only clear it from the normal (non-unload) write path.

**Files:**

- Modify: `app/store/owned.ts:142-150, 199-217`
- Test: `app/store/__tests__/owned.test.ts`

- [ ] **Step 1: Write failing test — flushAll preserves localStorage when storage unavailable**

```typescript
it('flushAllPendingWrites preserves localStorage when storageAvailable is false', async () => {
  const setNumber = '6666-1';

  // Trigger 3 write failures to set storageAvailable = false
  mockSetOwnedForSet.mockRejectedValue(new Error('fail'));
  for (let i = 0; i < 3; i++) {
    act(() => {
      useOwnedStore.getState().setOwned(setNumber, `p:${i}`, i + 1);
    });
    await flushMicrotasks();
  }
  expect(useOwnedStore.getState()._storageAvailable).toBe(false);

  // Add more data while storage is unavailable
  act(() => {
    useOwnedStore.getState().setOwned(setNumber, 'p:extra', 10);
  });

  // Import and call flushAllPendingWrites (simulates page hide)
  const { flushAllPendingWritesForTest } = await import('@/app/store/owned');
  flushAllPendingWritesForTest();
  await flushMicrotasks();

  // localStorage should still have the data
  const raw = localStorage.getItem('brick_party_pending_owned');
  expect(raw).not.toBeNull();
  const parsed = JSON.parse(raw!);
  expect(parsed[setNumber]).toBeDefined();
  expect(parsed[setNumber]['p:extra']).toBe(10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/store/__tests__/owned.test.ts`
Expected: FAIL — localStorage is cleared by the race

- [ ] **Step 3: Implement the fix**

In `app/store/owned.ts`, two changes:

**Change 1:** In `flushWriteToIndexedDB`, when storage is unavailable, do NOT delete from pendingWrites (leave data in place for the localStorage safety net):

```typescript
async function flushWriteToIndexedDB(setNumber: string): Promise<void> {
  const data = pendingWrites.get(setNumber);
  if (!data) return;

  if (!checkStorageAvailable()) {
    // Storage unavailable — keep data in pendingWrites so the
    // localStorage safety net (savePendingToLocalStorage) can capture it.
    // Don't attempt the write or clear the entry.
    return;
  }

  // ... rest unchanged
}
```

**Change 2:** In `flushAllPendingWrites`, don't clear localStorage from the `.then()` — it's an unload handler, the localStorage backup should persist:

```typescript
function flushAllPendingWrites() {
  scheduledMicrotasks.clear();

  // Synchronous safety net — survives even if the page is killed immediately
  savePendingToLocalStorage();

  // Attempt async IndexedDB writes (may not complete on unload).
  // Do NOT clear the localStorage backup from here — it's a safety net
  // for exactly this scenario (page killed before async writes land).
  for (const setNumber of pendingWrites.keys()) {
    flushWriteToIndexedDB(setNumber).catch(() => {
      // Swallow errors on unload — localStorage fallback has us covered
    });
  }
}
```

**Change 3:** Export `flushAllPendingWrites` for testing (named export to avoid changing public API):

```typescript
// Test-only export (tree-shaken in production)
export const flushAllPendingWritesForTest =
  process.env.NODE_ENV !== 'production' ? flushAllPendingWrites : undefined;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run app/store/__tests__/owned.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/store/owned.ts app/store/__tests__/owned.test.ts
git commit -m "fix(owned): preserve localStorage backup in flushAllPendingWrites"
```

---

### Task 4: Type-check and integration verification

- [ ] **Step 1: Run type checker**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run full test suite**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 4: Manual verification notes**

To verify the fix in the browser:

1. Open the app while logged in, navigate to a set with tracked pieces
2. Refresh the page — pieces should appear immediately (no 0 flash)
3. Repeat several times — should be consistent
4. Log out and log back in — set should re-hydrate correctly

- [ ] **Step 5: Final commit if any fixups needed**
