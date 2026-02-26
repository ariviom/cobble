import { act } from '@testing-library/react';
import { vi } from 'vitest';
import { useUserSetsStore } from '@/app/store/user-sets';

vi.mock('@/app/lib/persistence/storage', () => {
  let store: Record<string, string> = {};
  return {
    readStorage: (key: string) => store[key] ?? null,
    writeStorage: (key: string, value: string) => {
      store[key] = value;
    },
    removeStorage: (key: string) => {
      delete store[key];
    },
    __resetStore: () => {
      store = {};
    },
  };
});

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

describe('useUserSetsStore', () => {
  const SET = '1234-1';

  beforeEach(async () => {
    const { __resetStore } = await import('@/app/lib/persistence/storage');
    (__resetStore as () => void)();
    useUserSetsStore.setState({ sets: {} });
  });

  it('sets owned status', () => {
    setOwned(SET, true);
    const entry = useUserSetsStore.getState().sets['1234-1'];
    expect(entry?.status).toEqual({ owned: true });
  });

  it('removes set when turning owned off', () => {
    setOwned(SET, true);
    expect(useUserSetsStore.getState().sets['1234-1']).toBeDefined();

    setOwned(SET, false);
    expect(useUserSetsStore.getState().sets['1234-1']).toBeUndefined();
  });

  it('clearAllStatusesForSet removes the entry', () => {
    setOwned(SET, true);
    act(() => {
      useUserSetsStore.getState().clearAllStatusesForSet(SET);
    });
    expect(useUserSetsStore.getState().sets['1234-1']).toBeUndefined();
  });
});
