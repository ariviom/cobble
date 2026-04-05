import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('preserves all selections when multiple creates resolve in order', async () => {
    const pending: Array<(res: Response) => void> = [];
    fetchMock.mockImplementation(
      () => new Promise<Response>(resolve => pending.push(resolve))
    );

    const { result } = renderHook(() =>
      useListMembership('set', '21034-1', 'set_num')
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
      useListMembership('set', '10497-1', 'set_num')
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
});

describe('useListMembership — toggleList race safety', () => {
  it('preserves final state when add and remove fire in quick succession', async () => {
    // Initial membership: already in list 'list-a'
    mockMembershipResult = {
      data: [{ list_id: 'list-a' }],
      error: null,
    };
    mockUpsertResult = { data: null, error: null };
    mockDeleteResult = { data: null, error: null };

    // Distinct itemId avoids module-level persistedRoot leakage from the
    // createList test above (which leaves behind a 'real-1' entry for
    // '75192-1' when its trailing fetch microtask resolves).
    const { result } = renderHook(() =>
      useListMembership('set', '10188-1', 'set_num')
    );

    await waitFor(() => {
      expect(result.current.selectedListIds).toEqual(['list-a']);
    });

    // Rapidly remove then re-add. React batches updates inside a single
    // `act`, so splitting into two acts mirrors two separate click events
    // and is what exercises the second call seeing the updated state.
    act(() => {
      result.current.toggleList('list-a'); // remove
    });
    act(() => {
      result.current.toggleList('list-a'); // add back
    });

    // Let pending supabase .then callbacks resolve
    await waitFor(() => {
      expect(result.current.selectedListIds).toEqual(['list-a']);
    });
  });
});
