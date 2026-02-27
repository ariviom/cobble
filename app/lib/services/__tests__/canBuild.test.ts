import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

vi.mock('@/lib/metrics', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockRpc = vi.fn();

vi.mock('@/app/lib/supabaseServiceRoleClient', () => ({
  getSupabaseServiceRoleClient: () => ({ rpc: mockRpc }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { findBuildableSets, findGapClosers } from '../canBuild';
import type { CanBuildFilters } from '../canBuild';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-abc-123';

const defaultFilters: CanBuildFilters = {
  minParts: 10,
  maxParts: 500,
  minCoverage: 80,
  theme: null,
  excludeMinifigs: false,
  page: 1,
  limit: 20,
};

function buildableRow(overrides: Record<string, unknown> = {}) {
  return {
    set_num: '75192-1',
    name: 'Millennium Falcon',
    year: 2017,
    image_url: 'https://cdn.example.com/75192.jpg',
    num_parts: 7541,
    theme_id: 158,
    theme_name: 'Star Wars',
    coverage_pct: 92.5,
    total_count: 42,
    ...overrides,
  };
}

function gapRow(overrides: Record<string, unknown> = {}) {
  return {
    set_num: '10270-1',
    name: 'Bookshop',
    image_url: 'https://cdn.example.com/10270.jpg',
    num_parts: 2504,
    coverage_gain_pct: 3.2,
    missing_count: 15,
    total_count: 200,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('findBuildableSets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes filter params to RPC and maps rows correctly', async () => {
    const rows = [
      buildableRow(),
      buildableRow({
        set_num: '10294-1',
        name: 'Titanic',
        coverage_pct: 85.0,
        total_count: 42,
      }),
    ];

    mockRpc
      .mockResolvedValueOnce({ data: rows, error: null }) // find_buildable_sets
      .mockResolvedValueOnce({ data: 137, error: null }); // get_user_total_pieces

    const result = await findBuildableSets(TEST_USER_ID, defaultFilters);

    // Verify find_buildable_sets was called with correct params
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'find_buildable_sets', {
      p_user_id: TEST_USER_ID,
      p_min_parts: 10,
      p_max_parts: 500,
      p_min_coverage: 80,
      p_theme: null,
      p_exclude_minifigs: false,
      p_limit: 20,
      p_offset: 0,
    });

    // Verify get_user_total_pieces was called
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'get_user_total_pieces', {
      p_user_id: TEST_USER_ID,
    });

    // Verify result shape
    expect(result.sets).toHaveLength(2);
    expect(result.total).toBe(42);
    expect(result.totalPieces).toBe(137);

    // Verify row mapping (snake_case → camelCase)
    expect(result.sets[0]).toEqual({
      setNum: '75192-1',
      name: 'Millennium Falcon',
      year: 2017,
      imageUrl: 'https://cdn.example.com/75192.jpg',
      numParts: 7541,
      themeId: 158,
      themeName: 'Star Wars',
      coveragePct: 92.5,
    });
  });

  it('returns empty results when RPC returns null', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: null }) // find_buildable_sets
      .mockResolvedValueOnce({ data: null, error: null }); // get_user_total_pieces

    const result = await findBuildableSets(TEST_USER_ID, defaultFilters);

    expect(result.sets).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPieces).toBe(0);
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'relation "user_set_parts" does not exist' },
    });

    await expect(
      findBuildableSets(TEST_USER_ID, defaultFilters)
    ).rejects.toThrow('relation "user_set_parts" does not exist');
  });
});

describe('findGapClosers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns top gap closer sets mapped correctly', async () => {
    const rows = [
      gapRow({ set_num: '10270-1', coverage_gain_pct: 3.2 }),
      gapRow({
        set_num: '10255-1',
        name: 'Assembly Square',
        coverage_gain_pct: 2.1,
      }),
      gapRow({
        set_num: '10278-1',
        name: 'Police Station',
        coverage_gain_pct: 1.5,
      }),
    ];

    mockRpc.mockResolvedValueOnce({ data: rows, error: null });

    const result = await findGapClosers(TEST_USER_ID, '75192-1');

    // Verify RPC call
    expect(mockRpc).toHaveBeenCalledWith('find_gap_closers', {
      p_user_id: TEST_USER_ID,
      p_target_set_num: '75192-1',
    });

    // Verify result shape
    expect(result.targetSetNum).toBe('75192-1');
    expect(result.missingPartsCount).toBe(15);
    expect(result.totalPartsCount).toBe(200);
    expect(result.gaps).toHaveLength(3);

    // Verify row mapping
    expect(result.gaps[0]).toEqual({
      setNum: '10270-1',
      name: 'Bookshop',
      imageUrl: 'https://cdn.example.com/10270.jpg',
      numParts: 2504,
      coverageGainPct: 3.2,
    });
  });

  it('throws on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'function find_gap_closers does not exist' },
    });

    await expect(findGapClosers(TEST_USER_ID, '75192-1')).rejects.toThrow(
      'function find_gap_closers does not exist'
    );
  });
});
