import type { InventoryRow } from '@/app/components/set/types';
import { getSetMinifigsBl } from '@/app/lib/bricklink/minifigs';
import { LRUCache } from '@/app/lib/cache/lru';
import { getSetInventoryLocal } from '@/app/lib/catalog';
import { getSetInventory } from '@/app/lib/rebrickable';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { logger } from '@/lib/metrics';

export type InventoryResult = {
  rows: InventoryRow[];
  /** Metadata about minifig sync status (BL-only, no RB mapping) */
  minifigMeta?: {
    /** How many minifigs in the set */
    totalMinifigs: number;
    /** Sync status: 'ok' | 'error' | 'pending' | null */
    syncStatus: 'ok' | 'error' | 'pending' | null;
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
    // Build lookup map by BL minifig ID
    const blMinifigMap = new Map(
      blMinifigResult.minifigs.map(m => [m.minifigNo, m])
    );

    // Also build reverse lookup by RB fig ID (for matching existing rows)
    const rbToBlMap = new Map<string, string>();
    for (const m of blMinifigResult.minifigs) {
      if (m.rbFigId) {
        rbToBlMap.set(m.rbFigId.toLowerCase(), m.minifigNo);
      }
    }

    const matchedBlIds = new Set<string>();

    // Update existing rows with BL data
    const enrichedRows = rows.map(row => {
      if (
        row.parentCategory === 'Minifigure' &&
        typeof row.partId === 'string' &&
        row.partId.startsWith('fig:')
      ) {
        const rbFigId = row.partId.replace(/^fig:/, '').trim().toLowerCase();
        const blMinifigNo = rbToBlMap.get(rbFigId);

        if (blMinifigNo) {
          matchedBlIds.add(blMinifigNo);
          const blData = blMinifigMap.get(blMinifigNo);

          // Return row with BL ID as primary, BL data enrichment
          return {
            ...row,
            // Update partId to use BL ID
            partId: `fig:${blMinifigNo}`,
            // Use BL name if available
            partName: blData?.name ?? row.partName,
            // Use BL image if available
            imageUrl: blData?.imageUrl ?? row.imageUrl,
            // Store BL ID for Bricklink links
            bricklinkFigId: blMinifigNo,
          };
        }
      }
      return row;
    });

    // Add any BL minifigs that weren't in RB inventory (rare but possible)
    const unmatchedBlMinifigs = blMinifigResult.minifigs.filter(
      m => !matchedBlIds.has(m.minifigNo)
    );

    for (const blMinifig of unmatchedBlMinifigs) {
      enrichedRows.push({
        setNumber,
        partId: `fig:${blMinifig.minifigNo}`,
        partName: blMinifig.name ?? blMinifig.minifigNo,
        colorId: 0,
        colorName: '—',
        quantityRequired: blMinifig.quantity,
        imageUrl: blMinifig.imageUrl,
        partCategoryName: 'Minifig',
        parentCategory: 'Minifigure',
        inventoryKey: `fig:${blMinifig.minifigNo}`,
        componentRelations: [],
        bricklinkFigId: blMinifig.minifigNo,
      });
    }

    // Identify minifigs needing enrichment
    const allBlMinifigNos = blMinifigResult.minifigs.map(m => m.minifigNo);
    const missingImages = blMinifigResult.minifigs
      .filter(m => !m.imageUrl)
      .map(m => m.minifigNo);

    // For missing subparts, check if existing rows have componentRelations
    const rowsByBlId = new Map(
      enrichedRows
        .filter(
          r => r.parentCategory === 'Minifigure' && r.partId.startsWith('fig:')
        )
        .map(r => [r.partId.replace(/^fig:/, ''), r])
    );
    const missingSubparts = allBlMinifigNos.filter(blId => {
      const row = rowsByBlId.get(blId);
      return !row?.componentRelations || row.componentRelations.length === 0;
    });

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
