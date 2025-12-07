/**
 * Minifig sync module - explicit control over BrickLink sync operations.
 * 
 * This module separates the "check if sync is needed" logic from the
 * "perform the sync" logic, providing:
 * 
 * 1. Clear separation between read and write operations
 * 2. Request deduplication for concurrent sync triggers
 * 3. Audit logging for sync operations
 * 4. Explicit control over when syncs are triggered
 */
import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';
import { processSetForMinifigMapping } from '@/scripts/minifig-mapping-core';

// =============================================================================
// TYPES
// =============================================================================

export type SyncStatus = 'ok' | 'error' | 'pending' | 'never_synced';

export type SetSyncInfo = {
  setNumber: string;
  status: SyncStatus;
  lastSyncAt: Date | null;
  lastError: string | null;
};

export type SyncTriggerResult = {
  triggered: boolean;
  success: boolean;
  reason: 'already_synced' | 'sync_in_flight' | 'sync_completed' | 'sync_failed' | 'sync_skipped';
  error?: string | undefined;
};

export type SyncCheckResult = {
  needsSync: boolean;
  status: SyncStatus;
  reason: string;
};

// =============================================================================
// IN-FLIGHT SYNC TRACKING
// =============================================================================

/**
 * Track in-flight sync operations to prevent duplicate BrickLink API calls.
 * Key: set number, Value: Promise that resolves when sync completes
 */
const inFlightSyncs = new Map<string, Promise<boolean>>();

/**
 * Track recent sync completions to prevent re-triggering too quickly.
 * Key: set number, Value: timestamp of completion
 */
const recentSyncCompletions = new Map<string, number>();
const SYNC_COOLDOWN_MS = 60_000; // 1 minute cooldown between syncs

/**
 * Check if a sync is currently in progress for a set.
 */
export function isSyncInProgress(setNumber: string): boolean {
  return inFlightSyncs.has(setNumber);
}

/**
 * Wait for an in-progress sync to complete.
 * Returns true if the sync succeeded, false otherwise.
 */
export async function waitForSync(setNumber: string): Promise<boolean> {
  const existing = inFlightSyncs.get(setNumber);
  if (existing) {
    return existing;
  }
  return false;
}

// =============================================================================
// SYNC STATUS CHECK
// =============================================================================

/**
 * Check the sync status for a set without triggering any operations.
 * This is a pure read operation.
 */
export async function checkSetSyncStatus(setNumber: string): Promise<SetSyncInfo> {
  const supabase = getCatalogWriteClient();
  
  const { data, error } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status, last_minifig_sync_at, last_error')
    .eq('set_num', setNumber)
    .maybeSingle();

  if (error) {
    console.error('[minifigSync] Failed to check sync status', {
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

  const status = (data.minifig_sync_status as SyncStatus) ?? 'never_synced';
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
export async function checkIfSyncNeeded(setNumber: string): Promise<SyncCheckResult> {
  // Check cooldown first
  const lastCompletion = recentSyncCompletions.get(setNumber);
  if (lastCompletion && Date.now() - lastCompletion < SYNC_COOLDOWN_MS) {
    return {
      needsSync: false,
      status: 'ok',
      reason: 'Recently synced (within cooldown period)',
    };
  }

  const syncInfo = await checkSetSyncStatus(setNumber);

  switch (syncInfo.status) {
    case 'ok':
      return {
        needsSync: false,
        status: 'ok',
        reason: 'Set already synced successfully',
      };
    case 'pending':
      return {
        needsSync: false,
        status: 'pending',
        reason: 'Sync already in progress',
      };
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
// SYNC TRIGGER
// =============================================================================

/**
 * Trigger a sync for a set, with deduplication and proper status tracking.
 * 
 * Options:
 * - force: Bypass the "already synced" check and re-sync
 * - skipCooldown: Bypass the recent sync cooldown
 */
export async function triggerMinifigSync(
  setNumber: string,
  options: { force?: boolean; skipCooldown?: boolean } = {}
): Promise<SyncTriggerResult> {
  const { force = false, skipCooldown = false } = options;

  // Check if sync is already in progress
  if (inFlightSyncs.has(setNumber)) {
    logger.debug('minifig_sync.join_existing', { setNumber });
    const success = await inFlightSyncs.get(setNumber)!;
    return {
      triggered: false,
      success,
      reason: 'sync_in_flight',
    };
  }

  // Check cooldown unless skipped
  if (!skipCooldown) {
    const lastCompletion = recentSyncCompletions.get(setNumber);
    if (lastCompletion && Date.now() - lastCompletion < SYNC_COOLDOWN_MS) {
      return {
        triggered: false,
        success: true,
        reason: 'sync_skipped',
        error: 'Within cooldown period',
      };
    }
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
  const syncPromise = executeSync(setNumber);
  inFlightSyncs.set(setNumber, syncPromise);

  const success = await syncPromise;

  return {
    triggered: true,
    success,
    reason: success ? 'sync_completed' : 'sync_failed',
    error: success ? undefined : 'Sync operation failed',
  };
}

/**
 * Internal function to execute the actual sync operation.
 */
async function executeSync(setNumber: string): Promise<boolean> {
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
    recentSyncCompletions.set(setNumber, Date.now());
    
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
    // Remove from in-flight after a short delay to handle race conditions
    setTimeout(() => {
      inFlightSyncs.delete(setNumber);
    }, 100);
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
    console.error('[minifigSync] Failed to check multiple sets', {
      count: setNumbers.length,
      error: error.message,
    });
    return results;
  }

  // Update with actual data
  for (const row of data ?? []) {
    results.set(row.set_num, {
      setNumber: row.set_num,
      status: (row.minifig_sync_status as SyncStatus) ?? 'never_synced',
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
    return info.status !== 'ok' && info.status !== 'pending';
  });
}

// =============================================================================
// ADMIN/DEBUG UTILITIES
// =============================================================================

/**
 * Get current in-flight sync count.
 */
export function getInFlightSyncCount(): number {
  return inFlightSyncs.size;
}

/**
 * Get list of sets currently being synced.
 */
export function getInFlightSyncs(): string[] {
  return Array.from(inFlightSyncs.keys());
}

/**
 * Clear the recent completions cache (for testing).
 */
export function clearRecentCompletions(): void {
  recentSyncCompletions.clear();
}

