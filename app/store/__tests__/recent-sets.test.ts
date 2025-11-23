'use client';

import { addRecentSet, getRecentSets } from '@/app/store/recent-sets';

vi.mock('@/app/lib/persistence/storage', () => {
  const store: Record<string, string> = {};
  return {
    readStorage: (key: string) => store[key] ?? null,
    writeStorage: (key: string, value: string) => {
      store[key] = value;
    },
  };
});

describe('recent-sets store', () => {
  it('adds and orders recent sets by lastViewedAt', () => {
    addRecentSet({
      setNumber: '1000-1',
      name: 'First',
      year: 1990,
      imageUrl: null,
      numParts: 10,
    });
    addRecentSet({
      setNumber: '2000-1',
      name: 'Second',
      year: 1995,
      imageUrl: null,
      numParts: 20,
    });

    const recents = getRecentSets();
    expect(recents[0]?.setNumber).toBe('2000-1');
    expect(recents[1]?.setNumber).toBe('1000-1');
  });
});



