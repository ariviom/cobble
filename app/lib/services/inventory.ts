import type { InventoryRow } from '@/app/components/set/types';
import { getBricklinkColorName } from '@/app/lib/bricklink/colors';
import {
  getSetMinifigsBl,
  getBlPartImageUrl,
} from '@/app/lib/bricklink/minifigs';
import { LRUCache } from '@/app/lib/cache/lru';
import { getSetInventoryLocal } from '@/app/lib/catalog';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { getColors, getSetInventory } from '@/app/lib/rebrickable';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// RB → BL color ID mapping (cached, built from Rebrickable colors API)
// ---------------------------------------------------------------------------

let rbToBlColorCache: { at: number; map: Map<number, number> } | null = null;
const RB_BL_COLOR_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function getRbToBlColorMap(): Promise<Map<number, number>> {
  const now = Date.now();
  if (rbToBlColorCache && now - rbToBlColorCache.at < RB_BL_COLOR_CACHE_TTL) {
    return rbToBlColorCache.map;
  }

  const map = new Map<number, number>();
  try {
    const colors = await getColors();
    for (const c of colors) {
      const bl = (
        c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined
      )?.BrickLink;
      if (bl?.ext_ids && bl.ext_ids.length > 0) {
        map.set(c.id, bl.ext_ids[0]!);
      }
    }
  } catch (err) {
    logger.warn('inventory.rb_bl_color_map_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Return empty map — dedup will fall back to RB color IDs (existing behavior)
  }

  rbToBlColorCache = { at: now, map };
  return map;
}

export type InventoryResult = {
  rows: InventoryRow[];
  /** Metadata about minifig sync status (BL-only, no RB mapping) */
  minifigMeta?: {
    /** How many minifigs in the set */
    totalMinifigs: number;
    /** Sync status: 'ok' | 'error' | 'never_synced' | null */
    syncStatus: 'ok' | 'error' | 'never_synced' | null;
    /** Whether a sync was triggered during this request */
    syncTriggered: boolean;
  };
  /** Hints for client-side minifig enrichment */
  minifigEnrichmentNeeded?: {
    /** BL minifig IDs that need enrichment */
    blMinifigNos: string[];
    /** BL minifig IDs missing images */
    missingImages: string[];
    /** BL minifig IDs missing subparts */
    missingSubparts: string[];
  };
  /** Spare-part enrichment metadata */
  spares?: {
    status: 'ok' | 'error';
    spareCount: number;
    lastChecked: string | null;
  };
};

/** Spare keys cached per set number */
type SpareCacheValue = Set<string>;

const SPARE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SPARE_CACHE_MAX = 200;
const spareCache = new LRUCache<string, SpareCacheValue>(
  SPARE_CACHE_MAX,
  SPARE_CACHE_TTL_MS
);
const inFlightSpares = new Map<string, Promise<SpareCacheValue>>();

type RebrickableSparePage = {
  results: Array<{
    part: { part_num: string };
    color: { id: number };
    is_spare: boolean;
  }>;
  next: string | null;
};

function buildSpareKeys(results: RebrickableSparePage['results']): Set<string> {
  const keys = new Set<string>();
  for (const row of results) {
    if (!row?.is_spare) continue;
    const partNum = row.part?.part_num;
    const colorId = row.color?.id;
    if (typeof partNum === 'string' && typeof colorId === 'number') {
      keys.add(`${partNum}:${colorId}`);
    }
  }
  return keys;
}

async function fetchSparesFromRebrickable(
  setNumber: string
): Promise<SpareCacheValue> {
  const first = await rbFetch<RebrickableSparePage>(
    `/lego/sets/${encodeURIComponent(setNumber)}/parts/`,
    { page_size: 1000, inc_part_details: 1 }
  );
  const all: RebrickableSparePage['results'] = [...(first.results ?? [])];
  let next = first.next;
  while (next) {
    const page = await rbFetchAbsolute<RebrickableSparePage>(next);
    if (Array.isArray(page.results)) {
      all.push(...page.results);
    }
    next = page.next;
  }
  return buildSpareKeys(all);
}

async function getSpareCacheEntry(
  setNumber: string
): Promise<SpareCacheValue | null> {
  const cached = spareCache.get(setNumber);
  if (cached) {
    return cached;
  }
  if (inFlightSpares.has(setNumber)) {
    return inFlightSpares.get(setNumber)!;
  }
  const promise = fetchSparesFromRebrickable(setNumber)
    .then(keys => {
      spareCache.set(setNumber, keys);
      return keys;
    })
    .catch(err => {
      logger.warn('inventory.spares.fetch_failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    })
    .finally(() => {
      inFlightSpares.delete(setNumber);
    });

  inFlightSpares.set(setNumber, promise);
  try {
    return await promise;
  } catch {
    return null;
  }
}

/**
 * Get inventory rows for a set with BrickLink minifig data.
 *
 * This function:
 * 1. Loads parts inventory from Supabase catalog (falls back to Rebrickable API)
 * 2. Loads minifigs directly from bl_set_minifigs (BL IDs primary)
 * 3. Self-heals by triggering BL sync if minifig data is missing
 * 4. Returns rows with BL minifig IDs as primary identifiers
 */
export async function getSetInventoryRows(
  setNumber: string
): Promise<InventoryRow[]> {
  const result = await getSetInventoryRowsWithMeta(setNumber);
  return result.rows;
}

/**
 * Extended version that returns minifig metadata alongside rows.
 * Useful for debugging and for UI that wants to show sync status.
 */
export async function getSetInventoryRowsWithMeta(
  setNumber: string
): Promise<InventoryResult> {
  // Load parts from Supabase catalog (includes RB minifigs as well)
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

  let result: InventoryResult = { rows };

  // Get minifigs directly from BrickLink (self-healing)
  const blMinifigResult = await getSetMinifigsBl(setNumber);

  if (blMinifigResult.minifigs.length > 0) {
    const supabase = getCatalogWriteClient();
    const allBlMinifigNos = blMinifigResult.minifigs.map(m => m.blMinifigId);

    // Batch-fetch all subparts for all minifigs in one query
    const { data: allSubparts, error: subpartsErr } = await supabase
      .from('bl_minifig_parts')
      .select(
        'bl_minifig_no, bl_part_id, bl_color_id, color_name, name, quantity'
      )
      .in('bl_minifig_no', allBlMinifigNos);

    if (subpartsErr) {
      logger.warn('inventory.batch_subparts_failed', {
        setNumber,
        error: subpartsErr.message,
      });
    }

    // Group subparts by minifig
    const subpartsByMinifig = new Map<
      string,
      Array<{
        blPartId: string;
        blColorId: number;
        colorName: string | null;
        name: string | null;
        quantity: number;
      }>
    >();
    for (const sp of allSubparts ?? []) {
      const list = subpartsByMinifig.get(sp.bl_minifig_no) ?? [];
      list.push({
        blPartId: sp.bl_part_id,
        blColorId: sp.bl_color_id,
        colorName: sp.color_name,
        name: sp.name,
        quantity: sp.quantity ?? 1,
      });
      subpartsByMinifig.set(sp.bl_minifig_no, list);
    }

    // Build lookup map by BL minifig ID
    const blMinifigMap = new Map(
      blMinifigResult.minifigs.map(m => [m.blMinifigId, m])
    );

    // Track child rows by key to handle shared parts across minifigs
    const childRowsByKey = new Map<string, InventoryRow>();

    // BrickLink is the source of truth for minifigs.
    // Filter out ALL RB minifig rows - we'll replace with BL data.
    // This ensures we never show legacy "fig-XXXXX" RB IDs.
    const enrichedRows = rows.filter(row => {
      // Keep all non-minifig rows
      if (
        row.parentCategory !== 'Minifigure' ||
        typeof row.partId !== 'string' ||
        !row.partId.startsWith('fig:')
      ) {
        return true;
      }
      // Filter OUT RB minifig rows - BL minifigs will be added below
      return false;
    });

    // Add ALL BL minifigs as the authoritative source
    for (const blMinifig of blMinifigResult.minifigs) {
      enrichedRows.push({
        setNumber,
        partId: `fig:${blMinifig.blMinifigId}`,
        partName: blMinifig.name ?? blMinifig.blMinifigId,
        colorId: 0,
        colorName: '—',
        quantityRequired: blMinifig.quantity,
        imageUrl: blMinifig.imageUrl,
        partCategoryName: 'Minifig',
        parentCategory: 'Minifigure',
        inventoryKey: `fig:${blMinifig.blMinifigId}`,
        bricklinkFigId: blMinifig.blMinifigId,
      });
    }

    // Build RB→BL color mapping so we can index catalog rows with BL color IDs
    // (catalog rows use RB color IDs, but BL minifig parts use BL color IDs)
    const rbToBlColor = await getRbToBlColorMap();

    // Build index of existing rows by inventoryKey for child row deduplication
    // Include both primary key AND bricklinkPartId as alternative lookup keys
    const existingRowsByKey = new Map<string, number>();
    enrichedRows.forEach((row, idx) => {
      const key = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
      existingRowsByKey.set(key, idx);
      // Also index by BrickLink part ID + BL color ID (for BL→RB matching)
      if (row.bricklinkPartId && row.bricklinkPartId !== row.partId) {
        const blColorId = rbToBlColor.get(row.colorId) ?? row.colorId;
        const blKey = `${row.bricklinkPartId}:${blColorId}`;
        existingRowsByKey.set(blKey, idx);
      }
    });

    // Create child rows for all subparts
    // IMPORTANT: Multiply subpart quantities by minifig quantity to get total needed
    for (const [blMinifigNo, subparts] of subpartsByMinifig) {
      const parentKey = `fig:${blMinifigNo}`;
      // Get how many of this minifig type are in the set
      const minifigQty = blMinifigMap.get(blMinifigNo)?.quantity ?? 1;

      for (const sp of subparts) {
        const childKey = `${sp.blPartId}:${sp.blColorId}`;
        const existingIdx = existingRowsByKey.get(childKey);
        // Total quantity needed = per-minifig qty × number of minifigs
        const totalQtyForThisMinifig = sp.quantity * minifigQty;

        if (existingIdx != null) {
          // Update existing row with subpart data
          const existing = enrichedRows[existingIdx]!;
          if (!existing.imageUrl) {
            existing.imageUrl = getBlPartImageUrl(sp.blPartId, sp.blColorId);
          }
          if (!existing.bricklinkPartId && sp.blPartId !== existing.partId) {
            existing.bricklinkPartId = sp.blPartId;
          }
          existing.parentCategory = existing.parentCategory ?? 'Minifigure';
          existing.partCategoryName =
            existing.partCategoryName ?? 'Minifigure Component';

          // Track parent relationship
          if (!existing.parentRelations) {
            existing.parentRelations = [];
          }
          const alreadyLinked = existing.parentRelations.some(
            rel => rel.parentKey === parentKey
          );
          if (!alreadyLinked) {
            // Add total quantity needed for this minifig type (per-minifig × count)
            existing.quantityRequired += totalQtyForThisMinifig;
            existing.parentRelations.push({
              parentKey,
              quantity: sp.quantity, // Per-minifig qty (for relationship)
            });
          }
        } else if (childRowsByKey.has(childKey)) {
          // Child row already created by another minifig - update it
          const childRow = childRowsByKey.get(childKey)!;
          if (!childRow.parentRelations) {
            childRow.parentRelations = [];
          }
          const alreadyLinked = childRow.parentRelations.some(
            rel => rel.parentKey === parentKey
          );
          if (!alreadyLinked) {
            // Add total quantity needed for this minifig type
            childRow.quantityRequired += totalQtyForThisMinifig;
            childRow.parentRelations.push({
              parentKey,
              quantity: sp.quantity, // Per-minifig qty (for relationship)
            });
          }
        } else {
          // Create new child row - use stored BL color name, static lookup, or fallback
          const numColorId = Number(sp.blColorId);
          const colorName =
            sp.colorName ??
            getBricklinkColorName(numColorId) ??
            `Color ${numColorId}`;
          const childRow: InventoryRow = {
            setNumber,
            partId: sp.blPartId,
            partName: sp.name ?? sp.blPartId,
            colorId: numColorId,
            colorName,
            // Total quantity = per-minifig qty × minifig count
            quantityRequired: totalQtyForThisMinifig,
            imageUrl: getBlPartImageUrl(sp.blPartId, numColorId),
            parentCategory: 'Minifigure',
            partCategoryName: 'Minifigure Component',
            inventoryKey: childKey,
            parentRelations: [{ parentKey, quantity: sp.quantity }], // Per-minifig qty
            bricklinkPartId: sp.blPartId,
          };
          childRowsByKey.set(childKey, childRow);
        }
      }
    }

    // Append all new child rows
    for (const childRow of childRowsByKey.values()) {
      enrichedRows.push(childRow);
      existingRowsByKey.set(childRow.inventoryKey, enrichedRows.length - 1);
    }

    // Build map of BL key → actual inventory key for componentRelations
    // This handles the BL→RB ID mismatch (e.g., '3626bp01:1' → '3626c:1')
    const blKeyToInventoryKey = new Map<string, string>();
    for (const row of enrichedRows) {
      if (
        row.parentCategory === 'Minifigure' &&
        !row.partId.startsWith('fig:')
      ) {
        const inventoryKey = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
        // Map primary key to itself
        blKeyToInventoryKey.set(inventoryKey, inventoryKey);
        // Also map BrickLink key (with BL color ID) to the actual inventory key
        if (row.bricklinkPartId && row.bricklinkPartId !== row.partId) {
          const blColorId = rbToBlColor.get(row.colorId) ?? row.colorId;
          const blKey = `${row.bricklinkPartId}:${blColorId}`;
          blKeyToInventoryKey.set(blKey, inventoryKey);
        }
      }
    }

    // Now add componentRelations to minifig rows using correct inventory keys
    for (const row of enrichedRows) {
      if (
        row.parentCategory === 'Minifigure' &&
        row.partId.startsWith('fig:')
      ) {
        const blMinifigNo = row.partId.replace(/^fig:/, '');
        const subparts = subpartsByMinifig.get(blMinifigNo) ?? [];

        if (subparts.length > 0) {
          const componentRelations = subparts.map(sp => {
            const blKey = `${sp.blPartId}:${sp.blColorId}`;
            // Use the actual inventory key if we found a match, otherwise use BL key
            const actualKey = blKeyToInventoryKey.get(blKey) ?? blKey;
            return { key: actualKey, quantity: sp.quantity };
          });
          row.componentRelations = componentRelations;
        }
      }
    }

    // Identify minifigs still needing enrichment (only those without subparts in DB)
    const missingImages = blMinifigResult.minifigs
      .filter(m => !m.imageUrl)
      .map(m => m.blMinifigId);

    const missingSubparts = allBlMinifigNos.filter(
      blId =>
        !subpartsByMinifig.has(blId) ||
        subpartsByMinifig.get(blId)!.length === 0
    );

    result = {
      rows: enrichedRows,
      minifigMeta: {
        totalMinifigs: blMinifigResult.minifigs.length,
        syncStatus: blMinifigResult.syncStatus,
        syncTriggered: blMinifigResult.syncTriggered,
      },
      minifigEnrichmentNeeded: {
        blMinifigNos: allBlMinifigNos,
        missingImages: Array.from(new Set(missingImages)),
        missingSubparts: Array.from(new Set(missingSubparts)),
      },
    };
  } else if (blMinifigResult.syncStatus === 'error') {
    // Sync failed, return what we have from RB with error status
    result.minifigMeta = {
      totalMinifigs: 0,
      syncStatus: 'error',
      syncTriggered: blMinifigResult.syncTriggered,
    };
  }

  // Spare-part filtering with cached live fetch (best-effort)
  try {
    const spareKeys = await getSpareCacheEntry(setNumber);
    if (spareKeys) {
      if (spareKeys.size > 0) {
        const filteredRows = result.rows.filter(row => {
          const key = row.inventoryKey ?? `${row.partId}:${row.colorId}`;
          return key ? !spareKeys.has(key) : true;
        });
        result.rows = filteredRows;
      }
      result.spares = {
        status: 'ok',
        spareCount: spareKeys.size,
        lastChecked: new Date().toISOString(),
      };
    } else {
      result.spares = {
        status: 'error',
        spareCount: 0,
        lastChecked: null,
      };
    }
  } catch (err) {
    logger.warn('inventory.spares.apply_failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    result.spares = {
      status: 'error',
      spareCount: 0,
      lastChecked: null,
    };
  }

  return result;
}
