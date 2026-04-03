import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage (jsdom's implementation may not be available in this module context)
const localStorageStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageStore.get(key) ?? null,
  setItem: (key: string, val: string) => localStorageStore.set(key, val),
  removeItem: (key: string) => localStorageStore.delete(key),
  clear: () => localStorageStore.clear(),
  get length() {
    return localStorageStore.size;
  },
  key: (i: number) => Array.from(localStorageStore.keys())[i] ?? null,
});

// Mock localDb before importing owned store
const mockSetOwnedForSet = vi.fn<
  (setNumber: string, data: Record<string, number>) => Promise<void>
>(() => Promise.resolve());
const mockGetOwnedForSet = vi.fn<
  (setNumber: string) => Promise<Record<string, number>>
>(() => Promise.resolve({}));
const mockIsIndexedDBAvailable = vi.fn(() => true);

vi.mock('@/app/lib/localDb', () => ({
  setOwnedForSet: (setNumber: string, data: Record<string, number>) =>
    mockSetOwnedForSet(setNumber, data),
  getOwnedForSet: (setNumber: string) => mockGetOwnedForSet(setNumber),
  isIndexedDBAvailable: () => mockIsIndexedDBAvailable(),
}));

// Import after mocks are set up
const { useOwnedStore } = await import('@/app/store/owned');

/** Flush microtask queue so scheduled writes execute */
async function flushMicrotasks() {
  await new Promise<void>(resolve => queueMicrotask(resolve));
  // Give the async flushWriteToIndexedDB a tick to complete
  await new Promise(resolve => setTimeout(resolve, 0));
}

describe('useOwnedStore', () => {
  beforeEach(async () => {
    localStorageStore.clear();
    mockSetOwnedForSet.mockClear();
    mockGetOwnedForSet.mockClear();
    mockIsIndexedDBAvailable.mockReturnValue(true);
    mockSetOwnedForSet.mockResolvedValue(undefined);

    // Reset the store module state via dynamic import of resetOwnedCache
    const { resetOwnedCache } = await import('@/app/store/owned');
    await resetOwnedCache();
    mockSetOwnedForSet.mockClear(); // Clear calls from reset flush
  });

  it('defaults owned quantity to 0 and can set values', () => {
    const setNumber = '1234-1';
    const key = '3001:1';

    const initial = useOwnedStore.getState();
    expect(initial.getOwned(setNumber, key)).toBe(0);

    act(() => {
      useOwnedStore.getState().setOwned(setNumber, key, 3);
    });

    const next = useOwnedStore.getState();
    expect(next.getOwned(setNumber, key)).toBe(3);
  });

  it('coalesces multiple synchronous writes into a single IndexedDB call', async () => {
    const setNumber = '9999-1';

    act(() => {
      const store = useOwnedStore.getState();
      store.setOwned(setNumber, '3001:1', 2);
      store.setOwned(setNumber, '3002:5', 4);
      store.setOwned(setNumber, '3003:0', 1);
    });

    // All three updates happened synchronously — only one microtask should be scheduled
    await flushMicrotasks();

    expect(mockSetOwnedForSet).toHaveBeenCalledTimes(1);
    expect(mockSetOwnedForSet).toHaveBeenCalledWith(setNumber, {
      '3001:1': 2,
      '3002:5': 4,
      '3003:0': 1,
    });
  });

  it('sets _storageAvailable to false after consecutive write failures', async () => {
    const setNumber = '5555-1';

    mockSetOwnedForSet.mockRejectedValue(new Error('IndexedDB write failed'));

    // Trigger 3 consecutive failures (MAX_CONSECUTIVE_FAILURES)
    for (let i = 0; i < 3; i++) {
      act(() => {
        useOwnedStore.getState().setOwned(setNumber, `part:${i}`, i + 1);
      });
      await flushMicrotasks();
    }

    expect(useOwnedStore.getState()._storageAvailable).toBe(false);
  });

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
    expect(useOwnedStore.getState()._hydratedSets).not.toHaveProperty(
      setNumber
    );
  });

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
    flushAllPendingWritesForTest!();
    await flushMicrotasks();

    // localStorage should still have the data
    const raw = localStorage.getItem('brick_party_pending_owned');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed[setNumber]).toBeDefined();
    expect(parsed[setNumber]['p:extra']).toBe(10);
  });

  it('resets failure count on successful write', async () => {
    const setNumber = '7777-1';

    // Fail twice
    mockSetOwnedForSet.mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 2; i++) {
      act(() => {
        useOwnedStore.getState().setOwned(setNumber, `part:${i}`, i + 1);
      });
      await flushMicrotasks();
    }

    // Succeed — should reset the counter
    mockSetOwnedForSet.mockResolvedValue(undefined);
    act(() => {
      useOwnedStore.getState().setOwned(setNumber, 'part:ok', 5);
    });
    await flushMicrotasks();

    // Fail twice more — should not hit threshold since counter was reset
    mockSetOwnedForSet.mockRejectedValue(new Error('fail again'));
    for (let i = 0; i < 2; i++) {
      act(() => {
        useOwnedStore.getState().setOwned(setNumber, `part:retry:${i}`, i + 1);
      });
      await flushMicrotasks();
    }

    expect(useOwnedStore.getState()._storageAvailable).toBe(true);
  });
});
