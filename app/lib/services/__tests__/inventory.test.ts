import type { InventoryRow } from '@/app/components/set/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}));

const mockGetSetInventoryLocal = vi.fn<() => Promise<InventoryRow[]>>();
vi.mock('@/app/lib/catalog', () => ({
  getSetInventoryLocal: (...args: unknown[]) =>
    mockGetSetInventoryLocal(...(args as [])),
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
    from: (table: string) => ({
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

import { getSetInventoryRowsWithMeta } from '../inventory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function catalogRow(partId: string, colorId: number, qty = 1): InventoryRow {
  return {
    setNumber: '75192-1',
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
  rbFigNum: string,
  blFigId: string | null,
  qty = 1
): InventoryRow {
  return {
    setNumber: '75192-1',
    partId: `fig:${rbFigNum}`,
    partName: `Minifig ${blFigId ?? rbFigNum}`,
    colorId: 0,
    colorName: '—',
    quantityRequired: qty,
    imageUrl: null,
    partCategoryName: 'Minifig',
    parentCategory: 'Minifigure',
    inventoryKey: `fig:${rbFigNum}`,
    ...(blFigId && { bricklinkFigId: blFigId }),
  };
}

function subpartDbRow(
  figNum: string,
  partNum: string,
  colorId: number,
  qty = 1,
  blPartId?: string | null
): SubpartRow {
  return {
    fig_num: figNum,
    part_num: partNum,
    color_id: colorId,
    quantity: qty,
    img_url: `https://cdn.rebrickable.com/media/parts/elements/${partNum}_${colorId}.jpg`,
    rb_parts: { name: `Part ${partNum}`, bl_part_id: blPartId ?? null },
    rb_colors: { name: `Color${colorId}` },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSetInventoryRowsWithMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubpartRows.length = 0;
    mockRarityRows.length = 0;

    // Default: catalog returns parts, no minifigs
    mockGetSetInventoryLocal.mockResolvedValue([catalogRow('3001', 1, 10)]);
  });

  // =========================================================================
  // Basic inventory loading
  // =========================================================================

  describe('basic inventory loading', () => {
    it('returns catalog rows when set has no minifigs', async () => {
      const result = await getSetInventoryRowsWithMeta('75192-1');

      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.partId).toBe('3001');
      expect(result.minifigMeta).toBeUndefined();
    });

    it('falls back to Rebrickable API when local catalog is empty', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([catalogRow('3002', 2, 5)]);

      const result = await getSetInventoryRowsWithMeta('1234-1');

      expect(mockGetSetInventory).toHaveBeenCalledWith('1234-1');
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.partId).toBe('3002');
    });

    it('falls back to Rebrickable API when local catalog throws', async () => {
      mockGetSetInventoryLocal.mockRejectedValue(new Error('db down'));
      mockGetSetInventory.mockResolvedValue([catalogRow('3003', 3, 1)]);

      const result = await getSetInventoryRowsWithMeta('1234-1');

      expect(mockGetSetInventory).toHaveBeenCalled();
      expect(result.rows[0]!.partId).toBe('3003');
    });
  });

  // =========================================================================
  // Minifig integration (RB catalog)
  // =========================================================================

  describe('minifig integration', () => {
    it('resolves identity for minifig parent rows', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', 'sw0001'),
      ]);

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const figRow = result.rows.find(r => r.partId === 'fig:fig-000001');
      expect(figRow).toBeDefined();
      expect(figRow!.identity?.rowType).toBe('minifig_parent');
      expect(figRow!.identity?.canonicalKey).toBe('fig:sw0001');
    });

    it('creates subpart child rows from rb_minifig_parts', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', 'sw0001', 2),
      ]);

      mockSubpartRows.push(
        subpartDbRow('fig-000001', '3001', 11, 1),
        subpartDbRow('fig-000001', '3002', 5, 3)
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // parent + 2 child rows
      expect(result.rows.length).toBe(3);

      const child1 = result.rows.find(r => r.partId === '3001');
      expect(child1).toBeDefined();
      // qty = subpart qty (1) × minifig qty (2)
      expect(child1!.quantityRequired).toBe(2);
      expect(child1!.parentRelations).toHaveLength(1);

      const child2 = result.rows.find(r => r.partId === '3002');
      expect(child2!.quantityRequired).toBe(6); // 3 × 2
    });

    it('builds componentRelations on parent minifig rows', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', 'sw0001'),
      ]);
      mockSubpartRows.push(
        subpartDbRow('fig-000001', '3001', 11, 1),
        subpartDbRow('fig-000001', '3002', 5, 2)
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const parent = result.rows.find(r => r.partId === 'fig:fig-000001');
      expect(parent!.componentRelations).toHaveLength(2);
      expect(parent!.componentRelations![0]!.key).toBe('3001:11');
      expect(parent!.componentRelations![1]!.key).toBe('3002:5');
    });

    it('aggregates shared parts across multiple minifigs', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', 'sw0001'),
        minifigParentRow('fig-000002', 'sw0002'),
      ]);

      // Both minifigs share part 3001:11
      mockSubpartRows.push(
        subpartDbRow('fig-000001', '3001', 11, 1),
        subpartDbRow('fig-000002', '3001', 11, 1)
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const sharedPart = result.rows.find(r => r.partId === '3001');
      expect(sharedPart).toBeDefined();
      // 1×1 + 1×1 = 2 total
      expect(sharedPart!.quantityRequired).toBe(2);
      expect(sharedPart!.parentRelations).toHaveLength(2);
    });

    it('returns minifigMeta with count', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', 'sw0001'),
      ]);
      mockSubpartRows.push(subpartDbRow('fig-000001', '3001', 11, 1));

      const result = await getSetInventoryRowsWithMeta('75192-1');

      expect(result.minifigMeta).toEqual({
        totalMinifigs: 1,
      });
    });

    it('handles minifigs with no subparts gracefully', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', 'sw0001'),
      ]);
      // No subpart rows

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // Parent exists but with no subpart children
      const parent = result.rows.find(r => r.partId === 'fig:fig-000001');
      expect(parent).toBeDefined();
      expect(parent!.componentRelations ?? []).toHaveLength(0);
    });

    it('works with minifigs without BL ID', async () => {
      // No bricklinkFigId set — uses rbFigNum as fallback
      mockGetSetInventoryLocal.mockResolvedValue([
        minifigParentRow('fig-000001', null),
      ]);
      mockSubpartRows.push(subpartDbRow('fig-000001', '3001', 11, 1));

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const parent = result.rows.find(r => r.partId === 'fig:fig-000001');
      expect(parent).toBeDefined();
      expect(parent!.identity?.canonicalKey).toBe('fig:fig-000001');
      expect(parent!.componentRelations).toHaveLength(1);
    });
  });

  // =========================================================================
  // Rarity enrichment
  // =========================================================================

  describe('rarity enrichment', () => {
    it('populates setCount from rarity data for catalog rows', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([
        catalogRow('3001', 1, 10),
        catalogRow('3002', 5, 4),
      ]);

      mockRarityRows.push(
        { part_num: '3001', color_id: 1, set_count: 523 },
        { part_num: '3002', color_id: 5, set_count: 42 }
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const row1 = result.rows.find(r => r.partId === '3001');
      expect(row1!.setCount).toBe(523);

      const row2 = result.rows.find(r => r.partId === '3002');
      expect(row2!.setCount).toBe(42);
    });

    it('sets setCount to null when no rarity data exists', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([catalogRow('9999', 1, 1)]);
      // No rarity rows added

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const row = result.rows.find(r => r.partId === '9999');
      expect(row!.setCount).toBeNull();
    });
  });
});
