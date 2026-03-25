import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { getSetInventoryLocal } from '@/app/lib/catalog';
import { getSetInventoriesLocalBatch } from '@/app/lib/catalog/batchInventory';
import { queryPartRarityBatch } from '@/app/lib/catalog/rarity';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import type { PartIdentity } from '@/app/lib/domain/partIdentity';
import { getSetInventory } from '@/app/lib/rebrickable';
import type { ResolutionContext } from '@/app/lib/services/identityResolution';
import {
  buildResolutionContext,
  resolveCatalogPartIdentity,
  resolveMinifigParentIdentity,
  resolveRbMinifigSubpartIdentity,
} from '@/app/lib/services/identityResolution';
import { backfillBLImages } from '@/app/lib/services/imageBackfill';
import { logger } from '@/lib/metrics';

export type InventoryResult = {
  rows: InventoryRow[];
  /** Metadata about minifigs in this set */
  minifigMeta?: {
    /** How many minifigs in the set */
    totalMinifigs: number;
  };
};

/** Parsed minifig subpart from rb_minifig_parts join. */
export type RbSubpart = {
  rbPartId: string;
  rbColorId: number;
  colorName: string;
  partName: string;
  quantity: number;
  blPartId: string | null;
  partImageUrl: string | null;
};

/**
 * Enrich a set's rows with minifig subpart child rows.
 *
 * Mutates `rows` in place — appends child rows, updates existing rows with
 * parentRelations, and builds componentRelations on parent rows.
 *
 * @returns totalMinifigs count (0 if no minifig parents found)
 */
function enrichSetWithMinifigSubparts(
  rows: InventoryRow[],
  subpartsByFig: Map<string, RbSubpart[]>,
  ctx: ResolutionContext,
  setNumber: string
): number {
  const minifigParents = rows.filter(
    row => row.parentCategory === 'Minifigure' && row.partId.startsWith('fig:')
  );
  if (minifigParents.length === 0) return 0;

  // Build parent lookup for quantity multiplication
  const parentByFigNum = new Map<string, InventoryRow>();
  for (const parent of minifigParents) {
    parentByFigNum.set(parent.partId.slice(4), parent);
  }

  // Cache resolved identities to avoid redundant resolution calls
  const identityCache = new Map<string, PartIdentity>();

  // Track child rows by canonical key for dedup across minifigs
  const childRowsByKey = new Map<string, InventoryRow>();

  // Build canonical key index for existing rows (for dedup across minifigs)
  const rowsByCanonicalKey = new Map<string, number>();
  rows.forEach((row, idx) => {
    const key =
      row.identity?.canonicalKey ??
      row.inventoryKey ??
      `${row.partId}:${row.colorId}`;
    rowsByCanonicalKey.set(key, idx);
  });

  // Create child rows for all subparts
  for (const [figNum, subparts] of subpartsByFig) {
    const parentRow = parentByFigNum.get(figNum);
    if (!parentRow) continue; // This fig doesn't belong to this set
    const blMinifigId = parentRow.bricklinkFigId ?? figNum;
    const parentKey = parentRow.identity?.canonicalKey ?? `fig:${blMinifigId}`;
    const minifigQty = parentRow.quantityRequired ?? 1;

    for (const sp of subparts) {
      const cacheKey = `${sp.rbPartId}:${sp.rbColorId}`;
      let subpartIdentity = identityCache.get(cacheKey);
      if (!subpartIdentity) {
        subpartIdentity = resolveRbMinifigSubpartIdentity(
          sp.rbPartId,
          sp.rbColorId,
          ctx,
          sp.blPartId
        );
        identityCache.set(cacheKey, subpartIdentity);
      }
      const canonicalKey = subpartIdentity.canonicalKey;
      const totalQtyForThisMinifig = sp.quantity * minifigQty;
      const blPartId = sp.blPartId ?? sp.rbPartId;

      const existingIdx = rowsByCanonicalKey.get(canonicalKey);

      if (existingIdx != null) {
        // Update existing catalog row with subpart data
        const existing = rows[existingIdx]!;
        if (!existing.imageUrl && sp.partImageUrl) {
          existing.imageUrl = sp.partImageUrl;
        }
        if (!existing.bricklinkPartId && blPartId !== existing.partId) {
          existing.bricklinkPartId = blPartId;
        }
        if (!existing.identity) {
          existing.identity = subpartIdentity;
        }
        existing.parentCategory = existing.parentCategory ?? 'Minifigure';
        existing.partCategoryName =
          existing.partCategoryName ?? 'Minifigure Component';

        if (!existing.parentRelations) {
          existing.parentRelations = [];
        }
        const alreadyLinked = existing.parentRelations.some(
          rel => rel.parentKey === parentKey
        );
        if (!alreadyLinked) {
          existing.quantityRequired += totalQtyForThisMinifig;
          existing.parentRelations.push({
            parentKey,
            quantity: sp.quantity,
          });
        }
      } else if (childRowsByKey.has(canonicalKey)) {
        // Child row already created by another minifig — update it
        const childRow = childRowsByKey.get(canonicalKey)!;
        if (!childRow.parentRelations) {
          childRow.parentRelations = [];
        }
        const alreadyLinked = childRow.parentRelations.some(
          rel => rel.parentKey === parentKey
        );
        if (!alreadyLinked) {
          childRow.quantityRequired += totalQtyForThisMinifig;
          childRow.parentRelations.push({
            parentKey,
            quantity: sp.quantity,
          });
        }
      } else {
        // Create new child row
        const childRow: InventoryRow = {
          setNumber,
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

  // Append all new child rows
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
        const cacheKey = `${sp.rbPartId}:${sp.rbColorId}`;
        const spIdentity =
          identityCache.get(cacheKey) ??
          resolveRbMinifigSubpartIdentity(sp.rbPartId, sp.rbColorId, ctx);
        const key = spIdentity.canonicalKey;
        relationMap.set(key, (relationMap.get(key) ?? 0) + sp.quantity);
      }
      parent.componentRelations = Array.from(relationMap.entries()).map(
        ([key, quantity]) => ({ key, quantity })
      );
    }
  }

  return minifigParents.length;
}

/**
 * Parse raw Supabase joined rows from rb_minifig_parts into RbSubpart[],
 * grouped by fig_num.
 */
function parseSubpartRows(
  rawRows: Array<{
    fig_num: string;
    part_num: string;
    color_id: number;
    quantity: number | null;
    rb_parts: unknown;
    rb_colors: unknown;
    [key: string]: unknown;
  }>
): Map<string, RbSubpart[]> {
  const subpartsByFig = new Map<string, RbSubpart[]>();
  for (const sp of rawRows) {
    const partMeta = sp.rb_parts as { name: string; bl_part_id: string | null };
    const colorMeta = sp.rb_colors as { name: string };

    const list = subpartsByFig.get(sp.fig_num) ?? [];
    list.push({
      rbPartId: sp.part_num,
      rbColorId: sp.color_id,
      colorName: colorMeta.name,
      partName: partMeta.name,
      quantity: sp.quantity ?? 1,
      blPartId: partMeta.bl_part_id,
      partImageUrl: sp.img_url as string | null,
    });
    subpartsByFig.set(sp.fig_num, list);
  }
  return subpartsByFig;
}

/**
 * Get inventory rows for a set with minifig subpart data from RB catalog.
 *
 * This function:
 * 1. Loads parts inventory from Supabase catalog (falls back to Rebrickable API)
 * 2. Keeps RB minifig parent rows as-is (from getSetInventoryLocal)
 * 3. Batch-queries rb_minifig_parts for subpart data (no BL API calls)
 * 4. Returns rows with identity resolution for all parts
 */
export async function getSetInventoryRows(
  setNumber: string
): Promise<InventoryRow[]> {
  const result = await getSetInventoryRowsWithMeta(setNumber);
  return result.rows;
}

/**
 * Extended version that returns minifig metadata alongside rows.
 */
export async function getSetInventoryRowsWithMeta(
  setNumber: string
): Promise<InventoryResult> {
  // Load parts from Supabase catalog (includes RB minifig parent rows)
  let rows: InventoryRow[] = [];
  try {
    const localRows = await getSetInventoryLocal(setNumber);
    if (localRows.length > 0) {
      rows = localRows;
    }
  } catch (err) {
    logger.warn('inventory.local_failed_fallback_to_rebrickable', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to live Rebrickable inventory when Supabase has no rows
  if (!rows.length) {
    rows = await getSetInventory(setNumber);
  }

  // Build identity resolution context from catalog rows
  const ctx = await buildResolutionContext(rows);

  // Attach identity to catalog (non-minifig) rows
  for (const row of rows) {
    if (!row.partId.startsWith('fig:')) {
      row.identity = resolveCatalogPartIdentity(row, ctx);
      row.inventoryKey = row.identity.canonicalKey;
    }
  }

  let result: InventoryResult = { rows };

  // ── Minifig enrichment from RB catalog ──
  // Resolve identity for minifig parent rows
  const minifigParents = rows.filter(
    row => row.parentCategory === 'Minifigure' && row.partId.startsWith('fig:')
  );
  for (const parent of minifigParents) {
    const rbFigNum = parent.partId.slice(4);
    const blMinifigId = parent.bricklinkFigId ?? null;
    parent.identity = resolveMinifigParentIdentity(
      blMinifigId ?? rbFigNum,
      rbFigNum
    );
    parent.inventoryKey = parent.identity.canonicalKey;
  }

  if (minifigParents.length > 0) {
    // Fetch subparts from rb_minifig_parts
    const figNums = minifigParents.map(p => p.partId.slice(4));
    const supabase = getCatalogReadClient();
    const { data: allSubparts, error: subpartsErr } = await supabase
      .from('rb_minifig_parts')
      .select(
        'fig_num, part_num, color_id, quantity, img_url, rb_parts!inner(name, bl_part_id), rb_colors!inner(name)'
      )
      .in('fig_num', figNums);

    if (subpartsErr) {
      logger.warn('inventory.batch_subparts_failed', {
        setNumber,
        error: subpartsErr.message,
      });
    }

    // Group subparts by fig_num
    const subpartsByFig = parseSubpartRows(allSubparts ?? []);

    // Enrich rows with minifig child rows
    const totalMinifigs = enrichSetWithMinifigSubparts(
      rows,
      subpartsByFig,
      ctx,
      setNumber
    );

    if (totalMinifigs > 0) {
      result = { rows, minifigMeta: { totalMinifigs } };
    }
  }

  // ── Rarity enrichment for subpart rows ──
  // Catalog parts and minifig parents get rarity from getSetInventoryLocal.
  // Only new child rows (from rb_minifig_parts) need rarity attached here.
  try {
    const subpartPairs: Array<{ partNum: string; colorId: number }> = [];
    const subpartRows: InventoryRow[] = [];
    for (const row of result.rows) {
      if (row.setCount == null && !row.partId.startsWith('fig:')) {
        subpartPairs.push({ partNum: row.partId, colorId: row.colorId });
        subpartRows.push(row);
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
    logger.warn('inventory.rarity.subpart_enrich_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── BrickLink image backfill for parts with no RB image ──
  try {
    await backfillBLImages(result.rows);
  } catch (err) {
    logger.warn('inventory.image_backfill_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Batch version of getSetInventoryRowsWithMeta for multiple sets.
 *
 * Orchestrates: catalog batch fetch → Rebrickable fallback → shared identity
 * resolution → batch minifig subparts → per-set minifig enrichment → batch
 * rarity → batch image backfill.
 */
export async function getSetInventoriesBatchWithMeta(
  setNumbers: string[]
): Promise<Map<string, InventoryResult>> {
  const results = new Map<string, InventoryResult>();
  if (setNumbers.length === 0) return results;

  // ── Step 1: Batch catalog fetch ──
  const catalogMap = await getSetInventoriesLocalBatch(setNumbers);

  // ── Step 2: Rebrickable fallback for empty sets ──
  const emptySets = Array.from(catalogMap.entries())
    .filter(([, rows]) => rows.length === 0)
    .map(([setNum]) => setNum);

  if (emptySets.length > 0) {
    const fallbackResults = await Promise.allSettled(
      emptySets.map(async setNum => {
        const rows = await getSetInventory(setNum);
        return { setNum, rows };
      })
    );

    for (const result of fallbackResults) {
      if (result.status === 'fulfilled') {
        catalogMap.set(result.value.setNum, result.value.rows);
      } else {
        // Find which set failed (match by index)
        const idx = fallbackResults.indexOf(result);
        const failedSetNum = emptySets[idx]!;
        logger.warn('inventory.batch_rebrickable_fallback_failed', {
          setNumber: failedSetNum,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
        // Delete failed sets so they're excluded from results
        catalogMap.delete(failedSetNum);
      }
    }
  }

  // ── Step 3: Build resolution context once (all rows from all sets) ──
  const allRows: InventoryRow[] = [];
  for (const rows of catalogMap.values()) {
    allRows.push(...rows);
  }
  const ctx = await buildResolutionContext(allRows);

  // ── Step 4: Per-set identity resolution ──
  for (const rows of catalogMap.values()) {
    for (const row of rows) {
      if (!row.partId.startsWith('fig:')) {
        row.identity = resolveCatalogPartIdentity(row, ctx);
        row.inventoryKey = row.identity.canonicalKey;
      }
    }

    // Resolve identity for minifig parent rows
    const minifigParents = rows.filter(
      row =>
        row.parentCategory === 'Minifigure' && row.partId.startsWith('fig:')
    );
    for (const parent of minifigParents) {
      const rbFigNum = parent.partId.slice(4);
      const blMinifigId = parent.bricklinkFigId ?? null;
      parent.identity = resolveMinifigParentIdentity(
        blMinifigId ?? rbFigNum,
        rbFigNum
      );
      parent.inventoryKey = parent.identity.canonicalKey;
    }
  }

  // ── Step 5: Batch minifig subparts ──
  // Collect ALL fig_nums across ALL sets
  const allFigNums: string[] = [];
  for (const rows of catalogMap.values()) {
    for (const row of rows) {
      if (
        row.parentCategory === 'Minifigure' &&
        row.partId.startsWith('fig:')
      ) {
        allFigNums.push(row.partId.slice(4));
      }
    }
  }

  let subpartsByFig = new Map<string, RbSubpart[]>();

  if (allFigNums.length > 0) {
    const uniqueFigNums = Array.from(new Set(allFigNums));
    const supabase = getCatalogReadClient();
    const { data: allSubparts, error: subpartsErr } = await supabase
      .from('rb_minifig_parts')
      .select(
        'fig_num, part_num, color_id, quantity, img_url, rb_parts!inner(name, bl_part_id), rb_colors!inner(name)'
      )
      .in('fig_num', uniqueFigNums);

    if (subpartsErr) {
      logger.warn('inventory.batch_subparts_failed', {
        error: subpartsErr.message,
      });
    }

    subpartsByFig = parseSubpartRows(allSubparts ?? []);
  }

  // ── Step 6: Per-set minifig enrichment ──
  for (const [setNum, rows] of catalogMap) {
    const totalMinifigs = enrichSetWithMinifigSubparts(
      rows,
      subpartsByFig,
      ctx,
      setNum
    );

    if (totalMinifigs > 0) {
      results.set(setNum, { rows, minifigMeta: { totalMinifigs } });
    } else {
      results.set(setNum, { rows });
    }
  }

  // ── Step 7: Batch rarity enrichment ──
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
    logger.warn('inventory.batch_rarity_enrich_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 8: Batch image backfill ──
  try {
    const allResultRows: InventoryRow[] = [];
    for (const { rows } of results.values()) {
      allResultRows.push(...rows);
    }
    await backfillBLImages(allResultRows);
  } catch (err) {
    logger.warn('inventory.batch_image_backfill_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return results;
}
