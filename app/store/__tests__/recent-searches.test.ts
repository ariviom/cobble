'use client';

import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
} from '@/app/store/recent-searches';
import { vi } from 'vitest';

vi.mock('@/app/lib/persistence/storage', () => {
  const store: Record<string, string> = {};
  return {
    readStorage: (key: string) => store[key] ?? null,
    writeStorage: (key: string, value: string) => {
      store[key] = value;
    },
    removeStorage: (key: string) => {
      delete store[key];
    },
  };
});

describe('recent-searches store', () => {
  beforeEach(() => {
    clearRecentSearches();
  });

  it('adds searches and deduplicates by lowercased query', () => {
    addRecentSearch('Pirates');
    addRecentSearch('pirates');
    const searches = getRecentSearches();
    expect(searches).toHaveLength(1);
    // Last search casing is preserved while deduplicating by lowercase key
    expect(searches[0]?.query).toBe('pirates');
  });
});
