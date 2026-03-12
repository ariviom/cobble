import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

// Track all .or() calls so we can assert batching behavior
const orCalls: string[] = [];

const mockRarityRows: Array<{
  part_num: string;
  color_id: number;
  set_count: number;
}> = [];

const mockSupabase = {
  from: (_table: string) => ({
    select: () => ({
      or: (filter: string) => {
        orCalls.push(filter);
        return Promise.resolve({ data: mockRarityRows, error: null });
      },
    }),
  }),
};

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => mockSupabase,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { queryPartRarityBatch } from '../rarity';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('queryPartRarityBatch', () => {
  beforeEach(() => {
    mockRarityRows.length = 0;
    orCalls.length = 0;
  });

  it('returns empty map for empty pairs', async () => {
    const result = await queryPartRarityBatch(mockSupabase as never, []);

    expect(result.size).toBe(0);
    // No queries should have been made
    expect(orCalls).toHaveLength(0);
  });

  it('queries and returns correct map', async () => {
    mockRarityRows.push(
      { part_num: '3001', color_id: 1, set_count: 523 },
      { part_num: '3002', color_id: 5, set_count: 42 }
    );

    const result = await queryPartRarityBatch(mockSupabase as never, [
      { partNum: '3001', colorId: 1 },
      { partNum: '3002', colorId: 5 },
    ]);

    expect(result.size).toBe(2);
    expect(result.get('3001:1')).toBe(523);
    expect(result.get('3002:5')).toBe(42);
  });

  it('batches into groups of 100', async () => {
    // Create 250 pairs to produce 3 batches (100 + 100 + 50)
    const pairs = Array.from({ length: 250 }, (_, i) => ({
      partNum: `part${i}`,
      colorId: i,
    }));

    await queryPartRarityBatch(mockSupabase as never, pairs);

    expect(orCalls).toHaveLength(3);

    // Each batch should have the expected number of entries in the OR filter
    expect(orCalls[0]!.match(/and\(/g)!.length).toBe(100);
    expect(orCalls[1]!.match(/and\(/g)!.length).toBe(100);
    expect(orCalls[2]!.match(/and\(/g)!.length).toBe(50);
  });
});
