import { describe, it, expect, vi } from 'vitest';

// Mock dependencies that the module imports at the top level
vi.mock('@/app/lib/supabaseClient', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

vi.mock('@/app/hooks/useSupabaseUser', () => ({
  useSupabaseUser: () => ({ user: null }),
}));

vi.mock('@/app/lib/localDb', () => ({
  getPartiallyCompleteSets: vi.fn(),
  getTotalPartsForSets: vi.fn(),
  getCachedSetSummary: vi.fn(),
}));

vi.mock('@/app/store/owned', () => ({
  flushPendingWritesAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/app/store/recent-sets', () => ({
  getRecentSets: vi.fn(() => []),
}));

import { mergeLocalAndCloud } from '../useCompletionStats';
import type { SetCompletionStats } from '@/app/lib/localDb';

type CloudSetMeta = {
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
};

describe('mergeLocalAndCloud', () => {
  it('prefers local totalParts over rb_sets.num_parts', () => {
    const localStats: SetCompletionStats[] = [
      { setNumber: '75192-1', ownedCount: 100, totalParts: 500 },
    ];
    const cloudOwned = new Map([['75192-1', 80]]);
    const cloudMeta = new Map<string, CloudSetMeta>([
      [
        '75192-1',
        {
          name: 'Millennium Falcon',
          year: 2017,
          imageUrl: null,
          numParts: 480,
          themeId: 1,
        },
      ],
    ]);

    const result = mergeLocalAndCloud(
      localStats,
      cloudOwned,
      cloudMeta,
      new Map()
    );

    // Local totalParts (500) should be used, not cloudMeta numParts (480)
    expect(result).toEqual([
      { setNumber: '75192-1', ownedCount: 100, totalParts: 500 },
    ]);
  });

  it('uses localTotalParts for cloud-only sets when available', () => {
    const localStats: SetCompletionStats[] = [];
    const cloudOwned = new Map([['10295-1', 50]]);
    const cloudMeta = new Map<string, CloudSetMeta>([
      [
        '10295-1',
        {
          name: 'Porsche',
          year: 2021,
          imageUrl: null,
          numParts: 1400,
          themeId: 2,
        },
      ],
    ]);
    const localTotalParts = new Map([['10295-1', 1380]]);

    const result = mergeLocalAndCloud(
      localStats,
      cloudOwned,
      cloudMeta,
      localTotalParts
    );

    // Should use localTotalParts (1380) instead of meta.numParts (1400)
    expect(result).toEqual([
      { setNumber: '10295-1', ownedCount: 50, totalParts: 1380 },
    ]);
  });

  it('falls back to meta.numParts for cloud-only sets without local cache', () => {
    const localStats: SetCompletionStats[] = [];
    const cloudOwned = new Map([['10295-1', 50]]);
    const cloudMeta = new Map<string, CloudSetMeta>([
      [
        '10295-1',
        {
          name: 'Porsche',
          year: 2021,
          imageUrl: null,
          numParts: 1400,
          themeId: 2,
        },
      ],
    ]);

    const result = mergeLocalAndCloud(
      localStats,
      cloudOwned,
      cloudMeta,
      new Map()
    );

    expect(result).toEqual([
      { setNumber: '10295-1', ownedCount: 50, totalParts: 1400 },
    ]);
  });

  it('includes complete sets and caps ownedCount at totalParts', () => {
    const localStats: SetCompletionStats[] = [
      { setNumber: '75192-1', ownedCount: 500, totalParts: 500 }, // Complete
      { setNumber: '10295-1', ownedCount: 100, totalParts: 200 }, // Partial
      { setNumber: '42151-1', ownedCount: 85, totalParts: 79 }, // Over-owned (raw)
    ];

    const result = mergeLocalAndCloud(localStats, null, new Map(), new Map());

    expect(result).toEqual([
      { setNumber: '75192-1', ownedCount: 500, totalParts: 500 },
      { setNumber: '10295-1', ownedCount: 100, totalParts: 200 },
      { setNumber: '42151-1', ownedCount: 79, totalParts: 79 },
    ]);
  });

  it('prefers local ownedCount over cloud when catalog data available', () => {
    const localStats: SetCompletionStats[] = [
      { setNumber: '75192-1', ownedCount: 50, totalParts: 500 },
    ];
    // Cloud has a higher (stale/uncapped) count — local is authoritative
    const cloudOwned = new Map([['75192-1', 80]]);

    const result = mergeLocalAndCloud(
      localStats,
      cloudOwned,
      new Map(),
      new Map()
    );

    expect(result).toEqual([
      { setNumber: '75192-1', ownedCount: 50, totalParts: 500 },
    ]);
  });

  it('uses cloud ownedCount when local lacks catalog data', () => {
    const localStats: SetCompletionStats[] = [
      { setNumber: '75192-1', ownedCount: 50, totalParts: 0 },
    ];
    const cloudOwned = new Map([['75192-1', 80]]);

    const result = mergeLocalAndCloud(
      localStats,
      cloudOwned,
      new Map(),
      new Map()
    );

    // totalParts is 0 so no catalog data — cloud count used, but
    // filtered out because totalParts === 0
    expect(result).toEqual([]);
  });

  it('skips cloud-only sets with no metadata at all', () => {
    const localStats: SetCompletionStats[] = [];
    const cloudOwned = new Map([['99999-1', 10]]);

    const result = mergeLocalAndCloud(
      localStats,
      cloudOwned,
      new Map(),
      new Map()
    );

    expect(result).toEqual([]);
  });
});
