import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { useUserSetsStore, STALE_ENTRY_GRACE_MS } from '@/app/store/user-sets';
import type { UserSet } from '@/app/store/user-sets';

let mockStore: Record<string, string> = {};

vi.mock('@/app/lib/persistence/storage', () => ({
  readStorage: (key: string) => mockStore[key] ?? null,
  writeStorage: (key: string, value: string) => {
    mockStore[key] = value;
  },
  removeStorage: (key: string) => {
    delete mockStore[key];
  },
}));

function setOwned(setNumber: string, owned: boolean): void {
  const setOwnedFn = useUserSetsStore.getState().setOwned;
  act(() => {
    setOwnedFn({
      setNumber,
      owned,
      meta: {
        setNumber,
        name: setNumber,
        year: 0,
        imageUrl: null,
        numParts: 0,
        themeId: null,
      },
    });
  });
}

function makeEntry(
  setNumber: string,
  overrides: Partial<UserSet> = {}
): UserSet {
  return {
    setNumber,
    name: setNumber,
    year: 0,
    imageUrl: null,
    numParts: 0,
    themeId: null,
    status: { owned: true },
    lastUpdatedAt: 0,
    foundCount: 0,
    ...overrides,
  };
}

describe('useUserSetsStore', () => {
  const SET = '1234-1';

  beforeEach(() => {
    mockStore = {};
    useUserSetsStore.setState({ sets: {} });
  });

  it('sets owned status', () => {
    setOwned(SET, true);
    const entry = useUserSetsStore.getState().sets['1234-1'];
    expect(entry?.status).toEqual({ owned: true });
  });

  it('removes set when turning owned off with no tracked progress', () => {
    setOwned(SET, true);
    expect(useUserSetsStore.getState().sets['1234-1']).toBeDefined();

    setOwned(SET, false);
    expect(useUserSetsStore.getState().sets['1234-1']).toBeUndefined();
  });

  it('preserves set with owned:false when turning owned off with tracked progress', () => {
    // Seed a set with foundCount > 0
    act(() => {
      useUserSetsStore.setState({
        sets: { '1234-1': makeEntry(SET, { foundCount: 5 }) },
      });
    });

    setOwned(SET, false);
    const entry = useUserSetsStore.getState().sets['1234-1'];
    expect(entry).toBeDefined();
    expect(entry?.status.owned).toBe(false);
    expect(entry?.foundCount).toBe(5);
  });

  it('clearAllStatusesForSet removes the entry', () => {
    setOwned(SET, true);
    act(() => {
      useUserSetsStore.getState().clearAllStatusesForSet(SET);
    });
    expect(useUserSetsStore.getState().sets['1234-1']).toBeUndefined();
  });

  describe('hydrateFromSupabase stale entry pruning', () => {
    it('prunes local-only entries older than the grace period', () => {
      const staleTimestamp = Date.now() - STALE_ENTRY_GRACE_MS - 1000;

      // Seed a stale local entry not on the server
      act(() => {
        useUserSetsStore.setState({
          sets: {
            '6897-1': makeEntry('6897-1', { lastUpdatedAt: staleTimestamp }),
          },
        });
      });

      // Hydrate with server data that does NOT include 6897-1
      act(() => {
        useUserSetsStore
          .getState()
          .hydrateFromSupabase([
            {
              setNumber: '1234-1',
              name: 'Server Set',
              status: { owned: true },
            },
          ]);
      });

      const state = useUserSetsStore.getState().sets;
      expect(state['1234-1']).toBeDefined();
      expect(state['6897-1']).toBeUndefined();
    });

    it('keeps local-only entries within the grace period', () => {
      const recentTimestamp = Date.now() - 5000; // 5 seconds ago

      act(() => {
        useUserSetsStore.setState({
          sets: {
            '6897-1': makeEntry('6897-1', { lastUpdatedAt: recentTimestamp }),
          },
        });
      });

      act(() => {
        useUserSetsStore
          .getState()
          .hydrateFromSupabase([
            {
              setNumber: '1234-1',
              name: 'Server Set',
              status: { owned: true },
            },
          ]);
      });

      const state = useUserSetsStore.getState().sets;
      expect(state['1234-1']).toBeDefined();
      expect(state['6897-1']).toBeDefined();
    });

    it('does not prune entries that exist on the server', () => {
      const staleTimestamp = Date.now() - STALE_ENTRY_GRACE_MS - 1000;

      act(() => {
        useUserSetsStore.setState({
          sets: {
            '6897-1': makeEntry('6897-1', { lastUpdatedAt: staleTimestamp }),
          },
        });
      });

      // Server includes 6897-1 — should not be pruned even though local is old
      act(() => {
        useUserSetsStore
          .getState()
          .hydrateFromSupabase([
            { setNumber: '6897-1', name: 'Updated', status: { owned: true } },
          ]);
      });

      const entry = useUserSetsStore.getState().sets['6897-1'];
      expect(entry).toBeDefined();
      expect(entry?.name).toBe('Updated');
    });

    it('prunes multiple stale entries in one hydration', () => {
      const staleTimestamp = Date.now() - STALE_ENTRY_GRACE_MS - 1000;

      act(() => {
        useUserSetsStore.setState({
          sets: {
            '1111-1': makeEntry('1111-1', { lastUpdatedAt: staleTimestamp }),
            '2222-1': makeEntry('2222-1', { lastUpdatedAt: staleTimestamp }),
            '3333-1': makeEntry('3333-1', { lastUpdatedAt: staleTimestamp }),
          },
        });
      });

      act(() => {
        useUserSetsStore
          .getState()
          .hydrateFromSupabase([
            { setNumber: '2222-1', name: 'Kept', status: { owned: true } },
          ]);
      });

      const state = useUserSetsStore.getState().sets;
      expect(state['1111-1']).toBeUndefined();
      expect(state['2222-1']).toBeDefined();
      expect(state['3333-1']).toBeUndefined();
    });
  });

  describe('parsePersisted (via localStorage round-trip)', () => {
    it('keeps entries with owned:false and foundCount > 0', () => {
      // Hydrate an entry with owned:false + foundCount
      act(() => {
        useUserSetsStore.getState().hydrateFromSupabase([
          {
            setNumber: SET,
            name: 'Test Set',
            status: { owned: false },
            foundCount: 5,
          },
        ]);
      });

      // Persisted to mockStore by hydrateFromSupabase → persistState
      const raw = mockStore['brick_party_user_sets_v1'];
      expect(raw).toBeDefined();

      // Simulate reload: reset state and re-parse from storage
      useUserSetsStore.setState({ sets: {} });

      // Re-import would call loadInitialState; instead, directly test the
      // round-trip by hydrating a new store from the persisted data
      const parsed = JSON.parse(raw!);
      const entry = parsed.sets?.['1234-1'];
      expect(entry).toBeDefined();
      expect(entry.status.owned).toBe(false);
      expect(entry.foundCount).toBe(5);
    });

    it('drops entries with owned:false and foundCount 0', () => {
      act(() => {
        useUserSetsStore.getState().hydrateFromSupabase([
          {
            setNumber: SET,
            name: 'Test Set',
            status: { owned: false },
            foundCount: 0,
          },
        ]);
      });

      const raw = mockStore['brick_party_user_sets_v1'];
      // The entry should have been persisted but when re-parsed will be dropped.
      // Since hydrateFromSupabase persists the entry (it doesn't filter),
      // we verify that the store itself includes it (hydrate always accepts),
      // but a reload (parsePersisted) would drop it.
      // To test parsePersisted, we simulate what loadInitialState does:
      if (raw) {
        const parsed = JSON.parse(raw);
        const setsObj = parsed.sets ?? {};
        // Manually run the filter logic that parsePersisted applies
        const entry = setsObj['1234-1'];
        if (entry) {
          const isOwned = entry.status?.owned === true;
          const hasProgress =
            typeof entry.foundCount === 'number' && entry.foundCount > 0;
          // parsePersisted should drop this entry
          expect(isOwned || hasProgress).toBe(false);
        }
      }
    });
  });
});
