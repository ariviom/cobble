import type { InventoryRow } from '@/app/components/set/types';
import { LRUCache } from '@/app/lib/cache/lru';
import { getSetInventoryLocal } from '@/app/lib/catalog';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getSetInventory } from '@/app/lib/rebrickable';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import {
  buildResolutionContext,
  resolveCatalogPartIdentity,
  resolveMinifigParentIdentity,
  resolveRbMinifigSubpartIdentity,
} from '@/app/lib/services/identityResolution';
import { logger } from '@/lib/metrics';

export type InventoryResult = {
  rows: InventoryRow[];
  /** Metadata about minifigs in this set */
  minifigMeta?: {
    /** How many minifigs in the set */
    totalMinifigs: number;
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
  // Extract minifig parent rows (already created by getSetInventoryLocal)
  const minifigParents = rows.filter(
    row => row.parentCategory === 'Minifigure' && row.partId.startsWith('fig:')
  );

  if (minifigParents.length > 0) {
    // Resolve identity for parent rows
    for (const parent of minifigParents) {
      const rbFigNum = parent.partId.slice(4); // strip "fig:" prefix
      const blMinifigId = parent.bricklinkFigId ?? null;
      parent.identity = resolveMinifigParentIdentity(
        blMinifigId ?? rbFigNum,
        rbFigNum
      );
      parent.inventoryKey = parent.identity.canonicalKey;
    }

    // Extract RB fig_num values for subpart query
    const figNums = minifigParents.map(p => p.partId.slice(4)); // "fig:{rbFigNum}" → rbFigNum

    // Batch-fetch subparts from rb_minifig_parts + rb_parts + rb_colors
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
    type RbSubpart = {
      rbPartId: string;
      rbColorId: number;
      colorName: string;
      partName: string;
      quantity: number;
      blPartId: string | null;
      partImageUrl: string | null;
    };
    const subpartsByFig = new Map<string, RbSubpart[]>();
    for (const sp of allSubparts ?? []) {
      // Handle joined data — Supabase returns joined rows as objects
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

    // Build parent lookup for quantity multiplication
    const parentByFigNum = new Map<string, InventoryRow>();
    for (const parent of minifigParents) {
      parentByFigNum.set(parent.partId.slice(4), parent);
    }

    // Track child rows by canonical key for dedup across minifigs
    const childRowsByKey = new Map<string, InventoryRow>();

    // Build canonical key index for existing rows (for dedup with catalog parts)
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
      const blMinifigId = parentRow?.bricklinkFigId ?? figNum;
      const parentKey =
        parentRow?.identity?.canonicalKey ?? `fig:${blMinifigId}`;
      const minifigQty = parentRow?.quantityRequired ?? 1;

      for (const sp of subparts) {
        const subpartIdentity = resolveRbMinifigSubpartIdentity(
          sp.rbPartId,
          sp.rbColorId,
          ctx
        );
        const canonicalKey = subpartIdentity.canonicalKey;
        const totalQtyForThisMinifig = sp.quantity * minifigQty;
        const blPartId = sp.blPartId ?? sp.rbPartId; // same-by-default

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
        parent.componentRelations = subparts.map(sp => {
          const spIdentity = resolveRbMinifigSubpartIdentity(
            sp.rbPartId,
            sp.rbColorId,
            ctx
          );
          return { key: spIdentity.canonicalKey, quantity: sp.quantity };
        });
      }
    }

    result = {
      rows,
      minifigMeta: {
        totalMinifigs: minifigParents.length,
      },
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
