/**
 * Minifig Sync Orchestration
 *
 * This module is the SINGLE source of truth for all minifig-related sync operations.
 * It provides:
 *
 * 1. Centralized in-flight tracking to prevent duplicate BrickLink API calls
 * 2. Clear separation between sync status checks and sync execution
 * 3. Count-based validation (RB expected count vs BL cached count)
 * 4. Unified error handling with explicit error results
 *
 * Architecture:
 * - This module: Orchestration (when to sync, deduplication, cooldowns)
 * - scripts/minifig-mapping-core.ts: BrickLink API execution
 * - app/lib/bricklink/minifigs.ts: Data access (reads from cache)
 */
import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';
import {
  processSetForMinifigMapping,
  fetchAndCacheMinifigParts,
} from '@/scripts/minifig-mapping-core';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Sync status values stored in the database.
 * Note: 'pending' was removed as it was never used.
 */
export type SyncStatus = 'ok' | 'error' | 'never_synced';

export type SetSyncInfo = {
  setNumber: string;
  status: SyncStatus;
  lastSyncAt: Date | null;
  lastError: string | null;
};

export type SyncTriggerResult = {
  triggered: boolean;
  success: boolean;
  reason:
    | 'already_synced'
    | 'sync_in_flight'
    | 'sync_completed'
    | 'sync_failed'
    | 'sync_skipped';
  error?: string;
};

export type SyncCheckResult = {
  needsSync: boolean;
  status: SyncStatus;
  reason: string;
};

export type PartsSyncInfo = {
  blMinifigId: string;
  status: SyncStatus;
  lastSyncAt: Date | null;
};

export type BatchSyncResult = {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
  skipped: string[];
};

// =============================================================================
// CENTRALIZED IN-FLIGHT TRACKING
// =============================================================================

/**
 * Track in-flight set minifig sync operations.
 * Key: set number, Value: Promise that resolves to success boolean
 */
const inFlightSetSyncs = new Map<string, Promise<boolean>>();

/**
 * Track in-flight minifig parts sync operations.
 * Key: BL minifig ID (lowercase), Value: Promise that resolves to success boolean
 */
const inFlightPartsSyncs = new Map<string, Promise<boolean>>();

/**
 * Track recent sync completions to prevent re-triggering too quickly.
 * Key: identifier, Value: timestamp of completion
 */
const recentCompletions = new Map<string, number>();
const SYNC_COOLDOWN_MS = 60_000; // 1 minute cooldown

// =============================================================================
// IN-FLIGHT UTILITIES
// =============================================================================

/**
 * Check if a set sync is currently in progress.
 */
export function isSetSyncInProgress(setNumber: string): boolean {
  return inFlightSetSyncs.has(setNumber);
}

/**
 * Check if a minifig parts sync is currently in progress.
 */
export function isPartsSyncInProgress(blMinifigId: string): boolean {
  return inFlightPartsSyncs.has(blMinifigId.toLowerCase());
}

/**
 * Wait for an in-progress set sync to complete.
 * Returns true if the sync succeeded, false if not in progress or failed.
 */
export async function waitForSetSync(setNumber: string): Promise<boolean> {
  const existing = inFlightSetSyncs.get(setNumber);
  return existing ? existing : false;
}

/**
 * Wait for an in-progress parts sync to complete.
 * Returns true if the sync succeeded, false if not in progress or failed.
 */
export async function waitForPartsSync(blMinifigId: string): Promise<boolean> {
  const existing = inFlightPartsSyncs.get(blMinifigId.toLowerCase());
  return existing ? existing : false;
}

/**
 * Get current in-flight sync counts (for debugging/monitoring).
 */
export function getInFlightCounts(): { sets: number; parts: number } {
  return {
    sets: inFlightSetSyncs.size,
    parts: inFlightPartsSyncs.size,
  };
}

/**
 * Get list of sets currently being synced (for debugging/monitoring).
 */
export function getInFlightSetSyncs(): string[] {
  return Array.from(inFlightSetSyncs.keys());
}

/**
 * Clear the recent completions cache (for testing).
 */
export function clearRecentCompletions(): void {
  recentCompletions.clear();
}

// =============================================================================
// SHARED QUERY HELPERS
// =============================================================================

/**
 * Get expected minifig count from Rebrickable inventory.
 * RB catalog is the source of truth for HOW MANY minifigs a set should have.
 */
async function getExpectedMinifigCount(
  setNumber: string
): Promise<number | null> {
  const supabase = getCatalogWriteClient();

  // Get the latest inventory version for this set
  const { data: inventories, error: invError } = await supabase
    .from('rb_inventories')
    .select('id, version')
    .eq('set_num', setNumber)
    .order('version', { ascending: false })
    .limit(1);

  if (invError || !inventories?.length) {
    return null;
  }

  const inventoryId = inventories[0]!.id;

  // Count minifigs in this inventory
  const { count, error: countError } = await supabase
    .from('rb_inventory_minifigs')
    .select('*', { count: 'exact', head: true })
    .eq('inventory_id', inventoryId);

  if (countError) {
    logger.warn('minifig_sync.get_expected_count_failed', {
      setNumber,
      error: countError.message,
    });
    return null;
  }

  return count ?? 0;
}

/**
 * Get actual cached minifig count from BrickLink data.
 */
async function getCachedMinifigCount(setNumber: string): Promise<number> {
  const supabase = getCatalogWriteClient();

  const { count, error } = await supabase
    .from('bl_set_minifigs')
    .select('*', { count: 'exact', head: true })
    .eq('set_num', setNumber);

  if (error) {
    logger.warn('minifig_sync.get_cached_count_failed', {
      setNumber,
      error: error.message,
    });
    return 0;
  }

  return count ?? 0;
}

/**
 * Check if within cooldown period.
 */
function isWithinCooldown(key: string): boolean {
  const lastCompletion = recentCompletions.get(key);
  return !!lastCompletion && Date.now() - lastCompletion < SYNC_COOLDOWN_MS;
}

/**
 * Record a sync completion for cooldown tracking.
 */
function recordCompletion(key: string): void {
  recentCompletions.set(key, Date.now());
}

// =============================================================================
// SET SYNC STATUS
// =============================================================================

/**
 * Check the sync status for a set without triggering any operations.
 * This is a pure read operation.
 */
export async function checkSetSyncStatus(
  setNumber: string
): Promise<SetSyncInfo> {
  const supabase = getCatalogWriteClient();

  const { data, error } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status, last_minifig_sync_at, last_error')
    .eq('set_num', setNumber)
    .maybeSingle();

  if (error) {
    logger.error('minifig_sync.check_status_failed', {
      setNumber,
      error: error.message,
    });
    return {
      setNumber,
      status: 'never_synced',
      lastSyncAt: null,
      lastError: null,
    };
  }

  if (!data) {
    return {
      setNumber,
      status: 'never_synced',
      lastSyncAt: null,
      lastError: null,
    };
  }

  // Map database status to our type (normalize unknown values)
  let status: SyncStatus = 'never_synced';
  if (data.minifig_sync_status === 'ok') {
    status = 'ok';
  } else if (data.minifig_sync_status === 'error') {
    status = 'error';
  }

  const lastSyncAt = data.last_minifig_sync_at
    ? new Date(data.last_minifig_sync_at)
    : null;

  return {
    setNumber,
    status,
    lastSyncAt,
    lastError: data.last_error ?? null,
  };
}

/**
 * Check if a set needs sync based on its current status.
 */
export async function checkIfSyncNeeded(
  setNumber: string
): Promise<SyncCheckResult> {
  // Check cooldown first
  if (isWithinCooldown(`set:${setNumber}`)) {
    return {
      needsSync: false,
      status: 'ok',
      reason: 'Recently synced (within cooldown period)',
    };
  }

  const syncInfo = await checkSetSyncStatus(setNumber);

  switch (syncInfo.status) {
    case 'ok': {
      // Validate count: compare RB expected count to BL cached count
      const [expectedCount, cachedCount] = await Promise.all([
        getExpectedMinifigCount(setNumber),
        getCachedMinifigCount(setNumber),
      ]);

      // If RB has minifig data and counts don't match, re-sync
      if (expectedCount !== null && expectedCount !== cachedCount) {
        logger.debug('minifig_sync.count_mismatch', {
          setNumber,
          expectedCount,
          cachedCount,
        });
        return {
          needsSync: true,
          status: 'ok',
          reason: `Count mismatch: expected ${expectedCount}, cached ${cachedCount}`,
        };
      }

      return {
        needsSync: false,
        status: 'ok',
        reason: 'Set already synced successfully',
      };
    }
    case 'error':
      return {
        needsSync: true,
        status: 'error',
        reason: `Previous sync failed: ${syncInfo.lastError ?? 'unknown error'}`,
      };
    case 'never_synced':
      return {
        needsSync: true,
        status: 'never_synced',
        reason: 'Set has never been synced',
      };
    default:
      return {
        needsSync: true,
        status: 'never_synced',
        reason: 'Unknown sync status',
      };
  }
}

// =============================================================================
// SET SYNC TRIGGER
// =============================================================================

/**
 * Trigger a sync for a set, with deduplication and proper status tracking.
 *
 * Options:
 * - force: Bypass the "already synced" check and re-sync
 * - skipCooldown: Bypass the recent sync cooldown
 */
export async function triggerSetMinifigSync(
  setNumber: string,
  options: { force?: boolean; skipCooldown?: boolean } = {}
): Promise<SyncTriggerResult> {
  const { force = false, skipCooldown = false } = options;

  // Check if sync is already in progress - join existing
  if (inFlightSetSyncs.has(setNumber)) {
    logger.debug('minifig_sync.join_existing', { setNumber });
    const success = await inFlightSetSyncs.get(setNumber)!;
    return {
      triggered: false,
      success,
      reason: 'sync_in_flight',
    };
  }

  // Check cooldown unless skipped
  if (!skipCooldown && isWithinCooldown(`set:${setNumber}`)) {
    return {
      triggered: false,
      success: true,
      reason: 'sync_skipped',
      error: 'Within cooldown period',
    };
  }

  // Check if sync is needed (unless forcing)
  if (!force) {
    const check = await checkIfSyncNeeded(setNumber);
    if (!check.needsSync) {
      return {
        triggered: false,
        success: check.status === 'ok',
        reason: 'already_synced',
      };
    }
  }

  // Create the sync promise
  const syncPromise = executeSetSync(setNumber);
  inFlightSetSyncs.set(setNumber, syncPromise);

  const success = await syncPromise;

  if (success) {
    return {
      triggered: true,
      success: true,
      reason: 'sync_completed',
    };
  } else {
    return {
      triggered: true,
      success: false,
      reason: 'sync_failed',
      error: 'Sync operation failed',
    };
  }
}

/**
 * Internal function to execute the actual set sync operation.
 */
async function executeSetSync(setNumber: string): Promise<boolean> {
  const supabase = getCatalogWriteClient();

  logger.debug('minifig_sync.start', { setNumber });
  const startTime = Date.now();

  try {
    await processSetForMinifigMapping(
      supabase,
      setNumber,
      '[minifig-sync:explicit]'
    );

    const duration = Date.now() - startTime;
    logger.debug('minifig_sync.completed', { setNumber, duration });

    // Track completion time
    recordCompletion(`set:${setNumber}`);

    return true;
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('minifig_sync.failed', {
      setNumber,
      duration,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    inFlightSetSyncs.delete(setNumber);
  }
}

// =============================================================================
// MINIFIG PARTS SYNC STATUS
// =============================================================================

/**
 * Check the parts sync status for a minifig.
 */
export async function checkPartsSyncStatus(
  blMinifigId: string
): Promise<PartsSyncInfo> {
  const supabase = getCatalogWriteClient();

  const { data, error } = await supabase
    .from('bricklink_minifigs')
    .select('parts_sync_status, last_parts_sync_at')
    .eq('item_id', blMinifigId)
    .maybeSingle();

  if (error) {
    logger.error('minifig_sync.check_parts_status_failed', {
      blMinifigId,
      error: error.message,
    });
    return {
      blMinifigId,
      status: 'never_synced',
      lastSyncAt: null,
    };
  }

  if (!data) {
    return {
      blMinifigId,
      status: 'never_synced',
      lastSyncAt: null,
    };
  }

  let status: SyncStatus = 'never_synced';
  if (data.parts_sync_status === 'ok') {
    status = 'ok';
  } else if (data.parts_sync_status === 'error') {
    status = 'error';
  }

  return {
    blMinifigId,
    status,
    lastSyncAt: data.last_parts_sync_at
      ? new Date(data.last_parts_sync_at)
      : null,
  };
}

// =============================================================================
// MINIFIG PARTS SYNC TRIGGER
// =============================================================================

/**
 * Trigger a parts sync for a minifig, with deduplication.
 *
 * Options:
 * - force: Bypass the "already synced" check and re-sync
 * - skipCooldown: Bypass the recent sync cooldown
 */
export async function triggerMinifigPartsSync(
  blMinifigId: string,
  options: { force?: boolean; skipCooldown?: boolean } = {}
): Promise<SyncTriggerResult> {
  const { force = false, skipCooldown = false } = options;
  const normalizedId = blMinifigId.toLowerCase();

  // Check if sync is already in progress - join existing
  if (inFlightPartsSyncs.has(normalizedId)) {
    logger.debug('minifig_sync.parts_join_existing', { blMinifigId });
    const success = await inFlightPartsSyncs.get(normalizedId)!;
    return {
      triggered: false,
      success,
      reason: 'sync_in_flight',
    };
  }

  // Check cooldown unless skipped
  if (!skipCooldown && isWithinCooldown(`parts:${normalizedId}`)) {
    return {
      triggered: false,
      success: true,
      reason: 'sync_skipped',
      error: 'Within cooldown period',
    };
  }

  // Check if sync is needed (unless forcing)
  if (!force) {
    const status = await checkPartsSyncStatus(blMinifigId);
    if (status.status === 'ok') {
      return {
        triggered: false,
        success: true,
        reason: 'already_synced',
      };
    }
  }

  // Create the sync promise
  const syncPromise = executePartsSync(blMinifigId);
  inFlightPartsSyncs.set(normalizedId, syncPromise);

  const success = await syncPromise;

  if (success) {
    return {
      triggered: true,
      success: true,
      reason: 'sync_completed',
    };
  } else {
    return {
      triggered: true,
      success: false,
      reason: 'sync_failed',
      error: 'Parts sync operation failed',
    };
  }
}

/**
 * Internal function to execute the actual parts sync operation.
 */
async function executePartsSync(blMinifigId: string): Promise<boolean> {
  const supabase = getCatalogWriteClient();
  const normalizedId = blMinifigId.toLowerCase();

  logger.debug('minifig_sync.parts_start', { blMinifigId });
  const startTime = Date.now();

  try {
    const result = await fetchAndCacheMinifigParts(
      supabase,
      blMinifigId,
      '[minifig-sync:parts]'
    );

    const duration = Date.now() - startTime;
    logger.debug('minifig_sync.parts_completed', {
      blMinifigId,
      duration,
      partsCount: result?.length ?? 0,
    });

    // Track completion time
    recordCompletion(`parts:${normalizedId}`);

    return true;
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('minifig_sync.parts_failed', {
      blMinifigId,
      duration,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  } finally {
    inFlightPartsSyncs.delete(normalizedId);
  }
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Check sync status for multiple sets at once.
 */
export async function checkMultipleSetsStatus(
  setNumbers: string[]
): Promise<Map<string, SetSyncInfo>> {
  if (!setNumbers.length) {
    return new Map();
  }

  const supabase = getCatalogWriteClient();

  const { data, error } = await supabase
    .from('bl_sets')
    .select('set_num, minifig_sync_status, last_minifig_sync_at, last_error')
    .in('set_num', setNumbers);

  const results = new Map<string, SetSyncInfo>();

  // Initialize all as never_synced
  for (const setNum of setNumbers) {
    results.set(setNum, {
      setNumber: setNum,
      status: 'never_synced',
      lastSyncAt: null,
      lastError: null,
    });
  }

  if (error) {
    logger.error('minifig_sync.check_multiple_sets_failed', {
      count: setNumbers.length,
      error: error.message,
    });
    return results;
  }

  // Update with actual data
  for (const row of data ?? []) {
    let status: SyncStatus = 'never_synced';
    if (row.minifig_sync_status === 'ok') {
      status = 'ok';
    } else if (row.minifig_sync_status === 'error') {
      status = 'error';
    }

    results.set(row.set_num, {
      setNumber: row.set_num,
      status,
      lastSyncAt: row.last_minifig_sync_at
        ? new Date(row.last_minifig_sync_at)
        : null,
      lastError: row.last_error ?? null,
    });
  }

  return results;
}

/**
 * Get sets that need sync from a list.
 */
export async function getSetsNeedingSync(
  setNumbers: string[]
): Promise<string[]> {
  const statuses = await checkMultipleSetsStatus(setNumbers);

  return setNumbers.filter(setNum => {
    const info = statuses.get(setNum);
    if (!info) return true;
    return info.status !== 'ok';
  });
}

/**
 * Sync multiple sets with proper error tracking.
 * Returns detailed results including which succeeded, failed, and were skipped.
 */
export async function syncMultipleSets(
  setNumbers: string[],
  options: { force?: boolean; maxConcurrent?: number } = {}
): Promise<BatchSyncResult> {
  const { force = false, maxConcurrent = 5 } = options;

  const result: BatchSyncResult = {
    succeeded: [],
    failed: [],
    skipped: [],
  };

  if (!setNumbers.length) {
    return result;
  }

  // Process in batches to limit concurrency
  for (let i = 0; i < setNumbers.length; i += maxConcurrent) {
    const batch = setNumbers.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map(async setNumber => {
        const syncResult = await triggerSetMinifigSync(setNumber, {
          force,
          skipCooldown: force,
        });
        return { setNumber, syncResult };
      })
    );

    for (const settledResult of batchResults) {
      if (settledResult.status === 'rejected') {
        // Promise itself rejected (unexpected error)
        result.failed.push({
          id: 'unknown',
          error:
            settledResult.reason instanceof Error
              ? settledResult.reason.message
              : String(settledResult.reason),
        });
        continue;
      }

      const { setNumber, syncResult } = settledResult.value;

      if (syncResult.reason === 'already_synced') {
        result.skipped.push(setNumber);
      } else if (syncResult.success) {
        result.succeeded.push(setNumber);
      } else {
        result.failed.push({
          id: setNumber,
          error: syncResult.error ?? 'Unknown error',
        });
      }
    }
  }

  logger.debug('minifig_sync.batch_complete', {
    total: setNumbers.length,
    succeeded: result.succeeded.length,
    failed: result.failed.length,
    skipped: result.skipped.length,
  });

  return result;
}

// =============================================================================
// LEGACY API COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use triggerSetMinifigSync instead
 */
export const triggerMinifigSync = triggerSetMinifigSync;

/**
 * @deprecated Use isSetSyncInProgress instead
 */
export const isSyncInProgress = isSetSyncInProgress;

/**
 * @deprecated Use waitForSetSync instead
 */
export const waitForSync = waitForSetSync;

/**
 * @deprecated Use getInFlightCounts().sets instead
 */
export function getInFlightSyncCount(): number {
  return inFlightSetSyncs.size;
}

/**
 * @deprecated Use getInFlightSetSyncs instead
 */
export function getInFlightSyncs(): string[] {
  return Array.from(inFlightSetSyncs.keys());
}
