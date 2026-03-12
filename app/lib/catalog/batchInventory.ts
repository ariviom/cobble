import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { getBlMinifigImageUrl } from '@/app/lib/catalog/minifigs';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { mapCategoryNameToParent } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';

import { queryPartRarityBatch } from './rarity';
import { getCategoryMap } from './sets';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type InventoryPartRow = {
  part_num: string;
  color_id: number;
  quantity: number;
  is_spare: boolean;
  element_id?: string | null;
  img_url?: string | null;
};

type MinifigRarityRow = {
  fig_num: string;
  min_subpart_set_count: number;
  set_count: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max inventory IDs per `.in()` clause for parts/minifigs queries. */
const INV_ID_CHUNK_SIZE = 10;

/** Max part_nums per `.in()` clause for rb_parts metadata query. */
const PART_NUM_CHUNK_SIZE = 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Batch-fetch set inventories for multiple sets in shared queries.
 *
 * Returns a Map where every requested set number has an entry.  Sets not found
 * in `rb_inventories` get an empty array (so the caller can trigger a
 * Rebrickable API fallback).
 */
export async function getSetInventoriesLocalBatch(
  setNumbers: string[]
): Promise<Map<string, InventoryRow[]>> {
  const result = new Map<string, InventoryRow[]>();

  // Normalise & dedupe input; initialise every key with empty array
  const trimmed = setNumbers.map(s => s.trim()).filter(s => s.length > 0);
  const uniqueSetNums = Array.from(new Set(trimmed));
  for (const s of uniqueSetNums) {
    result.set(s, []);
  }
  if (uniqueSetNums.length === 0) return result;

  const supabase = getCatalogReadClient();

  // =========================================================================
  // Phase 1 — Inventory discovery (1 query)
  // =========================================================================

  const { data: inventories, error: inventoriesError } = await supabase
    .from('rb_inventories')
    .select('id, set_num, version')
    .in('set_num', uniqueSetNums);

  if (inventoriesError) {
    throw new Error(
      `batchInventory rb_inventories failed: ${inventoriesError.message}`
    );
  }

  // Pick latest version per set number
  const latestBySet = new Map<string, { id: number; version: number }>();
  for (const row of inventories ?? []) {
    if (typeof row?.id !== 'number' || !Number.isFinite(row.id)) continue;
    if (typeof row.set_num !== 'string') continue;
    const version = row.version ?? -1;
    const existing = latestBySet.get(row.set_num);
    if (!existing || version > existing.version) {
      latestBySet.set(row.set_num, { id: row.id, version });
    }
  }

  // Build invId → setNum mapping
  const invIdToSetNum = new Map<number, string>();
  for (const [setNum, inv] of latestBySet) {
    invIdToSetNum.set(inv.id, setNum);
  }

  const allInvIds = Array.from(invIdToSetNum.keys());
  if (allInvIds.length === 0) return result; // all sets missing from catalog

  // =========================================================================
  // Phase 2 — Parts + minifigs (chunked parallel queries)
  // =========================================================================

  const allParts: Array<InventoryPartRow & { inventory_id: number }> = [];
  const allMinifigs: Array<{
    inventory_id: number;
    fig_num: string;
    quantity: number;
  }> = [];

  const invIdChunks: number[][] = [];
  for (let i = 0; i < allInvIds.length; i += INV_ID_CHUNK_SIZE) {
    invIdChunks.push(allInvIds.slice(i, i + INV_ID_CHUNK_SIZE));
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
          `batchInventory rb_inventory_parts_public failed: ${partsRes.error.message}`
        );
      }
      if (minifigsRes.error) {
        throw new Error(
          `batchInventory rb_inventory_minifigs failed: ${minifigsRes.error.message}`
        );
      }

      for (const r of partsRes.data ?? []) {
        allParts.push(r as InventoryPartRow & { inventory_id: number });
      }
      for (const r of minifigsRes.data ?? []) {
        allMinifigs.push(
          r as { inventory_id: number; fig_num: string; quantity: number }
        );
      }
    })
  );

  // Group parts by set number
  const partsBySet = new Map<string, InventoryPartRow[]>();
  for (const row of allParts) {
    const setNum = invIdToSetNum.get(row.inventory_id);
    if (!setNum) continue;
    let arr = partsBySet.get(setNum);
    if (!arr) {
      arr = [];
      partsBySet.set(setNum, arr);
    }
    arr.push(row);
  }

  // Group minifigs by set number
  const minifigsBySet = new Map<
    string,
    Array<{ fig_num: string; quantity: number }>
  >();
  for (const row of allMinifigs) {
    if (
      typeof row?.fig_num !== 'string' ||
      row.fig_num.trim().length === 0 ||
      typeof row?.quantity !== 'number'
    )
      continue;
    const setNum = invIdToSetNum.get(row.inventory_id);
    if (!setNum) continue;
    let arr = minifigsBySet.get(setNum);
    if (!arr) {
      arr = [];
      minifigsBySet.set(setNum, arr);
    }
    arr.push({ fig_num: row.fig_num.trim(), quantity: row.quantity });
  }

  // =========================================================================
  // Phase 3 — Shared metadata (4 parallel queries)
  // =========================================================================

  // Collect deduplicated part_nums and color_ids across all sets
  const allPartNums = new Set<string>();
  const allColorIds = new Set<number>();
  const allPartColorPairs: Array<{ partNum: string; colorId: number }> = [];

  for (const rows of partsBySet.values()) {
    for (const row of rows) {
      allPartNums.add(row.part_num);
      if (row.color_id != null) allColorIds.add(row.color_id);
      allPartColorPairs.push({
        partNum: row.part_num,
        colorId: row.color_id,
      });
    }
  }

  // Chunk part_nums for rb_parts query
  const partNumArr = Array.from(allPartNums);
  const partNumChunks: string[][] = [];
  for (let i = 0; i < partNumArr.length; i += PART_NUM_CHUNK_SIZE) {
    partNumChunks.push(partNumArr.slice(i, i + PART_NUM_CHUNK_SIZE));
  }

  const colorIdArr = Array.from(allColorIds);

  type PartMeta = {
    part_num: string;
    name: string;
    part_cat_id: number | null;
    image_url: string | null;
    bl_part_id: string | null;
  };

  const [partsChunkResults, colorsRes, categoryMap, partRarityMap] =
    await Promise.all([
      // rb_parts — chunked
      Promise.all(
        partNumChunks.length > 0
          ? partNumChunks.map(chunk =>
              supabase
                .from('rb_parts')
                .select('part_num, name, part_cat_id, image_url, bl_part_id')
                .in('part_num', chunk)
            )
          : [Promise.resolve({ data: [] as PartMeta[], error: null })]
      ),
      // rb_colors
      colorIdArr.length > 0
        ? supabase.from('rb_colors').select('id, name').in('id', colorIdArr)
        : Promise.resolve({
            data: [] as { id: number; name: string }[],
            error: null,
          }),
      // Category map
      getCategoryMap(),
      // Part rarity
      queryPartRarityBatch(supabase, allPartColorPairs),
    ]);

  // Merge chunked part results
  const partMap = new Map<string, PartMeta>();
  for (const res of partsChunkResults) {
    if (res.error) {
      throw new Error(`batchInventory rb_parts failed: ${res.error.message}`);
    }
    for (const p of (res.data ?? []) as PartMeta[]) {
      partMap.set(p.part_num, p);
    }
  }

  if (colorsRes.error) {
    throw new Error(
      `batchInventory rb_colors failed: ${colorsRes.error.message}`
    );
  }
  const colorMap = new Map<number, { id: number; name: string }>();
  for (const c of (colorsRes.data ?? []) as { id: number; name: string }[]) {
    colorMap.set(c.id, c);
  }

  // =========================================================================
  // Phase 4 — Minifig parent metadata (3 parallel queries, conditional)
  // =========================================================================

  const allFigNums = new Set<string>();
  for (const arr of minifigsBySet.values()) {
    for (const m of arr) {
      allFigNums.add(m.fig_num);
    }
  }

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

  if (allFigNums.size > 0) {
    const figNumArr = Array.from(allFigNums);

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
        `batchInventory rb_minifigs failed: ${figMetaRes.error.message}`
      );
    }
    if (figImagesRes.error) {
      throw new Error(
        `batchInventory rb_minifig_images failed: ${figImagesRes.error.message}`
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

  // =========================================================================
  // Phase 5 — Per-set assembly (in-memory only)
  // =========================================================================

  for (const setNum of uniqueSetNums) {
    const setParts = partsBySet.get(setNum);
    const setMinifigs = minifigsBySet.get(setNum);

    // Skip sets with no parts and no minifigs (they keep their empty array)
    if (
      (!setParts || setParts.length === 0) &&
      (!setMinifigs || setMinifigs.length === 0)
    ) {
      continue;
    }

    // --- Part rows ---
    const partRowMap = new Map<string, InventoryRow>();
    for (const row of setParts ?? []) {
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

      const invRow: InventoryRow = {
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
        // Only include bricklinkPartId if different from partId
        ...(bricklinkPartId &&
          bricklinkPartId !== row.part_num && {
            bricklinkPartId,
          }),
        ...(setCount != null && { setCount }),
      };

      partRowMap.set(invRow.inventoryKey, invRow);
    }

    // --- Minifig parent rows ---
    const parentRows: InventoryRow[] = [];
    for (const invFig of setMinifigs ?? []) {
      const figNum = invFig.fig_num;
      if (!figNum) continue;
      const parentQuantity =
        typeof invFig.quantity === 'number' && Number.isFinite(invFig.quantity)
          ? invFig.quantity
          : 1;
      const parentKey = `fig:${figNum}`;
      const meta = figMetaById.get(figNum);
      const blMinifigId = meta?.bl_minifig_id ?? null;
      const figSetCount = figRarityById.get(figNum) ?? null;
      const parentRow: InventoryRow = {
        setNumber: setNum,
        partId: parentKey,
        partName: meta?.name ?? figNum,
        colorId: 0,
        colorName: '\u2014',
        quantityRequired: parentQuantity,
        imageUrl:
          figImgById.get(figNum) ??
          (blMinifigId ? getBlMinifigImageUrl(blMinifigId) : null),
        partCategoryName: 'Minifig',
        parentCategory: 'Minifigure',
        inventoryKey: parentKey,
        ...(blMinifigId && { bricklinkFigId: blMinifigId }),
        ...(figSetCount != null && { setCount: figSetCount }),
      };

      parentRows.push(parentRow);
    }

    // Merge: parts first, then minifig parent rows sorted by inventoryKey
    const mergedRows = Array.from(partRowMap.values());
    const sortedParentRows = [...parentRows].sort((a, b) =>
      a.inventoryKey.localeCompare(b.inventoryKey)
    );
    result.set(setNum, [...mergedRows, ...sortedParentRows]);
  }

  return result;
}
