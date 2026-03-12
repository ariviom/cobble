# Batch Inventory Endpoint Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /api/inventory/batch` endpoint that fetches inventories for multiple sets in shared Supabase queries, reducing HTTP requests and DB load for cold-cache scenarios.

**Architecture:** New batch catalog function aggregates Supabase queries across sets (inventories, parts, colors, rarity, minifig metadata) into ~14 queries regardless of set count. New batch service function orchestrates identity resolution and minifig enrichment per-set using shared data. Client hook uses the batch endpoint when >1 set is uncached, chunking into groups of 50.

**Tech Stack:** Next.js Route Handler, Supabase JS client, Zod validation, Vitest

**Spec:** `docs/superpowers/specs/2026-03-12-batch-inventory-endpoint-design.md`

---

## Chunk 1: Batch Catalog Function

### Task 1: Extract `queryPartRarityBatch` to shared module

The rarity query helper exists in both `app/lib/catalog/sets.ts` (line 914) and `app/lib/services/inventory.ts` (line 354) as near-duplicates. Extract to a shared module so the batch function can reuse it.

**Files:**

- Create: `app/lib/catalog/rarity.ts`
- Modify: `app/lib/catalog/sets.ts:898-947` (remove local copy, import from rarity.ts)
- Modify: `app/lib/services/inventory.ts:342-388` (remove local copy, import from rarity.ts)
- Create: `app/lib/catalog/__tests__/rarity.test.ts`

- [ ] **Step 1: Write the failing test for the shared rarity module**

```typescript
// app/lib/catalog/__tests__/rarity.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock Supabase client
const mockOr = vi.fn();
const mockSelect = vi.fn(() => ({ or: mockOr }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));
const mockClient = { from: mockFrom } as unknown as ReturnType<
  typeof import('@/app/lib/db/catalogAccess').getCatalogReadClient
>;

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => mockClient,
}));

vi.mock('@/lib/metrics', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { queryPartRarityBatch } from '../rarity';

describe('queryPartRarityBatch', () => {
  it('returns empty map for empty pairs', async () => {
    const result = await queryPartRarityBatch(mockClient, []);
    expect(result).toEqual(new Map());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('queries rarity and returns map keyed by partNum:colorId', async () => {
    mockOr.mockResolvedValueOnce({
      data: [
        { part_num: '3001', color_id: 1, set_count: 42 },
        { part_num: '3002', color_id: 4, set_count: 15 },
      ],
    });

    const result = await queryPartRarityBatch(mockClient, [
      { partNum: '3001', colorId: 1 },
      { partNum: '3002', colorId: 4 },
    ]);

    expect(result.get('3001:1')).toBe(42);
    expect(result.get('3002:4')).toBe(15);
    expect(mockFrom).toHaveBeenCalledWith('rb_part_rarity');
  });

  it('batches into groups of 100', async () => {
    // Create 150 pairs to force 2 batches
    const pairs = Array.from({ length: 150 }, (_, i) => ({
      partNum: `part${i}`,
      colorId: i,
    }));

    mockOr.mockResolvedValue({ data: [] });

    await queryPartRarityBatch(mockClient, pairs);
    expect(mockOr).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/catalog/__tests__/rarity.test.ts`
Expected: FAIL — module `../rarity` not found

- [ ] **Step 3: Create the shared rarity module**

```typescript
// app/lib/catalog/rarity.ts
import 'server-only';

import type { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

type PartRarityRow = {
  part_num: string;
  color_id: number;
  set_count: number;
};

const RARITY_BATCH_SIZE = 100;

/**
 * Query rb_part_rarity for a set of (part_num, color_id) pairs.
 * Fires all batches in parallel and returns a Map keyed by "partNum:colorId".
 */
export async function queryPartRarityBatch(
  supabase: ReturnType<typeof getCatalogReadClient>,
  pairs: Array<{ partNum: string; colorId: number }>
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (pairs.length === 0) return map;

  const batches: Array<Array<{ partNum: string; colorId: number }>> = [];
  for (let i = 0; i < pairs.length; i += RARITY_BATCH_SIZE) {
    batches.push(pairs.slice(i, i + RARITY_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(batch => {
      const orFilter = batch
        .map(p => `and(part_num.eq.${p.partNum},color_id.eq.${p.colorId})`)
        .join(',');
      return supabase
        .from('rb_part_rarity' as never)
        .select('part_num, color_id, set_count')
        .or(orFilter) as unknown as Promise<{
        data: PartRarityRow[] | null;
      }>;
    })
  );

  for (const { data } of results) {
    for (const r of data ?? []) {
      map.set(`${r.part_num}:${r.color_id}`, r.set_count);
    }
  }

  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/catalog/__tests__/rarity.test.ts`
Expected: PASS

- [ ] **Step 5: Update `sets.ts` to import from shared module and export `getCategoryMap`**

In `app/lib/catalog/sets.ts`:

- Add import: `import { queryPartRarityBatch } from './rarity';`
- Delete lines 898-947 (the local `PartRarityRow` type, `RARITY_BATCH_SIZE` constant, and `queryPartRarityBatch` function)
- Export `getCategoryMap` by adding `export` to the function declaration on line 33: `export async function getCategoryMap()`

- [ ] **Step 6: Update `inventory.ts` to import from shared module**

In `app/lib/services/inventory.ts`:

- Add import: `import { queryPartRarityBatch } from '@/app/lib/catalog/rarity';`
- Delete lines 342-388 (the local `PartRarityRow` type, `RARITY_BATCH_SIZE` constant, and `queryPartRarity` function)
- Update the call on line 317 from `queryPartRarity(rarityClient, subpartPairs)` to `queryPartRarityBatch(rarityClient, subpartPairs)`

- [ ] **Step 7: Run existing tests to verify no regressions**

Run: `npm test -- --run app/lib/services/__tests__/inventory.test.ts app/api/inventory/__tests__/inventory.test.ts`
Expected: All existing tests PASS

- [ ] **Step 8: Commit**

```bash
git add app/lib/catalog/rarity.ts app/lib/catalog/__tests__/rarity.test.ts app/lib/catalog/sets.ts app/lib/services/inventory.ts
git commit -m "refactor: extract queryPartRarityBatch to shared catalog/rarity module"
```

---

### Task 2: Implement `getSetInventoriesLocalBatch`

The core batch catalog function that replaces N calls to `getSetInventoryLocal` with shared queries.

**Files:**

- Create: `app/lib/catalog/batchInventory.ts`
- Create: `app/lib/catalog/__tests__/batchInventory.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/lib/catalog/__tests__/batchInventory.test.ts
import type { InventoryRow } from '@/app/components/set/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Supabase mock — tracks chained query builder calls
// ---------------------------------------------------------------------------
type MockQueryResult = { data: unknown[] | null; error: null };

const queryResults = new Map<string, MockQueryResult>();

function setQueryResult(table: string, data: unknown[]) {
  queryResults.set(table, { data, error: null });
}

const mockIn = vi.fn((_col: string, _vals: unknown[]) => {
  // Return the result set for the current table being queried
  return Promise.resolve(currentResult);
});
const mockEq = vi.fn(() => ({ in: mockIn }));
const mockSelectChain = vi.fn(() => ({ in: mockIn, eq: mockEq }));
let currentResult: MockQueryResult = { data: [], error: null };
const mockFrom = vi.fn((table: string) => {
  currentResult = queryResults.get(table) ?? { data: [], error: null };
  return { select: mockSelectChain };
});

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => ({ from: mockFrom }),
}));

vi.mock('@/lib/metrics', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock rarity — return empty map
vi.mock('@/app/lib/catalog/rarity', () => ({
  queryPartRarityBatch: vi.fn().mockResolvedValue(new Map()),
}));

// Mock getCategoryMap (in-memory cached)
vi.mock('@/app/lib/catalog/sets', async importOriginal => {
  return {
    ...(await importOriginal<object>()),
  };
});

import { getSetInventoriesLocalBatch } from '../batchInventory';

describe('getSetInventoriesLocalBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryResults.clear();
  });

  it('returns empty map for empty input', async () => {
    const result = await getSetInventoriesLocalBatch([]);
    expect(result.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns empty arrays for sets not found in rb_inventories', async () => {
    setQueryResult('rb_inventories', []);

    const result = await getSetInventoriesLocalBatch(['99999-1']);
    expect(result.get('99999-1')).toEqual([]);
  });

  it('returns inventory rows for a found set', async () => {
    setQueryResult('rb_inventories', [
      { id: 100, set_num: '75192-1', version: 1 },
    ]);
    setQueryResult('rb_inventory_parts_public', [
      {
        inventory_id: 100,
        part_num: '3001',
        color_id: 1,
        quantity: 10,
        is_spare: false,
        element_id: null,
        img_url: null,
      },
    ]);
    setQueryResult('rb_inventory_minifigs', []);
    setQueryResult('rb_parts', [
      {
        part_num: '3001',
        name: 'Brick 2x4',
        part_cat_id: 11,
        image_url: null,
        bl_part_id: null,
      },
    ]);
    setQueryResult('rb_colors', [{ id: 1, name: 'White' }]);
    setQueryResult('rb_part_categories', [{ id: 11, name: 'Bricks' }]);

    const result = await getSetInventoriesLocalBatch(['75192-1']);
    const rows = result.get('75192-1');
    expect(rows).toBeDefined();
    expect(rows!.length).toBeGreaterThan(0);
    expect(rows![0].partId).toBe('3001');
    expect(rows![0].colorName).toBe('White');
    expect(rows![0].setNumber).toBe('75192-1');
  });

  it('groups parts by set when multiple sets are batched', async () => {
    setQueryResult('rb_inventories', [
      { id: 100, set_num: '75192-1', version: 1 },
      { id: 200, set_num: '10283-1', version: 1 },
    ]);
    setQueryResult('rb_inventory_parts_public', [
      {
        inventory_id: 100,
        part_num: '3001',
        color_id: 1,
        quantity: 10,
        is_spare: false,
        element_id: null,
        img_url: null,
      },
      {
        inventory_id: 200,
        part_num: '3002',
        color_id: 4,
        quantity: 5,
        is_spare: false,
        element_id: null,
        img_url: null,
      },
    ]);
    setQueryResult('rb_inventory_minifigs', []);
    setQueryResult('rb_parts', [
      {
        part_num: '3001',
        name: 'Brick 2x4',
        part_cat_id: null,
        image_url: null,
        bl_part_id: null,
      },
      {
        part_num: '3002',
        name: 'Brick 2x3',
        part_cat_id: null,
        image_url: null,
        bl_part_id: null,
      },
    ]);
    setQueryResult('rb_colors', [
      { id: 1, name: 'White' },
      { id: 4, name: 'Red' },
    ]);

    const result = await getSetInventoriesLocalBatch(['75192-1', '10283-1']);
    expect(result.get('75192-1')!.length).toBe(1);
    expect(result.get('10283-1')!.length).toBe(1);
    expect(result.get('75192-1')![0].partId).toBe('3001');
    expect(result.get('10283-1')![0].partId).toBe('3002');
  });
});
```

Note: This test uses a simplified Supabase mock. The mock routing by table name is imprecise — the implementation will be validated more thoroughly by the integration test in Task 5. The important thing here is testing the grouping/assembly logic.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/catalog/__tests__/batchInventory.test.ts`
Expected: FAIL — module `../batchInventory` not found

- [ ] **Step 3: Implement `getSetInventoriesLocalBatch`**

Create `app/lib/catalog/batchInventory.ts`. This is the largest piece of new code. Follow the 5-phase approach from the spec.

Key implementation details:

- Import `getCatalogReadClient` from `@/app/lib/db/catalogAccess`
- Import `queryPartRarityBatch` from `./rarity`
- Import `getCategoryMap`, `mapCategoryNameToParent`, `getBlMinifigImageUrl` from existing catalog modules
- Phase 2 must chunk inventory IDs: query `rb_inventory_parts_public` in groups where each group has at most ~10 inventory IDs, and use `.limit(10000)` as a safety net
- Phase 3 must chunk `rb_parts` `.in()` calls if deduplicated part count exceeds 1000
- Phase 5 row assembly must match `getSetInventoryLocal` lines 528-576 exactly (same fields, same conditional includes)

```typescript
// app/lib/catalog/batchInventory.ts
import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { getBlMinifigImageUrl } from '@/app/lib/catalog/minifigs';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { mapCategoryNameToParent } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

import { queryPartRarityBatch } from './rarity';
import { getCategoryMap } from './sets';

// ---------------------------------------------------------------------------
// Types for Supabase rows
// ---------------------------------------------------------------------------

type InventoryPartRow = {
  inventory_id: number;
  part_num: string;
  color_id: number;
  quantity: number;
  is_spare: boolean;
  element_id?: string | null;
  img_url?: string | null;
};

type InventoryRecord = {
  id: number;
  set_num: string;
  version: number | null;
};

type PartMetaRow = {
  part_num: string;
  name: string;
  part_cat_id: number | null;
  image_url: string | null;
  bl_part_id: string | null;
};

type ColorRow = {
  id: number;
  name: string;
};

type MinifigRarityRow = {
  fig_num: string;
  min_subpart_set_count: number;
  set_count: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max inventory IDs per parts query to stay under Supabase row limits */
const PARTS_QUERY_CHUNK_SIZE = 10;

/** Max items in a single .in() call for parts/colors */
const IN_CLAUSE_CHUNK_SIZE = 1000;

// ---------------------------------------------------------------------------
// Main batch function
// ---------------------------------------------------------------------------

/**
 * Batch-fetch inventory rows for multiple sets using shared Supabase queries.
 *
 * Returns a Map where each key is a set number and the value is an array of
 * InventoryRow[]. Sets not found in rb_inventories return empty arrays
 * (caller should fall back to Rebrickable API for those).
 */
export async function getSetInventoriesLocalBatch(
  setNumbers: string[]
): Promise<Map<string, InventoryRow[]>> {
  const result = new Map<string, InventoryRow[]>();
  if (setNumbers.length === 0) return result;

  const trimmedSets = setNumbers.map(s => s.trim()).filter(Boolean);
  // Initialize all sets with empty arrays
  for (const s of trimmedSets) result.set(s, []);

  const supabase = getCatalogReadClient();

  // ── Phase 1: Inventory discovery ──────────────────────────────────────────
  const { data: inventories, error: invError } = await supabase
    .from('rb_inventories')
    .select('id, set_num, version')
    .in('set_num', trimmedSets);

  if (invError) {
    throw new Error(
      `batchInventory: rb_inventories query failed: ${invError.message}`
    );
  }

  const inventoryRecords = (inventories as InventoryRecord[] | null) ?? [];
  if (inventoryRecords.length === 0) return result;

  // Pick latest version per set
  const bestBySet = new Map<string, InventoryRecord>();
  for (const inv of inventoryRecords) {
    const existing = bestBySet.get(inv.set_num);
    if (!existing || (inv.version ?? -1) > (existing.version ?? -1)) {
      bestBySet.set(inv.set_num, inv);
    }
  }

  const selectedInventories = Array.from(bestBySet.values());
  const invIdToSetNum = new Map<number, string>();
  for (const inv of selectedInventories) {
    invIdToSetNum.set(inv.id, inv.set_num);
  }
  const allInvIds = selectedInventories.map(inv => inv.id);

  // ── Phase 2: Parts + minifigs (chunked for row limits) ────────────────────
  const allParts: InventoryPartRow[] = [];
  const allMinifigs: Array<{
    inventory_id: number;
    fig_num: string;
    quantity: number;
  }> = [];

  // Chunk inventory IDs to keep row counts under Supabase limits
  const invIdChunks: number[][] = [];
  for (let i = 0; i < allInvIds.length; i += PARTS_QUERY_CHUNK_SIZE) {
    invIdChunks.push(allInvIds.slice(i, i + PARTS_QUERY_CHUNK_SIZE));
  }

  await Promise.all(
    invIdChunks.map(async chunk => {
      const [partsRes, minifigsRes] = await Promise.all([
        supabase
          .from('rb_inventory_parts_public')
          .select(
            'inventory_id, part_num, color_id, quantity, is_spare, element_id, img_url'
          )
          .in('inventory_id', chunk)
          .eq('is_spare', false)
          .limit(10000),
        supabase
          .from('rb_inventory_minifigs')
          .select('inventory_id, fig_num, quantity')
          .in('inventory_id', chunk),
      ]);

      if (partsRes.error) {
        throw new Error(
          `batchInventory: rb_inventory_parts_public failed: ${partsRes.error.message}`
        );
      }
      if (minifigsRes.error) {
        throw new Error(
          `batchInventory: rb_inventory_minifigs failed: ${minifigsRes.error.message}`
        );
      }

      allParts.push(...((partsRes.data as InventoryPartRow[]) ?? []));
      allMinifigs.push(
        ...((minifigsRes.data as Array<{
          inventory_id: number;
          fig_num: string;
          quantity: number;
        }>) ?? [])
      );
    })
  );

  // Group parts and minifigs by set number
  const partsBySet = new Map<string, InventoryPartRow[]>();
  for (const part of allParts) {
    const setNum = invIdToSetNum.get(part.inventory_id);
    if (!setNum) continue;
    const list = partsBySet.get(setNum) ?? [];
    list.push(part);
    partsBySet.set(setNum, list);
  }

  const minifigsBySet = new Map<
    string,
    Array<{ fig_num: string; quantity: number }>
  >();
  for (const mf of allMinifigs) {
    const setNum = invIdToSetNum.get(mf.inventory_id);
    if (!setNum) continue;
    const list = minifigsBySet.get(setNum) ?? [];
    list.push({ fig_num: mf.fig_num, quantity: mf.quantity });
    minifigsBySet.set(setNum, list);
  }

  // ── Phase 3: Shared metadata ──────────────────────────────────────────────
  const allPartNums = new Set<string>();
  const allColorIds = new Set<number>();
  for (const part of allParts) {
    if (part.part_num) allPartNums.add(part.part_num);
    if (part.color_id != null) allColorIds.add(part.color_id);
  }

  const partColorPairs = allParts.map(p => ({
    partNum: p.part_num,
    colorId: p.color_id,
  }));

  // Chunk .in() calls if needed
  const partNumArr = Array.from(allPartNums);
  const colorIdArr = Array.from(allColorIds);

  const partMetaPromises: Promise<{
    data: PartMetaRow[] | null;
    error: { message: string } | null;
  }>[] = [];
  for (let i = 0; i < partNumArr.length; i += IN_CLAUSE_CHUNK_SIZE) {
    const chunk = partNumArr.slice(i, i + IN_CLAUSE_CHUNK_SIZE);
    partMetaPromises.push(
      supabase
        .from('rb_parts')
        .select('part_num, name, part_cat_id, image_url, bl_part_id')
        .in('part_num', chunk)
        .limit(10000) as unknown as Promise<{
        data: PartMetaRow[] | null;
        error: { message: string } | null;
      }>
    );
  }

  const [partMetaResults, colorsRes, categoryMap, partRarityMap] =
    await Promise.all([
      Promise.all(partMetaPromises),
      colorIdArr.length
        ? supabase.from('rb_colors').select('id, name').in('id', colorIdArr)
        : Promise.resolve({ data: [] as ColorRow[], error: null }),
      getCategoryMap(),
      queryPartRarityBatch(supabase, partColorPairs),
    ]);

  // Merge chunked part metadata results
  const partMap = new Map<string, PartMetaRow>();
  for (const res of partMetaResults) {
    if (res.error) {
      throw new Error(
        `batchInventory: rb_parts query failed: ${res.error.message}`
      );
    }
    for (const part of res.data ?? []) {
      partMap.set(part.part_num, part);
    }
  }

  if (colorsRes.error) {
    throw new Error(
      `batchInventory: rb_colors query failed: ${colorsRes.error.message}`
    );
  }
  const colorMap = new Map<number, ColorRow>();
  for (const color of (colorsRes.data as ColorRow[]) ?? []) {
    colorMap.set(color.id, color);
  }

  // ── Phase 4: Minifig parent metadata ──────────────────────────────────────
  const allFigNums = new Set<string>();
  for (const mfs of minifigsBySet.values()) {
    for (const mf of mfs) {
      if (mf.fig_num?.trim()) allFigNums.add(mf.fig_num.trim());
    }
  }
  const figNumArr = Array.from(allFigNums);

  const figMetaById = new Map<
    string,
    {
      name?: string | null;
      num_parts?: number | null;
      bl_minifig_id?: string | null;
    }
  >();
  const figImgById = new Map<string, string | null>();
  const figRarityById = new Map<string, number>();

  if (figNumArr.length > 0) {
    const [figMetaRes, figImagesRes, figRarityRes] = await Promise.all([
      supabase
        .from('rb_minifigs')
        .select('fig_num, name, num_parts, bl_minifig_id')
        .in('fig_num', figNumArr),
      supabase
        .from('rb_minifig_images')
        .select('fig_num, image_url')
        .in('fig_num', figNumArr),
      supabase
        .from('rb_minifig_rarity' as never)
        .select('fig_num, min_subpart_set_count, set_count')
        .in('fig_num', figNumArr) as unknown as Promise<{
        data: MinifigRarityRow[] | null;
        error: { message: string } | null;
      }>,
    ]);

    if (figMetaRes.error) {
      throw new Error(
        `batchInventory: rb_minifigs failed: ${figMetaRes.error.message}`
      );
    }
    if (figImagesRes.error) {
      throw new Error(
        `batchInventory: rb_minifig_images failed: ${figImagesRes.error.message}`
      );
    }
    // Rarity failure is non-fatal
    if (figRarityRes.error) {
      logger.warn('batchInventory.minifig_rarity_failed', {
        error: figRarityRes.error.message,
      });
    }

    for (const m of figMetaRes.data ?? []) {
      figMetaById.set(m.fig_num, {
        name: m.name ?? null,
        num_parts: m.num_parts ?? null,
        bl_minifig_id: m.bl_minifig_id ?? null,
      });
    }
    for (const img of figImagesRes.data ?? []) {
      figImgById.set(
        img.fig_num,
        typeof img.image_url === 'string' && img.image_url.trim().length > 0
          ? img.image_url.trim()
          : null
      );
    }
    for (const r of figRarityRes.data ?? []) {
      figRarityById.set(r.fig_num, r.min_subpart_set_count);
    }
  }

  // ── Phase 5: Per-set assembly ─────────────────────────────────────────────
  for (const setNum of trimmedSets) {
    const setParts = partsBySet.get(setNum);
    if (!setParts || setParts.length === 0) continue; // stays empty array

    const rows: InventoryRow[] = setParts.map(row => {
      const part = partMap.get(row.part_num);
      const color = colorMap.get(row.color_id);
      const catId =
        typeof part?.part_cat_id === 'number' ? part.part_cat_id : undefined;
      const catName =
        typeof catId === 'number' ? categoryMap.get(catId)?.name : undefined;
      const parentCategory =
        catName != null ? mapCategoryNameToParent(catName) : undefined;
      const bricklinkPartId = part?.bl_part_id ?? null;
      const elementId =
        typeof row.element_id === 'string' && row.element_id.trim().length > 0
          ? row.element_id.trim()
          : null;
      const imageUrl =
        (typeof row.img_url === 'string' && row.img_url.trim().length > 0
          ? row.img_url.trim()
          : null) ??
        part?.image_url ??
        null;
      const setCount =
        partRarityMap.get(`${row.part_num}:${row.color_id}`) ?? null;

      return {
        setNumber: setNum,
        partId: row.part_num,
        partName: part?.name ?? row.part_num,
        colorId: row.color_id,
        colorName: color?.name ?? `Color ${row.color_id}`,
        quantityRequired: row.quantity,
        imageUrl,
        elementId,
        ...(typeof catId === 'number' && { partCategoryId: catId }),
        ...(catName && { partCategoryName: catName }),
        ...(parentCategory && { parentCategory }),
        inventoryKey: `${row.part_num}:${row.color_id}`,
        ...(bricklinkPartId &&
          bricklinkPartId !== row.part_num && { bricklinkPartId }),
        ...(setCount != null && { setCount }),
      };
    });

    // Minifig parent rows
    const setMinifigs = minifigsBySet.get(setNum) ?? [];
    const validMinifigs = setMinifigs.filter(
      f => typeof f.fig_num === 'string' && f.fig_num.trim().length > 0
    );

    for (const invFig of validMinifigs) {
      const figNum = invFig.fig_num.trim();
      const parentQuantity =
        typeof invFig.quantity === 'number' && Number.isFinite(invFig.quantity)
          ? invFig.quantity
          : 1;
      const parentKey = `fig:${figNum}`;
      const meta = figMetaById.get(figNum);
      const blMinifigId = meta?.bl_minifig_id ?? null;
      const figSetCount = figRarityById.get(figNum) ?? null;

      rows.push({
        setNumber: setNum,
        partId: parentKey,
        partName: meta?.name ?? figNum,
        colorId: 0,
        colorName: '—',
        quantityRequired: parentQuantity,
        imageUrl:
          figImgById.get(figNum) ??
          (blMinifigId ? getBlMinifigImageUrl(blMinifigId) : null),
        partCategoryName: 'Minifig',
        parentCategory: 'Minifigure',
        inventoryKey: parentKey,
        ...(blMinifigId && { bricklinkFigId: blMinifigId }),
        ...(figSetCount != null && { setCount: figSetCount }),
      });
    }

    result.set(setNum, rows);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/catalog/__tests__/batchInventory.test.ts`
Expected: Tests pass (some may need mock adjustments — fix as needed)

- [ ] **Step 5: Export from catalog index**

Check if `app/lib/catalog/index.ts` exists. If so, add:

```typescript
export { getSetInventoriesLocalBatch } from './batchInventory';
```

If there is no index file, the service layer will import directly from `./batchInventory`.

- [ ] **Step 6: Run type-check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 7: Commit**

```bash
git add app/lib/catalog/batchInventory.ts app/lib/catalog/__tests__/batchInventory.test.ts
git commit -m "feat: add getSetInventoriesLocalBatch for batched catalog queries"
```

---

## Chunk 2: Batch Service Function & Route

### Task 3: Implement `getSetInventoriesBatchWithMeta`

The service function that orchestrates the batch pipeline: catalog batch → fallback → identity resolution → minifig enrichment → rarity → image backfill.

**Files:**

- Modify: `app/lib/services/inventory.ts` (add new exported function)
- Create: `app/lib/services/__tests__/inventoryBatch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/lib/services/__tests__/inventoryBatch.test.ts
import type { InventoryRow } from '@/app/components/set/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the batch catalog function
const mockBatchLocal =
  vi.fn<(sets: string[]) => Promise<Map<string, InventoryRow[]>>>();
vi.mock('@/app/lib/catalog/batchInventory', () => ({
  getSetInventoriesLocalBatch: (...args: unknown[]) =>
    mockBatchLocal(...(args as [string[]])),
}));

// Mock Rebrickable fallback
const mockGetSetInventory = vi.fn<() => Promise<InventoryRow[]>>();
vi.mock('@/app/lib/rebrickable', () => ({
  getSetInventory: (...args: unknown[]) => mockGetSetInventory(...(args as [])),
}));

vi.mock('@/app/lib/rebrickable/client', () => ({
  rbFetch: vi.fn().mockResolvedValue({ results: [], next: null }),
  rbFetchAbsolute: vi.fn().mockResolvedValue({ results: [], next: null }),
}));

// Mock identity resolution
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
  resolveMinifigParentIdentity: vi.fn((blId: string) => ({
    canonicalKey: `fig:${blId}`,
    rbPartId: null,
    rbColorId: null,
    blPartId: null,
    blColorId: null,
    elementId: null,
    rowType: 'minifig_parent' as const,
    blMinifigId: blId,
    rbFigNum: blId,
  })),
  resolveRbMinifigSubpartIdentity: vi.fn(
    (rbPartId: string, rbColorId: number) => ({
      canonicalKey: `${rbPartId}:${rbColorId}`,
      rbPartId,
      rbColorId,
      blPartId: rbPartId,
      blColorId: null,
      elementId: null,
      rowType: 'matched_subpart' as const,
    })
  ),
}));

// Mock Supabase for minifig subparts query
vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: () => ({
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [], error: null }),
        or: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
  getCatalogWriteClient: () => ({
    from: () => ({
      select: () => ({
        in: () => ({
          gte: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

// Mock rarity
vi.mock('@/app/lib/catalog/rarity', () => ({
  queryPartRarityBatch: vi.fn().mockResolvedValue(new Map()),
}));

// Mock image backfill
vi.mock('@/app/lib/services/imageBackfill', () => ({
  backfillBLImages: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getSetInventoriesBatchWithMeta } from '../inventory';

// Helper row
const makeRow = (
  setNumber: string,
  partId: string,
  colorId: number
): InventoryRow => ({
  setNumber,
  partId,
  partName: `Part ${partId}`,
  colorId,
  colorName: `Color ${colorId}`,
  quantityRequired: 1,
  imageUrl: null,
  inventoryKey: `${partId}:${colorId}`,
});

describe('getSetInventoriesBatchWithMeta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty map for empty input', async () => {
    const result = await getSetInventoriesBatchWithMeta([]);
    expect(result.size).toBe(0);
  });

  it('returns inventory results keyed by set number', async () => {
    const rowsMap = new Map<string, InventoryRow[]>();
    rowsMap.set('75192-1', [makeRow('75192-1', '3001', 1)]);
    rowsMap.set('10283-1', [makeRow('10283-1', '3002', 4)]);
    mockBatchLocal.mockResolvedValue(rowsMap);

    const result = await getSetInventoriesBatchWithMeta(['75192-1', '10283-1']);

    expect(result.size).toBe(2);
    expect(result.get('75192-1')!.rows.length).toBe(1);
    expect(result.get('10283-1')!.rows.length).toBe(1);
  });

  it('falls back to Rebrickable for sets with empty catalog results', async () => {
    const rowsMap = new Map<string, InventoryRow[]>();
    rowsMap.set('75192-1', [makeRow('75192-1', '3001', 1)]);
    rowsMap.set('99999-1', []); // not in catalog
    mockBatchLocal.mockResolvedValue(rowsMap);

    const rbRow = makeRow('99999-1', '9999', 0);
    mockGetSetInventory.mockResolvedValue([rbRow]);

    const result = await getSetInventoriesBatchWithMeta(['75192-1', '99999-1']);

    expect(result.size).toBe(2);
    expect(mockGetSetInventory).toHaveBeenCalledWith('99999-1');
  });

  it('handles Rebrickable fallback failure gracefully', async () => {
    const rowsMap = new Map<string, InventoryRow[]>();
    rowsMap.set('99999-1', []);
    mockBatchLocal.mockResolvedValue(rowsMap);
    mockGetSetInventory.mockRejectedValue(new Error('API down'));

    const result = await getSetInventoriesBatchWithMeta(['99999-1']);

    // Set should be absent from results (failed)
    expect(result.has('99999-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/lib/services/__tests__/inventoryBatch.test.ts`
Expected: FAIL — `getSetInventoriesBatchWithMeta` not exported from `../inventory`

- [ ] **Step 3: Implement `getSetInventoriesBatchWithMeta` in `inventory.ts`**

Add to the bottom of `app/lib/services/inventory.ts` (before the rarity helper section, or after removing it in Task 1):

```typescript
import { getSetInventoriesLocalBatch } from '@/app/lib/catalog/batchInventory';
import { queryPartRarityBatch } from '@/app/lib/catalog/rarity';

/**
 * Batch version of getSetInventoryRowsWithMeta.
 * Fetches inventories for multiple sets with shared queries.
 */
export async function getSetInventoriesBatchWithMeta(
  setNumbers: string[]
): Promise<Map<string, InventoryResult>> {
  const results = new Map<string, InventoryResult>();
  if (setNumbers.length === 0) return results;

  // 1. Batch catalog fetch
  const catalogMap = await getSetInventoriesLocalBatch(setNumbers);

  // 2. Rebrickable fallback for sets with empty results
  const fallbackSets: string[] = [];
  for (const [setNum, rows] of catalogMap) {
    if (rows.length === 0) fallbackSets.push(setNum);
  }

  if (fallbackSets.length > 0) {
    await Promise.allSettled(
      fallbackSets.map(async setNum => {
        try {
          const rows = await getSetInventory(setNum);
          if (rows.length > 0) {
            catalogMap.set(setNum, rows);
          }
        } catch (err) {
          logger.warn('inventoryBatch.rebrickable_fallback_failed', {
            setNumber: setNum,
            error: err instanceof Error ? err.message : String(err),
          });
          // Remove from catalogMap so it's excluded from results
          catalogMap.delete(setNum);
        }
      })
    );
  }

  // 3. Build resolution context once from all rows
  const allRows: InventoryRow[] = [];
  for (const rows of catalogMap.values()) {
    allRows.push(...rows);
  }

  if (allRows.length === 0) return results;

  const ctx = await buildResolutionContext(allRows);

  // 4. Per-set identity resolution (in-memory)
  for (const [setNum, rows] of catalogMap) {
    if (rows.length === 0) continue;

    for (const row of rows) {
      if (!row.partId.startsWith('fig:')) {
        row.identity = resolveCatalogPartIdentity(row, ctx);
        row.inventoryKey = row.identity.canonicalKey;
      }
    }
  }

  // 5. Batch minifig subparts — single query for all fig_nums across all sets
  const allFigNums = new Set<string>();
  for (const rows of catalogMap.values()) {
    for (const row of rows) {
      if (
        row.parentCategory === 'Minifigure' &&
        row.partId.startsWith('fig:')
      ) {
        allFigNums.add(row.partId.slice(4));
      }
    }
  }

  // Fetch all subparts at once
  let subpartsByFig = new Map<
    string,
    Array<{
      rbPartId: string;
      rbColorId: number;
      colorName: string;
      partName: string;
      quantity: number;
      blPartId: string | null;
      partImageUrl: string | null;
    }>
  >();

  if (allFigNums.size > 0) {
    const supabase = getCatalogReadClient();
    const { data: allSubparts, error: subpartsErr } = await supabase
      .from('rb_minifig_parts')
      .select(
        'fig_num, part_num, color_id, quantity, img_url, rb_parts!inner(name, bl_part_id), rb_colors!inner(name)'
      )
      .in('fig_num', Array.from(allFigNums));

    if (subpartsErr) {
      logger.warn('inventoryBatch.subparts_failed', {
        error: subpartsErr.message,
      });
    }

    for (const sp of allSubparts ?? []) {
      const partMeta = sp.rb_parts as unknown as {
        name: string;
        bl_part_id: string | null;
      };
      const colorMeta = sp.rb_colors as unknown as { name: string };

      const list = subpartsByFig.get(sp.fig_num) ?? [];
      list.push({
        rbPartId: sp.part_num,
        rbColorId: sp.color_id,
        colorName: colorMeta.name,
        partName: partMeta.name,
        quantity: sp.quantity ?? 1,
        blPartId: partMeta.bl_part_id,
        partImageUrl: (sp as Record<string, unknown>).img_url as string | null,
      });
      subpartsByFig.set(sp.fig_num, list);
    }
  }

  // 6. Per-set minifig enrichment (uses shared subpartsByFig and ctx)
  for (const [setNum, rows] of catalogMap) {
    // Apply minifig parent identity resolution
    const minifigParents = rows.filter(
      row =>
        row.parentCategory === 'Minifigure' && row.partId.startsWith('fig:')
    );

    if (minifigParents.length === 0) {
      results.set(setNum, { rows });
      continue;
    }

    for (const parent of minifigParents) {
      const rbFigNum = parent.partId.slice(4);
      const blMinifigId = parent.bricklinkFigId ?? null;
      parent.identity = resolveMinifigParentIdentity(
        blMinifigId ?? rbFigNum,
        rbFigNum
      );
      parent.inventoryKey = parent.identity.canonicalKey;
    }

    // Build parent lookup
    const parentByFigNum = new Map<string, InventoryRow>();
    for (const parent of minifigParents) {
      parentByFigNum.set(parent.partId.slice(4), parent);
    }

    // Track child rows by canonical key for dedup
    const childRowsByKey = new Map<string, InventoryRow>();
    const rowsByCanonicalKey = new Map<string, number>();
    const directCatalogKeys = new Set<string>();
    rows.forEach((row, idx) => {
      const key =
        row.identity?.canonicalKey ??
        row.inventoryKey ??
        `${row.partId}:${row.colorId}`;
      rowsByCanonicalKey.set(key, idx);
      if (!row.partId.startsWith('fig:')) {
        directCatalogKeys.add(key);
      }
    });

    // Create child rows for subparts (same logic as getSetInventoryRowsWithMeta)
    const figNums = minifigParents.map(p => p.partId.slice(4));
    for (const figNum of figNums) {
      const subparts = subpartsByFig.get(figNum) ?? [];
      const parentRow = parentByFigNum.get(figNum);
      const blMinifigId = parentRow?.bricklinkFigId ?? figNum;
      const parentKey =
        parentRow?.identity?.canonicalKey ?? `fig:${blMinifigId}`;
      const minifigQty = parentRow?.quantityRequired ?? 1;

      for (const sp of subparts) {
        const subpartIdentity = resolveRbMinifigSubpartIdentity(
          sp.rbPartId,
          sp.rbColorId,
          ctx,
          sp.blPartId
        );
        const canonicalKey = subpartIdentity.canonicalKey;
        const totalQtyForThisMinifig = sp.quantity * minifigQty;
        const blPartId = sp.blPartId ?? sp.rbPartId;

        const existingIdx = rowsByCanonicalKey.get(canonicalKey);

        if (existingIdx != null) {
          const existing = rows[existingIdx]!;
          if (!existing.imageUrl && sp.partImageUrl) {
            existing.imageUrl = sp.partImageUrl;
          }
          if (!existing.bricklinkPartId && blPartId !== existing.partId) {
            existing.bricklinkPartId = blPartId;
          }
          if (!existing.identity) existing.identity = subpartIdentity;
          existing.parentCategory = existing.parentCategory ?? 'Minifigure';
          existing.partCategoryName =
            existing.partCategoryName ?? 'Minifigure Component';
          if (!existing.parentRelations) existing.parentRelations = [];
          const alreadyLinked = existing.parentRelations.some(
            rel => rel.parentKey === parentKey
          );
          if (!alreadyLinked) {
            if (!directCatalogKeys.has(canonicalKey)) {
              existing.quantityRequired += totalQtyForThisMinifig;
            }
            existing.parentRelations.push({ parentKey, quantity: sp.quantity });
          }
        } else if (childRowsByKey.has(canonicalKey)) {
          const childRow = childRowsByKey.get(canonicalKey)!;
          if (!childRow.parentRelations) childRow.parentRelations = [];
          const alreadyLinked = childRow.parentRelations.some(
            rel => rel.parentKey === parentKey
          );
          if (!alreadyLinked) {
            childRow.quantityRequired += totalQtyForThisMinifig;
            childRow.parentRelations.push({ parentKey, quantity: sp.quantity });
          }
        } else {
          const childRow: InventoryRow = {
            setNumber: setNum,
            partId: sp.rbPartId,
            partName: sp.partName ?? sp.rbPartId,
            colorId: sp.rbColorId,
            colorName: sp.colorName ?? `Color ${sp.rbColorId}`,
            quantityRequired: totalQtyForThisMinifig,
            imageUrl: sp.partImageUrl,
            parentCategory: 'Minifigure',
            partCategoryName: 'Minifigure Component',
            inventoryKey: canonicalKey,
            parentRelations: [{ parentKey, quantity: sp.quantity }],
            ...(blPartId !== sp.rbPartId && { bricklinkPartId: blPartId }),
            identity: subpartIdentity,
          };
          childRowsByKey.set(canonicalKey, childRow);
        }
      }
    }

    // Append child rows
    for (const childRow of childRowsByKey.values()) {
      rows.push(childRow);
      rowsByCanonicalKey.set(
        childRow.identity?.canonicalKey ?? childRow.inventoryKey,
        rows.length - 1
      );
    }

    // Build componentRelations on parent rows
    for (const parent of minifigParents) {
      const figNum = parent.partId.slice(4);
      const subparts = subpartsByFig.get(figNum) ?? [];
      if (subparts.length > 0) {
        const relationMap = new Map<string, number>();
        for (const sp of subparts) {
          const spIdentity = resolveRbMinifigSubpartIdentity(
            sp.rbPartId,
            sp.rbColorId,
            ctx
          );
          const key = spIdentity.canonicalKey;
          relationMap.set(key, (relationMap.get(key) ?? 0) + sp.quantity);
        }
        parent.componentRelations = Array.from(relationMap.entries()).map(
          ([key, quantity]) => ({ key, quantity })
        );
      }
    }

    results.set(setNum, {
      rows,
      minifigMeta: { totalMinifigs: minifigParents.length },
    });
  }

  // Handle sets with no minifigs that weren't added yet
  for (const [setNum, rows] of catalogMap) {
    if (!results.has(setNum) && rows.length > 0) {
      results.set(setNum, { rows });
    }
  }

  // 7. Batch rarity enrichment for subpart rows
  try {
    const subpartPairs: Array<{ partNum: string; colorId: number }> = [];
    const subpartRows: InventoryRow[] = [];
    for (const { rows } of results.values()) {
      for (const row of rows) {
        if (row.setCount == null && !row.partId.startsWith('fig:')) {
          subpartPairs.push({ partNum: row.partId, colorId: row.colorId });
          subpartRows.push(row);
        }
      }
    }

    if (subpartPairs.length > 0) {
      const rarityClient = getCatalogReadClient();
      const rarityMap = await queryPartRarityBatch(rarityClient, subpartPairs);
      for (const row of subpartRows) {
        row.setCount = rarityMap.get(`${row.partId}:${row.colorId}`) ?? null;
      }
    }
  } catch (err) {
    logger.warn('inventoryBatch.rarity_enrichment_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // 8. Batch image backfill
  try {
    const allResultRows: InventoryRow[] = [];
    for (const { rows } of results.values()) {
      allResultRows.push(...rows);
    }
    await backfillBLImages(allResultRows);
  } catch (err) {
    logger.warn('inventoryBatch.image_backfill_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return results;
}
```

Note: The function must also import `backfillBLImages` from `./imageBackfill` — add this import at the top of `inventory.ts` alongside existing imports.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/lib/services/__tests__/inventoryBatch.test.ts`
Expected: PASS

- [ ] **Step 5: Run all existing inventory tests**

Run: `npm test -- --run app/lib/services/__tests__/inventory.test.ts app/api/inventory/__tests__/inventory.test.ts`
Expected: All PASS (no regressions)

- [ ] **Step 6: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add app/lib/services/inventory.ts app/lib/services/__tests__/inventoryBatch.test.ts
git commit -m "feat: add getSetInventoriesBatchWithMeta service function"
```

---

### Task 4: Implement batch route handler

**Files:**

- Create: `app/api/inventory/batch/route.ts`
- Create: `app/api/inventory/batch/__tests__/batch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/api/inventory/batch/__tests__/batch.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mock the batch service
const mockBatchWithMeta = vi.fn();
vi.mock('@/app/lib/services/inventory', () => ({
  getSetInventoriesBatchWithMeta: (...args: unknown[]) =>
    mockBatchWithMeta(...args),
}));

// Mock catalog access for version check
const mockMaybeSingle = vi.fn();
const mockVersionEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockVersionSelect = vi.fn(() => ({ eq: mockVersionEq }));
const mockVersionFrom = vi.fn(() => ({ select: mockVersionSelect }));

vi.mock('@/app/lib/db/catalogAccess', () => ({
  getCatalogReadClient: vi.fn(() => ({
    from: mockVersionFrom,
  })),
}));

vi.mock('@/lib/metrics', () => ({
  incrementCounter: vi.fn(),
  logEvent: vi.fn(),
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { _resetVersionCache } from '../../versionCache';
import { POST } from '../route';

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/inventory/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/inventory/batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetVersionCache();
    mockMaybeSingle.mockResolvedValue({
      data: { version: '2024-01-15' },
      error: null,
    });
  });

  describe('validation', () => {
    it('returns 400 when body is missing sets', async () => {
      const res = await POST(createRequest({}));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('validation_failed');
    });

    it('returns 400 when sets is empty', async () => {
      const res = await POST(createRequest({ sets: [] }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when sets exceeds 50', async () => {
      const sets = Array.from({ length: 51 }, (_, i) => `${i}-1`);
      const res = await POST(createRequest({ sets }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when sets contains empty strings', async () => {
      const res = await POST(createRequest({ sets: [''] }));
      expect(res.status).toBe(400);
    });
  });

  describe('successful responses', () => {
    it('returns inventories keyed by set number', async () => {
      const resultsMap = new Map();
      resultsMap.set('75192-1', {
        rows: [
          {
            setNumber: '75192-1',
            partId: '3001',
            partName: 'Brick',
            colorId: 1,
            colorName: 'White',
            quantityRequired: 10,
            imageUrl: null,
            inventoryKey: '3001:1',
          },
        ],
      });
      mockBatchWithMeta.mockResolvedValue(resultsMap);

      const res = await POST(createRequest({ sets: ['75192-1'] }));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.inventories['75192-1']).toBeDefined();
      expect(json.inventories['75192-1'].rows.length).toBe(1);
      expect(json.inventoryVersion).toBe('2024-01-15');
      expect(json.partial).toBe(false);
    });

    it('sets partial=true when some sets are missing from results', async () => {
      const resultsMap = new Map();
      resultsMap.set('75192-1', { rows: [] });
      // '99999-1' is missing from results
      mockBatchWithMeta.mockResolvedValue(resultsMap);

      const res = await POST(createRequest({ sets: ['75192-1', '99999-1'] }));
      const json = await res.json();
      expect(json.partial).toBe(true);
    });

    it('includes meta when includeMeta=true', async () => {
      const resultsMap = new Map();
      resultsMap.set('75192-1', {
        rows: [],
        minifigMeta: { totalMinifigs: 6 },
      });
      mockBatchWithMeta.mockResolvedValue(resultsMap);

      const res = await POST(
        createRequest({ sets: ['75192-1'], includeMeta: true })
      );
      const json = await res.json();
      expect(json.inventories['75192-1'].meta).toEqual({ totalMinifigs: 6 });
    });

    it('sets cache control headers', async () => {
      mockBatchWithMeta.mockResolvedValue(new Map());

      const res = await POST(createRequest({ sets: ['75192-1'] }));
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    });
  });

  describe('error handling', () => {
    it('returns 500 when batch service throws', async () => {
      mockBatchWithMeta.mockRejectedValue(new Error('DB error'));

      const res = await POST(createRequest({ sets: ['75192-1'] }));
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toBe('inventory_batch_failed');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run app/api/inventory/batch/__tests__/batch.test.ts`
Expected: FAIL — module `../route` not found

First, extract `getInventoryVersion` from `app/api/inventory/route.ts` into `app/api/inventory/versionCache.ts` so both routes can share it. Add to `versionCache.ts`:

```typescript
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

export async function getInventoryVersion(): Promise<string | null> {
  const now = Date.now();
  const cached = getVersionCache();
  if (cached && now - cached.at < VERSION_CACHE_TTL_MS) {
    return cached.version;
  }

  try {
    const supabase = getCatalogReadClient();
    const { data, error } = await supabase
      .from('rb_download_versions')
      .select('version')
      .eq('source', 'inventory_parts')
      .maybeSingle();
    if (error) {
      logger.warn('inventory.version.read_failed', { error: error.message });
      return null;
    }
    const version = (data?.version as string | null | undefined) ?? null;
    setVersionCache({ at: now, version });
    return version;
  } catch (err) {
    logger.warn('inventory.version.error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
```

Then update `app/api/inventory/route.ts` to import `getInventoryVersion` from `./versionCache` instead of defining it locally. Delete the local `getInventoryVersion` function (lines 25-52) and add:

```typescript
import { getInventoryVersion } from './versionCache';
```

- [ ] **Step 3: Implement the route handler**

```typescript
// app/api/inventory/batch/route.ts
import { errorResponse } from '@/app/lib/api/responses';
import { getSetInventoriesBatchWithMeta } from '@/app/lib/services/inventory';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getInventoryVersion } from '../versionCache';

export const dynamic = 'force-dynamic';

const CACHE_CONTROL = 'private, max-age=300';
const MAX_BATCH_SIZE = 50;

const bodySchema = z.object({
  sets: z.array(z.string().min(1).max(200)).min(1).max(MAX_BATCH_SIZE),
  includeMeta: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation_failed', {
      message: 'Invalid JSON body',
    });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    incrementCounter('inventory_batch_validation_failed', {
      issues: parsed.error.flatten(),
    });
    return errorResponse('validation_failed', {
      details: { issues: parsed.error.flatten() },
    });
  }

  const { sets, includeMeta } = parsed.data;

  try {
    const [inventoryVersion, resultsMap] = await Promise.all([
      getInventoryVersion(),
      getSetInventoriesBatchWithMeta(sets),
    ]);

    incrementCounter('inventory_batch_fetched', {
      requestedSets: sets.length,
      returnedSets: resultsMap.size,
    });

    // Build response
    const inventories: Record<
      string,
      {
        rows: unknown[];
        meta?: { totalMinifigs: number };
      }
    > = {};

    for (const [setNum, result] of resultsMap) {
      const entry: { rows: unknown[]; meta?: { totalMinifigs: number } } = {
        rows: result.rows,
      };
      if (includeMeta && result.minifigMeta) {
        entry.meta = result.minifigMeta;
      }
      inventories[setNum] = entry;
    }

    const partial = sets.some(s => !resultsMap.has(s));

    logEvent('inventory_batch_response', {
      requestedSets: sets.length,
      returnedSets: resultsMap.size,
      partial,
    });

    return NextResponse.json(
      { inventories, inventoryVersion, partial },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    incrementCounter('inventory_batch_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('inventory.batch.route.failed', {
      sets,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('inventory_batch_failed');
  }
}
```

Note: `AppErrorCode` has an open string union (`| (string & {})`) so `'inventory_batch_failed'` works without modifying `errors.ts`. The `STATUS_MAP` defaults to 500 for unknown codes, which is correct here. Optionally add `inventory_batch_failed: 500` to `STATUS_MAP` and the `AppErrorCode` union for explicitness.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run app/api/inventory/batch/__tests__/batch.test.ts`
Expected: PASS

- [ ] **Step 5: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add app/api/inventory/batch/route.ts app/api/inventory/batch/__tests__/batch.test.ts
git commit -m "feat: add POST /api/inventory/batch route handler"
```

---

## Chunk 3: Client Integration

### Task 5: Update `loadCatalogPartsForSets` to use batch endpoint

**Files:**

- Modify: `app/hooks/useCollectionParts.ts:25-78`

- [ ] **Step 1: Add the batch fetch helper function**

Add above `loadCatalogPartsForSets` in `useCollectionParts.ts`:

```typescript
const BATCH_ENDPOINT_MAX_SETS = 50;

/**
 * Fetch inventories for multiple sets via the batch endpoint.
 * Chunks into groups of BATCH_ENDPOINT_MAX_SETS.
 */
async function fetchInventoriesBatch(setNumbers: string[]): Promise<
  Map<
    string,
    {
      rows: import('@/app/components/set/types').InventoryRow[];
      inventoryVersion?: string | null;
    }
  >
> {
  const result = new Map<
    string,
    {
      rows: import('@/app/components/set/types').InventoryRow[];
      inventoryVersion?: string | null;
    }
  >();

  // Chunk into groups of 50
  const chunks: string[][] = [];
  for (let i = 0; i < setNumbers.length; i += BATCH_ENDPOINT_MAX_SETS) {
    chunks.push(setNumbers.slice(i, i + BATCH_ENDPOINT_MAX_SETS));
  }

  await Promise.all(
    chunks.map(async chunk => {
      try {
        const res = await fetch('/api/inventory/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sets: chunk }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          inventories: Record<
            string,
            {
              rows: import('@/app/components/set/types').InventoryRow[];
            }
          >;
          inventoryVersion?: string | null;
        };
        for (const [setNum, entry] of Object.entries(data.inventories)) {
          result.set(setNum, {
            rows: entry.rows,
            inventoryVersion: data.inventoryVersion,
          });
        }
      } catch {
        // Graceful — skip this chunk
      }
    })
  );

  return result;
}
```

- [ ] **Step 2: Update `loadCatalogPartsForSets` to use batch for multiple uncached sets**

Replace the uncached fetching block (the `if (uncached.length > 0)` section, lines 47-75) with:

```typescript
// Fetch uncached inventories
if (uncached.length === 1) {
  // Single set — use existing endpoint
  const setNum = uncached[0]!;
  try {
    const res = await fetch(`/api/inventory?set=${encodeURIComponent(setNum)}`);
    if (res.ok) {
      const data = (await res.json()) as {
        rows: import('@/app/components/set/types').InventoryRow[];
        inventoryVersion?: string | null;
      };
      if (data.rows.length > 0) {
        await setCachedInventory(setNum, data.rows, {
          inventoryVersion: data.inventoryVersion ?? null,
        });
        const parts = await db.catalogSetParts
          .where('setNumber')
          .equals(setNum)
          .toArray();
        if (parts.length > 0) result.set(setNum, parts);
      }
    }
  } catch {
    // Graceful degradation
  }
} else if (uncached.length > 1) {
  // Multiple sets — use batch endpoint
  const batchResults = await fetchInventoriesBatch(uncached);
  await Promise.all(
    Array.from(batchResults.entries()).map(async ([setNum, data]) => {
      try {
        if (data.rows.length > 0) {
          await setCachedInventory(setNum, data.rows, {
            inventoryVersion: data.inventoryVersion ?? null,
          });
          const parts = await db.catalogSetParts
            .where('setNumber')
            .equals(setNum)
            .toArray();
          if (parts.length > 0) result.set(setNum, parts);
        }
      } catch {
        // Graceful — skip individual cache failures
      }
    })
  );
}
```

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/hooks/useCollectionParts.ts
git commit -m "feat: use batch inventory endpoint for multiple uncached sets"
```

---

### Task 6: Run all tests and verify

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: All tests pass

- [ ] **Step 2: Run lint and type-check**

Run: `npm run lint && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual smoke test**

If the dev server is running:

1. Clear IndexedDB in browser devtools (Application → IndexedDB → delete database)
2. Navigate to the collection page with owned sets
3. Open Network tab — verify a single `POST /api/inventory/batch` request instead of N individual requests
4. Verify all set inventories load correctly
5. Add one new set as owned, verify only a single `GET /api/inventory` fires for it

- [ ] **Step 4: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "fix: address test/lint issues from batch inventory implementation"
```
