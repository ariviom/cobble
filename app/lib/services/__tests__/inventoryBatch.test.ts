import type { InventoryRow } from '@/app/components/set/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

const mockGetSetInventoriesLocalBatch =
  vi.fn<() => Promise<Map<string, InventoryRow[]>>>();
vi.mock('@/app/lib/catalog/batchInventory', () => ({
  getSetInventoriesLocalBatch: (...args: unknown[]) =>
    mockGetSetInventoriesLocalBatch(...(args as [])),
}));

// Also mock getSetInventoryLocal since inventory.ts imports it
vi.mock('@/app/lib/catalog', () => ({
  getSetInventoryLocal: vi.fn().mockResolvedValue([]),
}));

const mockGetSetInventory = vi.fn<() => Promise<InventoryRow[]>>();
vi.mock('@/app/lib/rebrickable', () => ({
  getSetInventory: (...args: unknown[]) => mockGetSetInventory(...(args as [])),
}));

vi.mock('@/app/lib/rebrickable/client', () => ({
  rbFetch: vi.fn().mockResolvedValue({ results: [], next: null }),
  rbFetchAbsolute: vi.fn().mockResolvedValue({ results: [], next: null }),
}));

// Supabase mock — tracks chained query builder calls for rb_minifig_parts
type SubpartRow = {
  fig_num: string;
  part_num: string;
  color_id: number;
  quantity: number;
  img_url: string | null;
  rb_parts: { name: string; bl_part_id: string | null };
  rb_colors: { name: string };
};
const mockSubpartRows: SubpartRow[] = [];

const mockRarityRows: Array<{
  part_num: string;
  color_id: number;
  set_count: number;
}> = [];

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: mockSubpartRows, error: null }),
        or: () => Promise.resolve({ data: mockRarityRows, error: null }),
      }),
    }),
  }),
  getCatalogWriteClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

// Identity resolution — return simple deterministic identities
vi.mock('@/app/lib/services/identityResolution', () => ({
  buildResolutionContext: vi.fn().mockResolvedValue({
    rbToBlColor: new Map(),
    blToRbColor: new Map(),
    partMappings: new Map(),
    blToRbPart: new Map(),
  }),
  resolveCatalogPartIdentity: vi.fn((row: InventoryRow) => ({
    canonicalKey: `${row.partId}:${row.colorId}`,
    rbPartId: row.partId,
    rbColorId: row.colorId,
    blPartId: row.partId,
    blColorId: null,
    elementId: null,
    rowType: 'catalog_part' as const,
    blMinifigId: null,
    rbFigNum: null,
  })),
  resolveMinifigParentIdentity: vi.fn(
    (blId: string, rbFigNum?: string | null) => ({
      canonicalKey: `fig:${blId}`,
      rbPartId: `fig:${rbFigNum ?? blId}`,
      rbColorId: -1,
      blPartId: null,
      blColorId: null,
      elementId: null,
      rowType: 'minifig_parent' as const,
      blMinifigId: blId,
      rbFigNum: rbFigNum ?? null,
    })
  ),
  resolveRbMinifigSubpartIdentity: vi.fn(
    (rbPartId: string, rbColorId: number) => ({
      canonicalKey: `${rbPartId}:${rbColorId}`,
      rbPartId,
      rbColorId,
      blPartId: rbPartId,
      blColorId: null,
      elementId: null,
      rowType: 'minifig_subpart_matched' as const,
      blMinifigId: null,
      rbFigNum: null,
    })
  ),
}));

// Mock image backfill to avoid real BrickLink API calls
vi.mock('@/app/lib/services/imageBackfill', () => ({
  backfillBLImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getSetInventoriesBatchWithMeta } from '../inventory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function catalogRow(
  setNumber: string,
  partId: string,
  colorId: number,
  qty = 1
): InventoryRow {
  return {
    setNumber,
    partId,
    partName: `Part ${partId}`,
    colorId,
    colorName: `Color${colorId}`,
    quantityRequired: qty,
    imageUrl: null,
    inventoryKey: `${partId}:${colorId}`,
  };
}

function minifigParentRow(
  setNumber: string,
  rbFigNum: string,
  blFigId: string | null,
  qty = 1
): InventoryRow {
  return {
    setNumber,
    partId: `fig:${rbFigNum}`,
    partName: `Minifig ${blFigId ?? rbFigNum}`,
    colorId: 0,
    colorName: '\u2014',
    quantityRequired: qty,
    imageUrl: null,
    partCategoryName: 'Minifig',
    parentCategory: 'Minifigure',
    inventoryKey: `fig:${rbFigNum}`,
    ...(blFigId && { bricklinkFigId: blFigId }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSetInventoriesBatchWithMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubpartRows.length = 0;
    mockRarityRows.length = 0;
  });

  // =========================================================================
  // Empty input
  // =========================================================================

  it('returns empty map for empty input', async () => {
    const result = await getSetInventoriesBatchWithMeta([]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  // =========================================================================
  // Returns inventory results keyed by set number
  // =========================================================================

  it('returns inventory results keyed by set number', async () => {
    const batchMap = new Map<string, InventoryRow[]>();
    batchMap.set('75192-1', [catalogRow('75192-1', '3001', 1, 10)]);
    batchMap.set('10294-1', [catalogRow('10294-1', '3002', 5, 4)]);
    mockGetSetInventoriesLocalBatch.mockResolvedValue(batchMap);

    const result = await getSetInventoriesBatchWithMeta(['75192-1', '10294-1']);

    expect(result.size).toBe(2);
    expect(result.has('75192-1')).toBe(true);
    expect(result.has('10294-1')).toBe(true);

    const set1 = result.get('75192-1')!;
    expect(set1.rows.length).toBe(1);
    expect(set1.rows[0]!.partId).toBe('3001');

    const set2 = result.get('10294-1')!;
    expect(set2.rows.length).toBe(1);
    expect(set2.rows[0]!.partId).toBe('3002');
  });

  // =========================================================================
  // Falls back to Rebrickable for sets with empty catalog results
  // =========================================================================

  it('falls back to Rebrickable for sets with empty catalog results', async () => {
    const batchMap = new Map<string, InventoryRow[]>();
    batchMap.set('75192-1', [catalogRow('75192-1', '3001', 1, 10)]);
    batchMap.set('99999-1', []); // Empty — triggers fallback
    mockGetSetInventoriesLocalBatch.mockResolvedValue(batchMap);

    mockGetSetInventory.mockResolvedValue([
      catalogRow('99999-1', '3003', 3, 7),
    ]);

    const result = await getSetInventoriesBatchWithMeta(['75192-1', '99999-1']);

    expect(mockGetSetInventory).toHaveBeenCalledWith('99999-1');
    expect(result.size).toBe(2);

    const fallbackSet = result.get('99999-1')!;
    expect(fallbackSet.rows.length).toBe(1);
    expect(fallbackSet.rows[0]!.partId).toBe('3003');
  });

  // =========================================================================
  // Handles Rebrickable fallback failure gracefully
  // =========================================================================

  it('handles Rebrickable fallback failure gracefully', async () => {
    const batchMap = new Map<string, InventoryRow[]>();
    batchMap.set('75192-1', [catalogRow('75192-1', '3001', 1, 10)]);
    batchMap.set('99999-1', []); // Empty — triggers fallback
    mockGetSetInventoriesLocalBatch.mockResolvedValue(batchMap);

    mockGetSetInventory.mockRejectedValue(new Error('Rebrickable API down'));

    const result = await getSetInventoriesBatchWithMeta(['75192-1', '99999-1']);

    // Failed set should be excluded from results
    expect(result.size).toBe(1);
    expect(result.has('75192-1')).toBe(true);
    expect(result.has('99999-1')).toBe(false);
  });

  // =========================================================================
  // Identity resolution
  // =========================================================================

  it('resolves identity for catalog part rows', async () => {
    const batchMap = new Map<string, InventoryRow[]>();
    batchMap.set('75192-1', [catalogRow('75192-1', '3001', 1, 10)]);
    mockGetSetInventoriesLocalBatch.mockResolvedValue(batchMap);

    const result = await getSetInventoriesBatchWithMeta(['75192-1']);

    const row = result.get('75192-1')!.rows[0]!;
    expect(row.identity).toBeDefined();
    expect(row.identity!.canonicalKey).toBe('3001:1');
    expect(row.inventoryKey).toBe('3001:1');
  });

  // =========================================================================
  // Minifig enrichment
  // =========================================================================

  it('creates subpart child rows from minifig parents', async () => {
    const batchMap = new Map<string, InventoryRow[]>();
    batchMap.set('75192-1', [
      minifigParentRow('75192-1', 'fig-000001', 'sw0001', 2),
    ]);
    mockGetSetInventoriesLocalBatch.mockResolvedValue(batchMap);

    mockSubpartRows.push(
      {
        fig_num: 'fig-000001',
        part_num: '3001',
        color_id: 11,
        quantity: 1,
        img_url: 'https://cdn.rebrickable.com/media/parts/3001.jpg',
        rb_parts: { name: 'Part 3001', bl_part_id: null },
        rb_colors: { name: 'Color11' },
      },
      {
        fig_num: 'fig-000001',
        part_num: '3002',
        color_id: 5,
        quantity: 3,
        img_url: null,
        rb_parts: { name: 'Part 3002', bl_part_id: null },
        rb_colors: { name: 'Color5' },
      }
    );

    const result = await getSetInventoriesBatchWithMeta(['75192-1']);

    const setResult = result.get('75192-1')!;
    // parent + 2 child rows
    expect(setResult.rows.length).toBe(3);
    expect(setResult.minifigMeta).toEqual({ totalMinifigs: 1 });

    const child1 = setResult.rows.find(r => r.partId === '3001');
    expect(child1).toBeDefined();
    expect(child1!.quantityRequired).toBe(2); // 1 * 2

    const child2 = setResult.rows.find(r => r.partId === '3002');
    expect(child2!.quantityRequired).toBe(6); // 3 * 2
  });

  // =========================================================================
  // Sets without minifigs have no minifigMeta
  // =========================================================================

  it('sets without minifigs have no minifigMeta', async () => {
    const batchMap = new Map<string, InventoryRow[]>();
    batchMap.set('75192-1', [catalogRow('75192-1', '3001', 1, 10)]);
    mockGetSetInventoriesLocalBatch.mockResolvedValue(batchMap);

    const result = await getSetInventoriesBatchWithMeta(['75192-1']);

    expect(result.get('75192-1')!.minifigMeta).toBeUndefined();
  });
});
