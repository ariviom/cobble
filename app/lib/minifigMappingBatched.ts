import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { processSetForMinifigMapping } from '@/scripts/minifig-mapping-core';

// =============================================================================
// TYPES
// =============================================================================

export type MinifigMappingResult = {
  /** Map of normalized rb_fig_id → bl_minifig_no (null if known unmapped) */
  mappings: Map<string, string | null>;
  /** Sync status for this set: 'ok' | 'error' | 'pending' | null (never synced) */
  syncStatus: 'ok' | 'error' | 'pending' | null;
  /** Fig IDs that were requested but have no mapping */
  unmappedFigIds: string[];
  /** Whether a sync was triggered during this call */
  syncTriggered: boolean;
};

export type BatchedMappingOptions = {
  /** If true, trigger on-demand sync when mappings are missing */
  triggerSyncIfMissing?: boolean;
  /** Skip sync even if mappings are missing (useful for read-only calls) */
  readOnly?: boolean;
};

// =============================================================================
// IN-FLIGHT SYNC DEDUPLICATION
// =============================================================================

/**
 * Track in-flight sync operations to prevent duplicate BrickLink API calls
 * for the same set when multiple concurrent requests arrive.
 */
const inFlightSyncs = new Map<string, Promise<boolean>>();

/**
 * Execute a sync for a set, deduplicating concurrent requests.
 * Returns true if sync completed successfully, false otherwise.
 */
async function executeSetSyncDeduplicated(
  setNumber: string
): Promise<boolean> {
  const existing = inFlightSyncs.get(setNumber);
  if (existing) {
    console.log('[minifigMapping:batched] Joining existing sync for', setNumber);
    return existing;
  }

  const syncPromise = (async () => {
    // bl_sets, bl_set_minifigs require service role
    const supabase = getCatalogWriteClient();
    try {
      await processSetForMinifigMapping(
        supabase,
        setNumber,
        '[minifig-mapping:on-demand-batched]'
      );
      return true;
    } catch (err) {
      console.error('[minifigMapping:batched] Sync failed', {
        setNumber,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      // Remove from in-flight map after a short delay to handle race conditions
      setTimeout(() => {
        inFlightSyncs.delete(setNumber);
      }, 100);
    }
  })();

  inFlightSyncs.set(setNumber, syncPromise);
  return syncPromise;
}

// =============================================================================
// BATCHED LOOKUP
// =============================================================================

export function normalizeRebrickableFigId(figId: string): string {
  return figId.trim().toLowerCase();
}

/**
 * Fetch minifig mappings for a set in a single batched query.
 * 
 * This replaces the previous pattern of:
 * 1. mapSetRebrickableFigsToBrickLink() - query bl_set_minifigs
 * 2. Check for missing IDs
 * 3. Query bl_sets.minifig_sync_status
 * 4. Optionally trigger sync
 * 5. Re-query bl_set_minifigs
 * 
 * With a single query that fetches mappings + sync status together,
 * and uses request deduplication for sync triggers.
 */
export async function getMinifigMappingsForSetBatched(
  setNumber: string,
  figIds: string[],
  options: BatchedMappingOptions = {}
): Promise<MinifigMappingResult> {
  const { triggerSyncIfMissing = true, readOnly = false } = options;
  // bl_set_minifigs, bl_sets require service role
  const supabase = getCatalogWriteClient();
  
  const cleanIds = figIds.map(normalizeRebrickableFigId).filter(Boolean);
  if (!cleanIds.length) {
    return {
      mappings: new Map(),
      syncStatus: null,
      unmappedFigIds: [],
      syncTriggered: false,
    };
  }

  // Single query to get both mappings and sync status
  const [mappingsResult, syncStatusResult] = await Promise.all([
    supabase
      .from('bl_set_minifigs')
      .select('rb_fig_id, minifig_no')
      .eq('set_num', setNumber)
      .in('rb_fig_id', cleanIds),
    supabase
      .from('bl_sets')
      .select('minifig_sync_status')
      .eq('set_num', setNumber)
      .maybeSingle(),
  ]);

  if (mappingsResult.error) {
    console.error('[minifigMapping:batched] Failed to load mappings', {
      setNumber,
      error: mappingsResult.error.message,
    });
  }

  if (syncStatusResult.error) {
    console.error('[minifigMapping:batched] Failed to load sync status', {
      setNumber,
      error: syncStatusResult.error.message,
    });
  }

  // Build initial mappings map
  const mappings = new Map<string, string | null>();
  for (const row of mappingsResult.data ?? []) {
    if (!row.rb_fig_id) continue;
    mappings.set(normalizeRebrickableFigId(row.rb_fig_id), row.minifig_no ?? null);
  }

  const syncStatus = (syncStatusResult.data?.minifig_sync_status as 'ok' | 'error' | 'pending') ?? null;
  
  // Determine which fig IDs are missing
  const unmappedFigIds = cleanIds.filter(id => !mappings.has(id));

  // Early return if all mapped or sync already complete
  if (unmappedFigIds.length === 0 || syncStatus === 'ok' || readOnly) {
    return {
      mappings,
      syncStatus,
      unmappedFigIds,
      syncTriggered: false,
    };
  }

  // Don't trigger sync if disabled
  if (!triggerSyncIfMissing) {
    return {
      mappings,
      syncStatus,
      unmappedFigIds,
      syncTriggered: false,
    };
  }

  // Trigger sync (deduplicated across concurrent requests)
  const syncSuccess = await executeSetSyncDeduplicated(setNumber);
  
  if (!syncSuccess) {
    return {
      mappings,
      syncStatus: 'error',
      unmappedFigIds,
      syncTriggered: true,
    };
  }

  // Re-fetch mappings after successful sync
  const { data: updatedMappings, error: updateErr } = await supabase
    .from('bl_set_minifigs')
    .select('rb_fig_id, minifig_no')
    .eq('set_num', setNumber)
    .in('rb_fig_id', cleanIds);

  if (updateErr) {
    console.error('[minifigMapping:batched] Failed to reload mappings after sync', {
      setNumber,
      error: updateErr.message,
    });
  }

  // Merge updated mappings
  for (const row of updatedMappings ?? []) {
    if (!row.rb_fig_id) continue;
    mappings.set(normalizeRebrickableFigId(row.rb_fig_id), row.minifig_no ?? null);
  }

  // Recalculate unmapped
  const stillUnmapped = cleanIds.filter(id => !mappings.has(id));

  return {
    mappings,
    syncStatus: 'ok',
    unmappedFigIds: stillUnmapped,
    syncTriggered: true,
  };
}

// =============================================================================
// GLOBAL FALLBACK LOOKUP (for individual figs not in a set context)
// =============================================================================

/** In-memory cache for global RB→BL lookups */
const globalMinifigIdCache = new Map<string, string | null>();

/**
 * Look up a single RB fig ID → BL minifig ID using global mapping tables.
 * This is used as a fallback when per-set mapping doesn't exist.
 * 
 * Checks in order:
 * 1. In-memory cache
 * 2. bricklink_minifig_mappings table
 * 3. Any bl_set_minifigs row with this rb_fig_id
 */
export async function getGlobalMinifigMapping(
  figId: string
): Promise<string | null> {
  const cacheKey = normalizeRebrickableFigId(figId);
  
  if (globalMinifigIdCache.has(cacheKey)) {
    return globalMinifigIdCache.get(cacheKey)!;
  }

  // bricklink_minifig_mappings, bl_set_minifigs require service role
  const supabase = getCatalogWriteClient();

  // Check explicit mappings table first
  const { data: explicitMapping, error: explicitErr } = await supabase
    .from('bricklink_minifig_mappings')
    .select('bl_item_id')
    .eq('rb_fig_id', figId)
    .maybeSingle();

  if (explicitErr) {
    console.error('[minifigMapping:batched] Global mapping lookup failed', {
      figId,
      error: explicitErr.message,
    });
  }

  if (explicitMapping?.bl_item_id) {
    globalMinifigIdCache.set(cacheKey, explicitMapping.bl_item_id);
    return explicitMapping.bl_item_id;
  }

  // Fallback: check any per-set mapping
  const { data: setMapping, error: setErr } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no')
    .eq('rb_fig_id', figId)
    .not('minifig_no', 'is', null)
    .limit(1)
    .maybeSingle();

  if (setErr) {
    console.error('[minifigMapping:batched] Set mapping fallback failed', {
      figId,
      error: setErr.message,
    });
  }

  if (setMapping?.minifig_no) {
    globalMinifigIdCache.set(cacheKey, setMapping.minifig_no);
    return setMapping.minifig_no;
  }

  globalMinifigIdCache.set(cacheKey, null);
  return null;
}

/**
 * Batch lookup for multiple fig IDs using global mapping tables.
 * More efficient than calling getGlobalMinifigMapping() in a loop.
 */
export async function getGlobalMinifigMappingsBatch(
  figIds: string[]
): Promise<Map<string, string | null>> {
  const cleanIds = figIds.map(normalizeRebrickableFigId).filter(Boolean);
  if (!cleanIds.length) {
    return new Map();
  }

  const results = new Map<string, string | null>();
  const uncachedIds: string[] = [];

  // Check cache first
  for (const id of cleanIds) {
    if (globalMinifigIdCache.has(id)) {
      results.set(id, globalMinifigIdCache.get(id)!);
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    return results;
  }

  // bricklink_minifig_mappings, bl_set_minifigs require service role
  const supabase = getCatalogWriteClient();

  // Batch query explicit mappings
  const { data: explicitMappings } = await supabase
    .from('bricklink_minifig_mappings')
    .select('rb_fig_id, bl_item_id')
    .in('rb_fig_id', uncachedIds);

  const foundInExplicit = new Set<string>();
  for (const row of explicitMappings ?? []) {
    if (!row.rb_fig_id) continue;
    const normalized = normalizeRebrickableFigId(row.rb_fig_id);
    results.set(normalized, row.bl_item_id ?? null);
    globalMinifigIdCache.set(normalized, row.bl_item_id ?? null);
    foundInExplicit.add(normalized);
  }

  // Find remaining IDs not in explicit mappings
  const remainingIds = uncachedIds.filter(id => !foundInExplicit.has(id));
  
  if (remainingIds.length > 0) {
    // Batch query set mappings for remaining
    const { data: setMappings } = await supabase
      .from('bl_set_minifigs')
      .select('rb_fig_id, minifig_no')
      .in('rb_fig_id', remainingIds)
      .not('minifig_no', 'is', null);

    const foundInSet = new Set<string>();
    for (const row of setMappings ?? []) {
      if (!row.rb_fig_id || foundInSet.has(normalizeRebrickableFigId(row.rb_fig_id))) continue;
      const normalized = normalizeRebrickableFigId(row.rb_fig_id);
      results.set(normalized, row.minifig_no ?? null);
      globalMinifigIdCache.set(normalized, row.minifig_no ?? null);
      foundInSet.add(normalized);
    }

    // Mark remaining as null (not found)
    for (const id of remainingIds) {
      if (!results.has(id)) {
        results.set(id, null);
        globalMinifigIdCache.set(id, null);
      }
    }
  }

  return results;
}

// =============================================================================
// BL → RB REVERSE LOOKUP
// =============================================================================

/** In-memory cache for BL→RB reverse lookups */
const globalMinifigBlToRbCache = new Map<string, string | null>();

/**
 * Map a BrickLink minifig ID back to a Rebrickable ID.
 * Used when the caller has a BL ID and needs the RB ID for catalog lookups.
 */
export async function mapBrickLinkFigToRebrickable(
  blId: string
): Promise<string | null> {
  const cacheKey = blId.trim().toLowerCase();
  
  if (globalMinifigBlToRbCache.has(cacheKey)) {
    return globalMinifigBlToRbCache.get(cacheKey)!;
  }

  // bricklink_minifig_mappings, bl_set_minifigs require service role
  const supabase = getCatalogWriteClient();

  // Check explicit mappings table first
  const { data: explicitMapping } = await supabase
    .from('bricklink_minifig_mappings')
    .select('rb_fig_id')
    .eq('bl_item_id', blId)
    .maybeSingle();

  if (explicitMapping?.rb_fig_id) {
    globalMinifigBlToRbCache.set(cacheKey, explicitMapping.rb_fig_id);
    return explicitMapping.rb_fig_id;
  }

  // Fallback: check any per-set mapping
  const { data: setMapping } = await supabase
    .from('bl_set_minifigs')
    .select('rb_fig_id')
    .eq('minifig_no', blId)
    .not('rb_fig_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (setMapping?.rb_fig_id) {
    globalMinifigBlToRbCache.set(cacheKey, setMapping.rb_fig_id);
    return setMapping.rb_fig_id;
  }

  globalMinifigBlToRbCache.set(cacheKey, null);
  return null;
}

// =============================================================================
// ON-DEMAND SINGLE-FIG LOOKUP (with sync trigger)
// =============================================================================

/**
 * On-demand variant for a single minifig. If no BL mapping exists,
 * look up a set that contains this minifig and trigger the set's
 * on-demand sync, then return the newly-created mapping.
 */
export async function mapRebrickableFigToBrickLinkOnDemand(
  figId: string
): Promise<string | null> {
  // First try the regular lookup (checks cache + existing mappings).
  const existing = await getGlobalMinifigMapping(figId);
  if (existing) {
    return existing;
  }

  // rb_inventory_minifigs, rb_inventories, bl_sets require service role
  const supabase = getCatalogWriteClient();

  // Find a set that contains this minifig via rb_inventory_minifigs.
  const { data: inventoryRow, error: invErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id')
    .eq('fig_num', figId)
    .limit(1)
    .maybeSingle();

  if (invErr || !inventoryRow?.inventory_id) {
    console.error('[minifigMapping:batched] could not find inventory for fig', {
      figId,
      error: invErr?.message,
    });
    return null;
  }

  // Get the set_num from rb_inventories.
  const { data: inventory, error: setErr } = await supabase
    .from('rb_inventories')
    .select('set_num')
    .eq('id', inventoryRow.inventory_id)
    .maybeSingle();

  if (setErr || !inventory?.set_num) {
    console.error('[minifigMapping:batched] could not find set for inventory', {
      figId,
      inventoryId: inventoryRow.inventory_id,
      error: setErr?.message,
    });
    return null;
  }

  const setNum = inventory.set_num;

  // Check if this set has already been synced successfully.
  const { data: blSet } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status')
    .eq('set_num', setNum)
    .maybeSingle();

  if (blSet?.minifig_sync_status === 'ok') {
    // Set was synced but this fig still has no mapping - nothing more we can do.
    return null;
  }

  // Trigger on-demand sync for this set (deduplicated).
  console.log('[minifigMapping:batched] triggering on-demand sync for minifig', {
    figId,
    setNum,
  });

  const syncSuccess = await executeSetSyncDeduplicated(setNum);
  
  if (!syncSuccess) {
    return null;
  }

  // Clear the cache entry so we re-read from DB.
  const cacheKey = normalizeRebrickableFigId(figId);
  globalMinifigIdCache.delete(cacheKey);

  // Re-attempt lookup after sync.
  return getGlobalMinifigMapping(figId);
}

// =============================================================================
// LEGACY COMPATIBILITY ALIASES
// =============================================================================

/**
 * @deprecated Use getGlobalMinifigMapping() instead.
 * Alias maintained for backward compatibility.
 */
export const mapRebrickableFigToBrickLink = getGlobalMinifigMapping;

/**
 * @deprecated Use getMinifigMappingsForSetBatched() instead.
 * This function maintains the old interface but uses batched implementation.
 */
export async function mapSetRebrickableFigsToBrickLink(
  setNumber: string,
  figIds: string[]
): Promise<Map<string, string | null>> {
  const result = await getMinifigMappingsForSetBatched(setNumber, figIds, {
    triggerSyncIfMissing: false,
    readOnly: true,
  });
  return result.mappings;
}

/**
 * @deprecated Use getMinifigMappingsForSetBatched() with triggerSyncIfMissing: true.
 * This function maintains the old interface but uses batched implementation.
 */
export async function mapSetRebrickableFigsToBrickLinkOnDemand(
  setNumber: string,
  figIds: string[]
): Promise<Map<string, string | null>> {
  const result = await getMinifigMappingsForSetBatched(setNumber, figIds, {
    triggerSyncIfMissing: true,
  });
  return result.mappings;
}

