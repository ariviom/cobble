import type { InventoryRow } from '@/app/components/set/types';
import type {
  BlMinifigPart,
  SetMinifigResult,
} from '@/app/lib/bricklink/minifigs';
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

const mockGetSetMinifigsBl = vi.fn<() => Promise<SetMinifigResult>>();
const mockGetMinifigPartsBl = vi.fn<() => Promise<BlMinifigPart[]>>();
vi.mock('@/app/lib/bricklink/minifigs', () => ({
  getSetMinifigsBl: (...args: unknown[]) =>
    mockGetSetMinifigsBl(...(args as [])),
  getMinifigPartsBl: (...args: unknown[]) =>
    mockGetMinifigPartsBl(...(args as [])),
  getBlPartImageUrl: (partId: string, colorId: number) =>
    `https://img.bricklink.com/ItemImage/PN/${colorId}/${partId}.png`,
  getBlMinifigImageUrl: (figId: string) =>
    `https://img.bricklink.com/ItemImage/MN/0/${figId}.png`,
}));

vi.mock('@/app/lib/bricklink/colors', () => ({
  getBricklinkColorName: (id: number) => `BLColor${id}`,
}));

// Supabase mock — tracks chained query builder calls
const mockSubpartRows: Array<{
  bl_minifig_no: string;
  bl_part_id: string;
  bl_color_id: number;
  color_name: string | null;
  name: string | null;
  quantity: number;
}> = [];

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogWriteClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: mockSubpartRows, error: null }),
      }),
    }),
  }),
  getCatalogReadClient: () => ({
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
    blPartId: null,
    blColorId: null,
    elementId: null,
    rowType: 'catalog_part' as const,
    blMinifigId: null,
  })),
  resolveMinifigParentIdentity: vi.fn((blId: string) => ({
    canonicalKey: `fig:${blId}`,
    rbPartId: `fig:${blId}`,
    rbColorId: 0,
    blPartId: null,
    blColorId: null,
    elementId: null,
    rowType: 'minifig_parent' as const,
    blMinifigId: blId,
  })),
  resolveMinifigSubpartIdentity: vi.fn(
    (blPartId: string, blColorId: number) => ({
      canonicalKey: `${blPartId}:${blColorId}`,
      rbPartId: blPartId,
      rbColorId: blColorId,
      blPartId,
      blColorId,
      elementId: null,
      rowType: 'minifig_subpart_unmatched' as const,
      blMinifigId: null,
    })
  ),
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

import { logger } from '@/lib/metrics';
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

function blMinifig(blId: string, qty = 1) {
  return {
    blMinifigId: blId,
    name: `Minifig ${blId}`,
    quantity: qty,
    imageUrl: `https://img.bricklink.com/ItemImage/MN/0/${blId}.png`,
  };
}

function blPart(blPartId: string, blColorId: number, qty = 1): BlMinifigPart {
  return {
    blPartId,
    blColorId,
    colorName: `BLColor${blColorId}`,
    name: `Part ${blPartId}`,
    quantity: qty,
  };
}

function subpartDbRow(
  minifigNo: string,
  partId: string,
  colorId: number,
  qty = 1
) {
  return {
    bl_minifig_no: minifigNo,
    bl_part_id: partId,
    bl_color_id: colorId,
    color_name: `BLColor${colorId}`,
    name: `Part ${partId}`,
    quantity: qty,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSetInventoryRowsWithMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubpartRows.length = 0;

    // Default: catalog returns parts, no minifigs, self-heal returns empty
    mockGetSetInventoryLocal.mockResolvedValue([catalogRow('3001', 1, 10)]);
    mockGetMinifigPartsBl.mockResolvedValue([]);
    mockGetSetMinifigsBl.mockResolvedValue({
      minifigs: [],
      syncStatus: null,
      syncTriggered: false,
    });
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

    it('does not include minifigEnrichmentNeeded in result', async () => {
      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: false,
      });
      mockSubpartRows.push(subpartDbRow('sw0001', '3001', 11, 2));

      const result = await getSetInventoryRowsWithMeta('75192-1');

      expect(result).not.toHaveProperty('minifigEnrichmentNeeded');
    });
  });

  // =========================================================================
  // Minifig integration
  // =========================================================================

  describe('minifig integration', () => {
    it('replaces RB minifig rows with BL minifigs', async () => {
      // Catalog returns an RB minifig row
      mockGetSetInventoryLocal.mockResolvedValue([
        {
          ...catalogRow('fig:sw0001', 0),
          parentCategory: 'Minifigure',
        },
      ]);

      // BL returns the authoritative minifig
      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // Should have the BL minifig parent row
      const figRow = result.rows.find(r => r.partId === 'fig:sw0001');
      expect(figRow).toBeDefined();
      expect(figRow!.bricklinkFigId).toBe('sw0001');
      expect(figRow!.identity?.rowType).toBe('minifig_parent');
    });

    it('creates subpart child rows from batch query', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001', 2)],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // Subparts found in batch query
      mockSubpartRows.push(
        subpartDbRow('sw0001', '3001', 11, 1),
        subpartDbRow('sw0001', '3002', 5, 3)
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // parent + 2 child rows
      expect(result.rows.length).toBe(3);

      const child1 = result.rows.find(r => r.partId === '3001');
      expect(child1).toBeDefined();
      // qty = subpart qty (1) × minifig qty (2)
      expect(child1!.quantityRequired).toBe(2);
      expect(child1!.parentRelations).toHaveLength(1);
      expect(child1!.parentRelations![0]!.parentKey).toBe('fig:sw0001');

      const child2 = result.rows.find(r => r.partId === '3002');
      expect(child2!.quantityRequired).toBe(6); // 3 × 2
    });

    it('builds componentRelations on parent minifig rows', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: false,
      });
      mockSubpartRows.push(
        subpartDbRow('sw0001', '3001', 11, 1),
        subpartDbRow('sw0001', '3002', 5, 2)
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const parent = result.rows.find(r => r.partId === 'fig:sw0001');
      expect(parent!.componentRelations).toHaveLength(2);
      expect(parent!.componentRelations![0]!.key).toBe('3001:11');
      expect(parent!.componentRelations![1]!.key).toBe('3002:5');
    });

    it('aggregates shared parts across multiple minifigs', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001'), blMinifig('sw0002')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // Both minifigs share part 3001:11
      mockSubpartRows.push(
        subpartDbRow('sw0001', '3001', 11, 1),
        subpartDbRow('sw0002', '3001', 11, 1)
      );

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const sharedPart = result.rows.find(r => r.partId === '3001');
      expect(sharedPart).toBeDefined();
      // 1×1 + 1×1 = 2 total
      expect(sharedPart!.quantityRequired).toBe(2);
      expect(sharedPart!.parentRelations).toHaveLength(2);
    });

    it('returns minifigMeta with sync status', async () => {
      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: true,
      });

      const result = await getSetInventoryRowsWithMeta('75192-1');

      expect(result.minifigMeta).toEqual({
        totalMinifigs: 1,
        syncStatus: 'ok',
        syncTriggered: true,
      });
    });

    it('reports error syncStatus when BL sync fails', async () => {
      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [],
        syncStatus: 'error',
        syncTriggered: true,
      });

      const result = await getSetInventoryRowsWithMeta('75192-1');

      expect(result.minifigMeta).toEqual({
        totalMinifigs: 0,
        syncStatus: 'error',
        syncTriggered: true,
      });
    });
  });

  // =========================================================================
  // Self-healing for missing subparts (Plan 03 core logic)
  // =========================================================================

  describe('self-healing for missing subparts', () => {
    it('calls getMinifigPartsBl for minifigs with no subparts in batch query', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001'), blMinifig('sw0002')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // sw0001 has subparts in batch, sw0002 does NOT
      mockSubpartRows.push(subpartDbRow('sw0001', '3001', 11, 1));

      // Self-heal returns parts for sw0002
      mockGetMinifigPartsBl.mockResolvedValue([blPart('3002', 5, 2)]);

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // getMinifigPartsBl should only be called for the missing one
      expect(mockGetMinifigPartsBl).toHaveBeenCalledTimes(1);
      expect(mockGetMinifigPartsBl).toHaveBeenCalledWith('sw0002');

      // Both minifigs should have subparts
      const sw0002Child = result.rows.find(r => r.partId === '3002');
      expect(sw0002Child).toBeDefined();
      expect(sw0002Child!.quantityRequired).toBe(2); // 2 × 1 minifig

      // Parent should have componentRelations
      const sw0002Parent = result.rows.find(r => r.partId === 'fig:sw0002');
      expect(sw0002Parent!.componentRelations).toHaveLength(1);
      expect(sw0002Parent!.componentRelations![0]!.key).toBe('3002:5');
    });

    it('skips self-healing when all minifigs have subparts', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // Batch query already has subparts
      mockSubpartRows.push(subpartDbRow('sw0001', '3001', 11, 1));

      await getSetInventoryRowsWithMeta('75192-1');

      expect(mockGetMinifigPartsBl).not.toHaveBeenCalled();
    });

    it('self-heals multiple minifigs in parallel', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [
          blMinifig('sw0001'),
          blMinifig('sw0002'),
          blMinifig('sw0003'),
        ],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // No subparts in batch — all 3 need self-healing
      mockGetMinifigPartsBl
        .mockResolvedValueOnce([blPart('3001', 11, 1)])
        .mockResolvedValueOnce([blPart('3002', 5, 2)])
        .mockResolvedValueOnce([blPart('3003', 1, 3)]);

      const result = await getSetInventoryRowsWithMeta('75192-1');

      expect(mockGetMinifigPartsBl).toHaveBeenCalledTimes(3);

      // All 3 child rows should exist
      expect(result.rows.find(r => r.partId === '3001')).toBeDefined();
      expect(result.rows.find(r => r.partId === '3002')).toBeDefined();
      expect(result.rows.find(r => r.partId === '3003')).toBeDefined();
    });

    it('handles self-heal timeout gracefully — parent gets empty componentRelations', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // No subparts in batch
      // Self-heal hangs forever (simulates timeout)
      mockGetMinifigPartsBl.mockImplementation(
        () => new Promise(() => {}) // never resolves
      );

      // The 10s timeout in production is too slow for tests.
      // We can't easily mock the timeout constant, but we can verify the
      // behavior by making getMinifigPartsBl reject (same outcome as timeout).
      mockGetMinifigPartsBl.mockRejectedValue(new Error('timeout'));

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // Parent exists but with no subpart children
      const parent = result.rows.find(r => r.partId === 'fig:sw0001');
      expect(parent).toBeDefined();
      expect(parent!.componentRelations ?? []).toHaveLength(0);

      // Warning logged
      expect(logger.warn).toHaveBeenCalledWith(
        'inventory.self_heal_subpart_failed',
        expect.objectContaining({
          setNumber: '75192-1',
        })
      );
    });

    it('handles partial self-heal failure — succeeds for some, fails for others', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001'), blMinifig('sw0002')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // No subparts in batch
      mockGetMinifigPartsBl
        .mockResolvedValueOnce([blPart('3001', 11, 1)]) // sw0001 succeeds
        .mockRejectedValueOnce(new Error('BL API down')); // sw0002 fails

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // sw0001 got its subpart
      const child = result.rows.find(r => r.partId === '3001');
      expect(child).toBeDefined();

      const sw0001Parent = result.rows.find(r => r.partId === 'fig:sw0001');
      expect(sw0001Parent!.componentRelations).toHaveLength(1);

      // sw0002 has no subparts (failed self-heal)
      const sw0002Parent = result.rows.find(r => r.partId === 'fig:sw0002');
      expect(sw0002Parent!.componentRelations ?? []).toHaveLength(0);
    });

    it('self-heal returns empty parts — parent gets empty componentRelations', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // Self-heal returns empty array (e.g., BL API returned nothing)
      mockGetMinifigPartsBl.mockResolvedValue([]);

      const result = await getSetInventoryRowsWithMeta('75192-1');

      const parent = result.rows.find(r => r.partId === 'fig:sw0001');
      expect(parent).toBeDefined();
      expect(parent!.componentRelations ?? []).toHaveLength(0);

      // Should NOT log a warning (empty result is not an error)
      expect(logger.warn).not.toHaveBeenCalledWith(
        'inventory.self_heal_subpart_failed',
        expect.anything()
      );
    });

    it('logs info when self-healing is triggered', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001'), blMinifig('sw0002')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      mockGetMinifigPartsBl.mockResolvedValue([blPart('3001', 11, 1)]);

      await getSetInventoryRowsWithMeta('75192-1');

      expect(logger.info).toHaveBeenCalledWith(
        'inventory.self_heal_missing_subparts',
        expect.objectContaining({
          setNumber: '75192-1',
          count: 2,
          minifigs: ['sw0001', 'sw0002'],
        })
      );
    });

    it('merges self-healed subparts into shared part rows correctly', async () => {
      mockGetSetInventoryLocal.mockResolvedValue([]);
      mockGetSetInventory.mockResolvedValue([]);

      mockGetSetMinifigsBl.mockResolvedValue({
        minifigs: [blMinifig('sw0001'), blMinifig('sw0002')],
        syncStatus: 'ok',
        syncTriggered: false,
      });

      // sw0001 has subparts from batch
      mockSubpartRows.push(subpartDbRow('sw0001', '3001', 11, 1));

      // sw0002 self-heals and ALSO needs 3001:11 (shared part)
      mockGetMinifigPartsBl.mockResolvedValue([blPart('3001', 11, 1)]);

      const result = await getSetInventoryRowsWithMeta('75192-1');

      // Single child row for the shared part
      const sharedRows = result.rows.filter(r => r.partId === '3001');
      expect(sharedRows).toHaveLength(1);

      // Quantity should aggregate: 1×1 (sw0001) + 1×1 (sw0002) = 2
      expect(sharedRows[0]!.quantityRequired).toBe(2);
      expect(sharedRows[0]!.parentRelations).toHaveLength(2);
    });
  });
});
