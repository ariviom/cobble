import type { InventoryRow } from '@/app/components/set/types';
import { getSetInventoryLocal } from '@/app/lib/catalog';
import {
  getGlobalMinifigMappingsBatch,
  getMinifigMappingsForSetBatched,
  normalizeRebrickableFigId,
} from '@/app/lib/minifigMappingBatched';
import { getSetInventory } from '@/app/lib/rebrickable';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { logger } from '@/lib/metrics';

export type InventoryResult = {
  rows: InventoryRow[];
  /** Metadata about minifig mapping status */
  minifigMappingMeta?: {
    /** How many minifigs in the set */
    totalMinifigs: number;
    /** How many have BrickLink IDs */
    mappedCount: number;
    /** Sync status: 'ok' | 'error' | 'pending' | null */
    syncStatus: 'ok' | 'error' | 'pending' | null;
    /** Whether a sync was triggered during this request */
    syncTriggered: boolean;
    /** Fig IDs that remain unmapped */
    unmappedFigIds: string[];
  };
  /** Hints for client-side minifig enrichment */
  minifigEnrichmentNeeded?: {
    figNums: string[];
    missingImages: string[];
    missingSubparts: string[];
  };
  /** Spare-part enrichment metadata */
  spares?: {
    status: 'ok' | 'error';
    spareCount: number;
    lastChecked: string | null;
  };
};

type SpareCacheEntry = {
  keys: Set<string>;
  fetchedAt: number;
};

const SPARE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const spareCache = new Map<string, SpareCacheEntry>();
const inFlightSpares = new Map<string, Promise<SpareCacheEntry>>();

type RebrickableSparePage = {
  results: Array<{
    part: { part_num: string };
    color: { id: number };
    is_spare: boolean;
  }>;
  next: string | null;
};

function buildSpareCacheEntry(
  results: RebrickableSparePage['results']
): SpareCacheEntry {
  const keys = new Set<string>();
  for (const row of results) {
    if (!row?.is_spare) continue;
    const partNum = row.part?.part_num;
    const colorId = row.color?.id;
    if (typeof partNum === 'string' && typeof colorId === 'number') {
      keys.add(`${partNum}:${colorId}`);
    }
  }
  return { keys, fetchedAt: Date.now() };
}

async function fetchSparesFromRebrickable(
  setNumber: string
): Promise<SpareCacheEntry> {
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
  return buildSpareCacheEntry(all);
}

async function getSpareCacheEntry(
  setNumber: string
): Promise<SpareCacheEntry | null> {
  const cached = spareCache.get(setNumber);
  if (cached && Date.now() - cached.fetchedAt < SPARE_CACHE_TTL_MS) {
    return cached;
  }
  if (inFlightSpares.has(setNumber)) {
    return inFlightSpares.get(setNumber)!;
  }
  const promise = fetchSparesFromRebrickable(setNumber)
    .then(entry => {
      spareCache.set(setNumber, entry);
      return entry;
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
 * Get inventory rows for a set with minifig BrickLink ID enrichment.
 *
 * This function:
 * 1. Loads inventory from Supabase catalog (falls back to Rebrickable API)
 * 2. Identifies minifig rows and extracts their Rebrickable fig IDs
 * 3. Uses batched lookup to get BrickLink IDs (single query + optional sync)
 * 4. Falls back to global mappings for any remaining unmapped figs
 * 5. Returns enriched rows with mapping metadata
 */
export async function getSetInventoryRows(
  setNumber: string
): Promise<InventoryRow[]> {
  const result = await getSetInventoryRowsWithMeta(setNumber);
  return result.rows;
}

/**
 * Extended version that returns mapping metadata alongside rows.
 * Useful for debugging and for UI that wants to show sync status.
 */
export async function getSetInventoryRowsWithMeta(
  setNumber: string
): Promise<InventoryResult> {
  // Prefer Supabase-backed catalog inventory when available.
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

  // Fallback to live Rebrickable inventory when Supabase has no rows or errors.
  if (!rows.length) {
    rows = await getSetInventory(setNumber);
  }

  // Identify minifigure parent rows; if missing, try live fetch (with upsert in rebrickable.ts)
  let result: InventoryResult = { rows };

  let figRows = rows.filter(
    row =>
      row.parentCategory === 'Minifigure' &&
      typeof row.partId === 'string' &&
      row.partId.startsWith('fig:')
  );

  if (!figRows.length) {
    try {
      const liveRows = await getSetInventory(setNumber);
      const liveFigRows = liveRows.filter(
        row =>
          row.parentCategory === 'Minifigure' &&
          typeof row.partId === 'string' &&
          row.partId.startsWith('fig:')
      );
      if (liveFigRows.length) {
        rows = liveRows;
        figRows = liveFigRows;
      }
    } catch (err) {
      logger.warn('inventory.live_minifig_fetch_failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (figRows.length) {
    const uniqueFigIds = Array.from(
      new Set(
        figRows
          .map(row => row.partId.replace(/^fig:/, '').trim())
          .filter(Boolean)
      )
    );

    if (uniqueFigIds.length) {
      // Use batched lookup - single query for mappings + sync status
      const batchedResult = await getMinifigMappingsForSetBatched(
        setNumber,
        uniqueFigIds,
        { triggerSyncIfMissing: true }
      );

      const byFigId = new Map<string, string | null>();

      // Copy per-set mappings
      for (const [normalized, blId] of batchedResult.mappings.entries()) {
        // Find original figId that matches this normalized key
        const originalId = uniqueFigIds.find(
          id => normalizeRebrickableFigId(id) === normalized
        );
        if (originalId) {
          byFigId.set(originalId, blId);
        }
      }

      // Get global fallback mappings for any still-unmapped figs
      const stillMissing = uniqueFigIds.filter(id => !byFigId.has(id));

      if (stillMissing.length > 0) {
        const globalMappings =
          await getGlobalMinifigMappingsBatch(stillMissing);
        for (const figId of stillMissing) {
          const normalized = normalizeRebrickableFigId(figId);
          const blId = globalMappings.get(normalized) ?? null;
          byFigId.set(figId, blId);
        }
      }

      // Count mapped vs unmapped
      let mappedCount = 0;
      const finalUnmapped: string[] = [];
      for (const figId of uniqueFigIds) {
        const blId = byFigId.get(figId);
        if (blId) {
          mappedCount++;
        } else {
          finalUnmapped.push(figId);
        }
      }

      // Enrich rows with BrickLink IDs
      const enrichedRows = rows.map(row => {
        if (
          row.parentCategory === 'Minifigure' &&
          typeof row.partId === 'string' &&
          row.partId.startsWith('fig:')
        ) {
          const cleanId = row.partId.replace(/^fig:/, '').trim();
          const blId = cleanId ? (byFigId.get(cleanId) ?? null) : null;
          return { ...row, bricklinkFigId: blId };
        }
        return row;
      });

      const missingImages = figRows
        .filter(
          r =>
            !r.imageUrl ||
            (typeof r.imageUrl === 'string' &&
              r.imageUrl.includes('cdn.rebrickable.com/media/sets/'))
        )
        .map(r => r.partId.replace(/^fig:/, '').trim());

      const missingSubparts = figRows
        .filter(r => !r.componentRelations || r.componentRelations.length === 0)
        .map(r => r.partId.replace(/^fig:/, '').trim());

      result = {
        ...result,
        rows: enrichedRows,
        minifigMappingMeta: {
          totalMinifigs: uniqueFigIds.length,
          mappedCount,
          syncStatus: batchedResult.syncStatus,
          syncTriggered: batchedResult.syncTriggered,
          unmappedFigIds: finalUnmapped,
        },
        minifigEnrichmentNeeded: {
          figNums: uniqueFigIds,
          missingImages: Array.from(new Set(missingImages)),
          missingSubparts: Array.from(new Set(missingSubparts)),
        },
      };
    }
  }

  // Spare-part filtering with cached live fetch (best-effort)
  try {
    const spareEntry = await getSpareCacheEntry(setNumber);
    if (spareEntry) {
      const spareKeys = spareEntry.keys;
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
        lastChecked: new Date(spareEntry.fetchedAt).toISOString(),
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
