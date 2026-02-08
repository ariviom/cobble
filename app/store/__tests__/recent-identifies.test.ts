'use client';

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  addRecentIdentify,
  clearRecentIdentifies,
  getRecentIdentifies,
} from '@/app/store/recent-identifies';

let store: Record<string, string> = {};

vi.mock('@/app/lib/persistence/storage', () => ({
  readStorage: (key: string) => store[key] ?? null,
  writeStorage: (key: string, value: string) => {
    store[key] = value;
  },
  removeStorage: (key: string) => {
    delete store[key];
  },
}));

beforeEach(() => {
  store = {};
});

describe('recent-identifies store', () => {
  it('adds and orders entries by lastIdentifiedAt desc', () => {
    addRecentIdentify({
      partNum: '3001',
      name: 'Brick 2x4',
      imageUrl: 'https://example.com/3001.png',
      isMinifig: false,
      setsFound: 5,
      source: 'camera',
    });
    addRecentIdentify({
      partNum: '3003',
      name: 'Brick 2x2',
      imageUrl: 'https://example.com/3003.png',
      isMinifig: false,
      setsFound: 10,
      source: 'camera',
    });

    const recents = getRecentIdentifies();
    expect(recents).toHaveLength(2);
    expect(recents[0]?.partNum).toBe('3003');
    expect(recents[1]?.partNum).toBe('3001');
  });

  it('deduplicates by partNum (case-insensitive) and bumps timestamp', () => {
    addRecentIdentify({
      partNum: '3001',
      name: 'Brick 2x4',
      imageUrl: null,
      isMinifig: false,
      setsFound: 5,
      source: 'text',
    });
    addRecentIdentify({
      partNum: '3003',
      name: 'Brick 2x2',
      imageUrl: null,
      isMinifig: false,
      setsFound: 10,
      source: 'text',
    });
    // Re-add 3001 with different case — should dedup and move to top
    addRecentIdentify({
      partNum: '3001',
      name: 'Brick 2x4 Updated',
      imageUrl: 'https://example.com/3001-v2.png',
      isMinifig: false,
      setsFound: 8,
      source: 'text',
    });

    const recents = getRecentIdentifies();
    expect(recents).toHaveLength(2);
    expect(recents[0]?.partNum).toBe('3001');
    expect(recents[0]?.name).toBe('Brick 2x4 Updated');
    expect(recents[0]?.setsFound).toBe(8);
    expect(recents[1]?.partNum).toBe('3003');
  });

  it('respects max limit of 20', () => {
    for (let i = 0; i < 25; i++) {
      addRecentIdentify({
        partNum: `part-${i}`,
        name: `Part ${i}`,
        imageUrl: null,
        isMinifig: false,
        setsFound: i,
        source: 'camera',
      });
    }

    const recents = getRecentIdentifies();
    expect(recents).toHaveLength(20);
    // Most recent should be last added
    expect(recents[0]?.partNum).toBe('part-24');
  });

  it('uses partNum as fallback when name is empty', () => {
    addRecentIdentify({
      partNum: '6129c03',
      name: '',
      imageUrl: null,
      isMinifig: false,
      setsFound: 0,
      source: 'text',
    });

    const recents = getRecentIdentifies();
    expect(recents).toHaveLength(1);
    expect(recents[0]?.partNum).toBe('6129c03');
    expect(recents[0]?.name).toBe('6129c03');
  });

  it('preserves entries with empty name when overwritten', () => {
    // First add with a good name (from image search)
    addRecentIdentify({
      partNum: '6129c03',
      name: 'Dragon, Classic',
      imageUrl: 'https://example.com/dragon.png',
      isMinifig: false,
      setsFound: 5,
      source: 'camera',
    });
    // Then overwrite with empty name (from failed part lookup)
    addRecentIdentify({
      partNum: '6129c03',
      name: '',
      imageUrl: null,
      isMinifig: false,
      setsFound: 0,
      source: 'text',
    });

    const recents = getRecentIdentifies();
    expect(recents).toHaveLength(1);
    // Entry should still exist (not filtered out), with partNum as fallback name
    expect(recents[0]?.partNum).toBe('6129c03');
    expect(recents[0]?.name).toBe('6129c03');
  });

  it('filters by source when specified', () => {
    addRecentIdentify({
      partNum: '3001',
      name: 'Brick 2x4',
      imageUrl: null,
      isMinifig: false,
      setsFound: 5,
      source: 'camera',
    });
    addRecentIdentify({
      partNum: '3003',
      name: 'Brick 2x2',
      imageUrl: null,
      isMinifig: false,
      setsFound: 10,
      source: 'text',
    });

    expect(getRecentIdentifies()).toHaveLength(2);
    expect(getRecentIdentifies('camera')).toHaveLength(1);
    expect(getRecentIdentifies('camera')[0]?.partNum).toBe('3001');
    expect(getRecentIdentifies('text')).toHaveLength(1);
    expect(getRecentIdentifies('text')[0]?.partNum).toBe('3003');
  });

  it('clearRecentIdentifies empties the list', () => {
    addRecentIdentify({
      partNum: '3001',
      name: 'Brick 2x4',
      imageUrl: null,
      isMinifig: false,
      setsFound: 5,
      source: 'camera',
    });

    expect(getRecentIdentifies()).toHaveLength(1);
    clearRecentIdentifies();
    expect(getRecentIdentifies()).toHaveLength(0);
  });
});
