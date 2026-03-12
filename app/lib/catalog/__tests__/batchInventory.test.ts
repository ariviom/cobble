import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the module under test
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

// ---------------------------------------------------------------------------
// Table-based data store for the Supabase mock
// ---------------------------------------------------------------------------

type AnyRow = Record<string, unknown>;

/** Per-table data store. Tests push rows here before calling the function. */
const tableData: Record<string, AnyRow[]> = {};

function resetTableData() {
  for (const key of Object.keys(tableData)) {
    delete tableData[key];
  }
}

function setTableRows(table: string, rows: AnyRow[]) {
  tableData[table] = rows;
}

/**
 * Simple in-memory filter that supports `.eq(col, val)`, `.in(col, vals)`,
 * and `.limit(n)` applied sequentially on the table's data.
 */
function buildQueryChain(table: string) {
  let rows: AnyRow[] = [...(tableData[table] ?? [])];

  const chain: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      rows = rows.filter(r => r[col] === val);
      return chain;
    },
    in(col: string, vals: unknown[]) {
      const set = new Set(vals);
      rows = rows.filter(r => set.has(r[col]));
      return chain;
    },
    or(_filter: string) {
      // For rarity queries — return all rows (tests set minimal data)
      return Promise.resolve({ data: rows, error: null });
    },
    limit(_n: number) {
      rows = rows.slice(0, _n);
      return Promise.resolve({ data: rows, error: null });
    },
    // Terminal — when no .limit() or .eq() follows
    then(resolve: (v: { data: AnyRow[]; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };

  return chain;
}

const mockSupabase = {
  from: (table: string) => ({
    select: (_cols?: string) => buildQueryChain(table),
  }),
};

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => mockSupabase,
}));

// Category map mock — minimal
vi.mock('../sets', () => ({
  getCategoryMap: vi.fn().mockResolvedValue(
    new Map([
      [1, { id: 1, name: 'Bricks' }],
      [2, { id: 2, name: 'Plates' }],
      [15, { id: 15, name: 'Minifig Accessories' }],
    ])
  ),
}));

// Rarity mock — passes through to the real queryPartRarityBatch, which will
// call our mock supabase. We populate rb_part_rarity table data in tests.
// (The real module also has `server-only` mocked above.)

// Minifig image URL helper — use the real one
vi.mock('@/app/lib/catalog/minifigs', () => ({
  getBlMinifigImageUrl: (blId: string) =>
    `https://img.bricklink.com/ItemImage/MN/0/${blId}.png`,
}));

// mapCategoryNameToParent — use simplified version
vi.mock('@/app/lib/rebrickable', () => ({
  mapCategoryNameToParent: (name: string) => {
    const n = name.toLowerCase();
    if (n.startsWith('brick')) return 'Brick';
    if (n.startsWith('plate')) return 'Plate';
    if (n.startsWith('minifig')) return 'Minifigure';
    return 'Misc';
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getSetInventoriesLocalBatch } from '../batchInventory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inventoryRow(setNum: string, id: number, version: number) {
  return { id, set_num: setNum, version };
}

function partRow(
  inventoryId: number,
  partNum: string,
  colorId: number,
  qty: number,
  opts?: { elementId?: string; imgUrl?: string }
) {
  return {
    inventory_id: inventoryId,
    part_num: partNum,
    color_id: colorId,
    quantity: qty,
    is_spare: false,
    element_id: opts?.elementId ?? null,
    img_url: opts?.imgUrl ?? null,
  };
}

function partMeta(
  partNum: string,
  name: string,
  catId: number | null = null,
  opts?: { imageUrl?: string; blPartId?: string }
) {
  return {
    part_num: partNum,
    name,
    part_cat_id: catId,
    image_url: opts?.imageUrl ?? null,
    bl_part_id: opts?.blPartId ?? null,
  };
}

function colorMeta(id: number, name: string) {
  return { id, name };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSetInventoriesLocalBatch', () => {
  beforeEach(() => {
    resetTableData();
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1. Empty input
  // =========================================================================

  it('returns empty map for empty input', async () => {
    const result = await getSetInventoriesLocalBatch([]);
    expect(result.size).toBe(0);
  });

  it('returns empty map for whitespace-only input', async () => {
    const result = await getSetInventoriesLocalBatch(['  ', '']);
    expect(result.size).toBe(0);
  });

  // =========================================================================
  // 2. Sets not found in rb_inventories
  // =========================================================================

  it('returns empty arrays for sets not found in rb_inventories', async () => {
    // No rows in rb_inventories
    setTableRows('rb_inventories', []);

    const result = await getSetInventoriesLocalBatch(['99999-1', '88888-1']);

    expect(result.size).toBe(2);
    expect(result.get('99999-1')).toEqual([]);
    expect(result.get('88888-1')).toEqual([]);
  });

  it('returns empty array for missing set and rows for found set', async () => {
    setTableRows('rb_inventories', [inventoryRow('10001-1', 100, 1)]);
    setTableRows('rb_inventory_parts_public', [partRow(100, '3001', 1, 4)]);
    setTableRows('rb_inventory_minifigs', []);
    setTableRows('rb_parts', [partMeta('3001', 'Brick 2x4', 1)]);
    setTableRows('rb_colors', [colorMeta(1, 'White')]);

    const result = await getSetInventoriesLocalBatch(['10001-1', '99999-1']);

    expect(result.get('99999-1')).toEqual([]);
    expect(result.get('10001-1')!.length).toBe(1);
    expect(result.get('10001-1')![0]!.partId).toBe('3001');
  });

  // =========================================================================
  // 3. Single set — correct field mapping
  // =========================================================================

  it('returns correct inventory rows for a single set', async () => {
    setTableRows('rb_inventories', [inventoryRow('75192-1', 500, 1)]);
    setTableRows('rb_inventory_parts_public', [
      partRow(500, '3001', 1, 10, {
        elementId: 'E3001',
        imgUrl: 'https://cdn.example.com/3001_1.jpg',
      }),
      partRow(500, '3002', 5, 4),
    ]);
    setTableRows('rb_inventory_minifigs', []);
    setTableRows('rb_parts', [
      partMeta('3001', 'Brick 2x4', 1, { blPartId: '3001' }),
      partMeta('3002', 'Plate 2x3', 2, {
        imageUrl: 'https://cdn.example.com/3002.jpg',
        blPartId: 'BL3002',
      }),
    ]);
    setTableRows('rb_colors', [colorMeta(1, 'White'), colorMeta(5, 'Red')]);

    const result = await getSetInventoriesLocalBatch(['75192-1']);
    const rows = result.get('75192-1')!;

    expect(rows).toHaveLength(2);

    // Row 1: 3001
    const r1 = rows.find(r => r.partId === '3001')!;
    expect(r1.setNumber).toBe('75192-1');
    expect(r1.partName).toBe('Brick 2x4');
    expect(r1.colorId).toBe(1);
    expect(r1.colorName).toBe('White');
    expect(r1.quantityRequired).toBe(10);
    expect(r1.imageUrl).toBe('https://cdn.example.com/3001_1.jpg');
    expect(r1.elementId).toBe('E3001');
    expect(r1.inventoryKey).toBe('3001:1');
    expect(r1.partCategoryId).toBe(1);
    expect(r1.partCategoryName).toBe('Bricks');
    expect(r1.parentCategory).toBe('Brick');
    // blPartId same as partId → should NOT be included
    expect(r1.bricklinkPartId).toBeUndefined();

    // Row 2: 3002
    const r2 = rows.find(r => r.partId === '3002')!;
    expect(r2.partName).toBe('Plate 2x3');
    expect(r2.colorId).toBe(5);
    expect(r2.colorName).toBe('Red');
    expect(r2.quantityRequired).toBe(4);
    // No img_url on the part row → falls back to part's image_url
    expect(r2.imageUrl).toBe('https://cdn.example.com/3002.jpg');
    expect(r2.elementId).toBeNull();
    expect(r2.inventoryKey).toBe('3002:5');
    // blPartId different from partId → should be included
    expect(r2.bricklinkPartId).toBe('BL3002');
  });

  it('picks the latest inventory version', async () => {
    setTableRows('rb_inventories', [
      inventoryRow('10001-1', 100, 1),
      inventoryRow('10001-1', 101, 2), // newer version
    ]);
    setTableRows('rb_inventory_parts_public', [
      partRow(100, 'OLD_PART', 1, 1),
      partRow(101, 'NEW_PART', 1, 1),
    ]);
    setTableRows('rb_inventory_minifigs', []);
    setTableRows('rb_parts', [
      partMeta('OLD_PART', 'Old Part'),
      partMeta('NEW_PART', 'New Part'),
    ]);
    setTableRows('rb_colors', [colorMeta(1, 'White')]);

    const result = await getSetInventoriesLocalBatch(['10001-1']);
    const rows = result.get('10001-1')!;

    expect(rows).toHaveLength(1);
    expect(rows[0]!.partId).toBe('NEW_PART');
  });

  it('falls back to part_num as partName when part metadata is missing', async () => {
    setTableRows('rb_inventories', [inventoryRow('10001-1', 100, 1)]);
    setTableRows('rb_inventory_parts_public', [partRow(100, 'UNKNOWN', 99, 1)]);
    setTableRows('rb_inventory_minifigs', []);
    setTableRows('rb_parts', []); // no metadata
    setTableRows('rb_colors', []);

    const result = await getSetInventoriesLocalBatch(['10001-1']);
    const row = result.get('10001-1')![0]!;

    expect(row.partName).toBe('UNKNOWN');
    expect(row.colorName).toBe('Color 99');
  });

  // =========================================================================
  // 4. Multiple sets — correct grouping
  // =========================================================================

  it('groups parts into the correct sets', async () => {
    setTableRows('rb_inventories', [
      inventoryRow('10001-1', 100, 1),
      inventoryRow('10002-1', 200, 1),
    ]);
    setTableRows('rb_inventory_parts_public', [
      partRow(100, '3001', 1, 10),
      partRow(100, '3002', 5, 4),
      partRow(200, '3003', 2, 8),
    ]);
    setTableRows('rb_inventory_minifigs', []);
    setTableRows('rb_parts', [
      partMeta('3001', 'Brick 2x4'),
      partMeta('3002', 'Plate 2x3'),
      partMeta('3003', 'Tile 1x1'),
    ]);
    setTableRows('rb_colors', [
      colorMeta(1, 'White'),
      colorMeta(2, 'Grey'),
      colorMeta(5, 'Red'),
    ]);

    const result = await getSetInventoriesLocalBatch(['10001-1', '10002-1']);

    // Set 10001-1 should have 2 parts
    const rows1 = result.get('10001-1')!;
    expect(rows1).toHaveLength(2);
    const partIds1 = rows1.map(r => r.partId).sort();
    expect(partIds1).toEqual(['3001', '3002']);
    expect(rows1.every(r => r.setNumber === '10001-1')).toBe(true);

    // Set 10002-1 should have 1 part
    const rows2 = result.get('10002-1')!;
    expect(rows2).toHaveLength(1);
    expect(rows2[0]!.partId).toBe('3003');
    expect(rows2[0]!.setNumber).toBe('10002-1');
  });

  // =========================================================================
  // 5. Minifig parent rows
  // =========================================================================

  it('creates minifig parent rows', async () => {
    setTableRows('rb_inventories', [inventoryRow('75192-1', 500, 1)]);
    setTableRows('rb_inventory_parts_public', [partRow(500, '3001', 1, 2)]);
    setTableRows('rb_inventory_minifigs', [
      { inventory_id: 500, fig_num: 'fig-000001', quantity: 2 },
    ]);
    setTableRows('rb_parts', [partMeta('3001', 'Brick 2x4')]);
    setTableRows('rb_colors', [colorMeta(1, 'White')]);
    setTableRows('rb_minifigs', [
      {
        fig_num: 'fig-000001',
        name: 'Han Solo',
        num_parts: 5,
        bl_minifig_id: 'sw0001',
      },
    ]);
    setTableRows('rb_minifig_images', [
      { fig_num: 'fig-000001', image_url: 'https://img.example.com/fig1.jpg' },
    ]);
    setTableRows('rb_minifig_rarity', [
      { fig_num: 'fig-000001', min_subpart_set_count: 3, set_count: 5 },
    ]);

    const result = await getSetInventoriesLocalBatch(['75192-1']);
    const rows = result.get('75192-1')!;

    // 1 part + 1 minifig parent
    expect(rows).toHaveLength(2);

    const figRow = rows.find(r => r.partId === 'fig:fig-000001')!;
    expect(figRow).toBeDefined();
    expect(figRow.partName).toBe('Han Solo');
    expect(figRow.colorId).toBe(0);
    expect(figRow.colorName).toBe('\u2014');
    expect(figRow.quantityRequired).toBe(2);
    expect(figRow.imageUrl).toBe('https://img.example.com/fig1.jpg');
    expect(figRow.partCategoryName).toBe('Minifig');
    expect(figRow.parentCategory).toBe('Minifigure');
    expect(figRow.inventoryKey).toBe('fig:fig-000001');
    expect(figRow.bricklinkFigId).toBe('sw0001');
    expect(figRow.setCount).toBe(3);
  });

  it('uses BrickLink image fallback when no rb_minifig_images entry', async () => {
    setTableRows('rb_inventories', [inventoryRow('10001-1', 100, 1)]);
    setTableRows('rb_inventory_parts_public', []);
    setTableRows('rb_inventory_minifigs', [
      { inventory_id: 100, fig_num: 'fig-000002', quantity: 1 },
    ]);
    setTableRows('rb_parts', []);
    setTableRows('rb_colors', []);
    setTableRows('rb_minifigs', [
      {
        fig_num: 'fig-000002',
        name: 'Chewbacca',
        num_parts: 4,
        bl_minifig_id: 'sw0011',
      },
    ]);
    setTableRows('rb_minifig_images', []); // no image
    setTableRows('rb_minifig_rarity', []);

    const result = await getSetInventoriesLocalBatch(['10001-1']);
    const rows = result.get('10001-1')!;
    const figRow = rows.find(r => r.partId === 'fig:fig-000002')!;

    expect(figRow.imageUrl).toBe(
      'https://img.bricklink.com/ItemImage/MN/0/sw0011.png'
    );
  });

  // =========================================================================
  // 6. Deduplication
  // =========================================================================

  it('deduplicates identical set numbers in input', async () => {
    setTableRows('rb_inventories', [inventoryRow('10001-1', 100, 1)]);
    setTableRows('rb_inventory_parts_public', [partRow(100, '3001', 1, 5)]);
    setTableRows('rb_inventory_minifigs', []);
    setTableRows('rb_parts', [partMeta('3001', 'Brick 2x4')]);
    setTableRows('rb_colors', [colorMeta(1, 'White')]);

    const result = await getSetInventoriesLocalBatch([
      '10001-1',
      '10001-1',
      '10001-1',
    ]);

    // Should only have one key
    expect(result.size).toBe(1);
    expect(result.get('10001-1')!).toHaveLength(1);
  });
});
