import { getSetInventoryLocal } from '@/app/lib/catalog';
import {
  getMinifigMappingsForSetBatched,
  getGlobalMinifigMappingsBatch,
  normalizeRebrickableFigId,
} from '@/app/lib/minifigMappingBatched';
import { getSetInventory } from '@/app/lib/rebrickable';
import type { InventoryRow } from '@/app/components/set/types';

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
};

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
    console.error(
      'Supabase getSetInventoryLocal failed, falling back to Rebrickable',
      {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }

  // Fallback to live Rebrickable inventory when Supabase has no rows or errors.
  if (!rows.length) {
    rows = await getSetInventory(setNumber);
  }

  // Identify minifigure parent rows
  const figRows = rows.filter(
    row =>
      row.parentCategory === 'Minifigure' &&
      typeof row.partId === 'string' &&
      row.partId.startsWith('fig:')
  );

  if (!figRows.length) {
    return { rows };
  }

  const uniqueFigIds = Array.from(
    new Set(
      figRows
        .map(row => row.partId.replace(/^fig:/, '').trim())
        .filter(Boolean)
    )
  );

  if (!uniqueFigIds.length) {
    return { rows };
  }

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
    const globalMappings = await getGlobalMinifigMappingsBatch(stillMissing);
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
      const blId = cleanId ? byFigId.get(cleanId) ?? null : null;
      return { ...row, bricklinkFigId: blId };
    }
    return row;
  });

  return {
    rows: enrichedRows,
    minifigMappingMeta: {
      totalMinifigs: uniqueFigIds.length,
      mappedCount,
      syncStatus: batchedResult.syncStatus,
      syncTriggered: batchedResult.syncTriggered,
      unmappedFigIds: finalUnmapped,
    },
  };
}
