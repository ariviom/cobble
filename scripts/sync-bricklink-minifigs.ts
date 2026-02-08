/**
 * BrickLink Minifig Sync — Daily Batch Script
 *
 * Pre-populates ALL BrickLink minifig data so runtime "enrichment" API calls
 * are never needed (except for brand-new sets from Rebrickable).
 *
 * Phase 1: Sync set → minifigs (1 BL API call per set)
 * Phase 2: Sync minifig → component parts (1 BL API call per minifig)
 *
 * Designed to run on a Raspberry Pi via cron, targeting production Supabase.
 *
 * Usage:
 *   npm run sync:bricklink-minifigs
 *   SYNC_BUDGET=10 npm run sync:bricklink-minifigs   # limit API calls (for testing)
 */
import { execSync } from 'child_process';

import dotenv from 'dotenv';

import {
  createSupabaseClient,
  fetchAndCacheMinifigParts,
  processSetForMinifigMapping,
} from './minifig-mapping-core';
import { buildBlToRbColorMap } from './color-mapping';

// Load environment variables with Next.js-style precedence
dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const DEFAULT_BUDGET = 2000;
const PAGE_SIZE = 1000;
const BATCH_SIZE = 500;
const ERROR_COOLDOWN_DAYS = 7;

function log(message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [sync-bricklink-minifigs] ${message}`, extra ?? '');
}

function logError(message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.error(`[${ts}] [sync-bricklink-minifigs] ${message}`, extra ?? '');
}

// =============================================================================
// STEP 0: Run Rebrickable ingestion
// =============================================================================

function runRebrickableIngestion() {
  log('Running Rebrickable ingestion...');
  try {
    execSync('npm run ingest:rebrickable', {
      stdio: 'inherit',
      timeout: 10 * 60 * 1000, // 10 minute timeout
    });
    log('Rebrickable ingestion complete.');
  } catch (err) {
    logError('Rebrickable ingestion failed (non-fatal, continuing)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// PHASE 1: Sync set → minifigs
// =============================================================================

async function phase1SyncSetMinifigs(budget: number): Promise<number> {
  const supabase = createSupabaseClient();
  let apiCallsUsed = 0;

  log('Phase 1: Finding sets with minifigs...');

  // Step 1: Collect unique set_nums that have minifigs via rb_inventory_minifigs → rb_inventories
  const setNums = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('rb_inventory_minifigs')
      .select('inventory_id')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      logError('Failed to query rb_inventory_minifigs', {
        error: error.message,
      });
      break;
    }
    if (!data || data.length === 0) break;

    // Look up set_nums for these inventory IDs
    const inventoryIds = [...new Set(data.map(r => r.inventory_id))];

    // Batch the inventory ID lookups
    for (let i = 0; i < inventoryIds.length; i += BATCH_SIZE) {
      const batch = inventoryIds.slice(i, i + BATCH_SIZE);
      const { data: invData, error: invError } = await supabase
        .from('rb_inventories')
        .select('set_num')
        .in('id', batch);

      if (invError) {
        logError('Failed to query rb_inventories', {
          error: invError.message,
        });
        continue;
      }
      for (const row of invData ?? []) {
        if (row.set_num) setNums.add(row.set_num);
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  log('Phase 1: Found sets with minifigs', { count: setNums.size });

  // Step 2: Filter out already-synced and recently-errored sets
  const allSetNums = [...setNums];
  const cooldownCutoff = new Date();
  cooldownCutoff.setDate(cooldownCutoff.getDate() - ERROR_COOLDOWN_DAYS);
  const cooldownIso = cooldownCutoff.toISOString();

  const needsSync: string[] = [];

  for (let i = 0; i < allSetNums.length; i += BATCH_SIZE) {
    const batch = allSetNums.slice(i, i + BATCH_SIZE);
    const { data: blData, error: blError } = await supabase
      .from('bl_sets')
      .select('set_num,minifig_sync_status,last_minifig_sync_at')
      .in('set_num', batch);

    if (blError) {
      logError('Failed to query bl_sets', { error: blError.message });
      // If we can't check, include the batch as needing sync
      needsSync.push(...batch);
      continue;
    }

    const statusMap = new Map((blData ?? []).map(r => [r.set_num, r]));

    for (const setNum of batch) {
      const existing = statusMap.get(setNum);
      if (!existing) {
        // Never synced
        needsSync.push(setNum);
      } else if (existing.minifig_sync_status === 'ok') {
        // Already synced successfully, skip
      } else if (
        existing.minifig_sync_status === 'error' &&
        existing.last_minifig_sync_at &&
        existing.last_minifig_sync_at > cooldownIso
      ) {
        // Error within cooldown, skip
      } else {
        // Error past cooldown or other status — retry
        needsSync.push(setNum);
      }
    }
  }

  log('Phase 1: Sets needing sync after filtering', {
    count: needsSync.length,
  });

  // Step 3: Sort newest-first by rb_sets.year
  // Fetch year for all sets needing sync
  const yearMap = new Map<string, number>();
  for (let i = 0; i < needsSync.length; i += BATCH_SIZE) {
    const batch = needsSync.slice(i, i + BATCH_SIZE);
    const { data: yearData, error: yearError } = await supabase
      .from('rb_sets')
      .select('set_num,year')
      .in('set_num', batch);

    if (yearError) {
      logError('Failed to query rb_sets for year', {
        error: yearError.message,
      });
      continue;
    }
    for (const row of yearData ?? []) {
      if (row.year != null) yearMap.set(row.set_num, row.year);
    }
  }

  needsSync.sort((a, b) => {
    const yearA = yearMap.get(a) ?? 0;
    const yearB = yearMap.get(b) ?? 0;
    return yearB - yearA; // newest first
  });

  // Step 4: Process sets up to budget
  for (const setNum of needsSync) {
    if (apiCallsUsed >= budget) break;

    const prefix = `[Phase1 ${apiCallsUsed + 1}/${budget}]`;
    const result = await processSetForMinifigMapping(supabase, setNum, prefix);

    if (result.processed || result.error) {
      apiCallsUsed++;
      if (result.processed) {
        log(`${prefix} Synced set ${setNum}`, {
          minifigs: result.minifigCount,
        });
      }
    }
  }

  log('Phase 1 complete', { apiCallsUsed, setsProcessed: apiCallsUsed });
  return apiCallsUsed;
}

// =============================================================================
// PHASE 2: Sync minifig → component parts
// =============================================================================

async function phase2SyncMinifigParts(budget: number): Promise<number> {
  if (budget <= 0) {
    log('Phase 2: No budget remaining, skipping.');
    return 0;
  }

  const supabase = createSupabaseClient();
  let apiCallsUsed = 0;

  log('Phase 2: Finding minifigs needing parts sync...', { budget });

  // Build BL→RB color map once for the entire phase
  const blToRbColorMap = await buildBlToRbColorMap(supabase);
  log('Phase 2: Loaded BL→RB color map', { entries: blToRbColorMap.size });

  const cooldownCutoff = new Date();
  cooldownCutoff.setDate(cooldownCutoff.getDate() - ERROR_COOLDOWN_DAYS);
  const cooldownIso = cooldownCutoff.toISOString();

  // We always query from offset 0 because processed items change status and
  // drop out of subsequent queries automatically.
  while (apiCallsUsed < budget) {
    // Find minifigs that need parts sync:
    // - parts_sync_status is null (never synced)
    // - parts_sync_status is 'error' AND last_parts_sync_at is old enough
    //
    // PostgREST doesn't support OR across different columns cleanly,
    // so we fetch null-status and old-errors separately.

    // Batch 1: Never synced (null status)
    const { data: nullData, error: nullError } = await supabase
      .from('bricklink_minifigs')
      .select('item_id')
      .is('parts_sync_status', null)
      .limit(PAGE_SIZE);

    if (nullError) {
      logError('Failed to query bricklink_minifigs (null status)', {
        error: nullError.message,
      });
      break;
    }

    // Batch 2: Error with expired cooldown
    const { data: errorData, error: errorError } = await supabase
      .from('bricklink_minifigs')
      .select('item_id')
      .eq('parts_sync_status', 'error')
      .lt('last_parts_sync_at', cooldownIso)
      .limit(PAGE_SIZE);

    if (errorError) {
      logError('Failed to query bricklink_minifigs (error status)', {
        error: errorError.message,
      });
      break;
    }

    const candidates = [
      ...(nullData ?? []).map(r => r.item_id),
      ...(errorData ?? []).map(r => r.item_id),
    ];

    // Deduplicate (shouldn't overlap, but just in case)
    const unique = [...new Set(candidates)];

    if (unique.length === 0) break;

    for (const minifigNo of unique) {
      if (apiCallsUsed >= budget) break;

      const prefix = `[Phase2 ${apiCallsUsed + 1}/${budget}]`;
      log(`${prefix} Syncing parts for ${minifigNo}`);

      const result = await fetchAndCacheMinifigParts(
        supabase,
        minifigNo,
        prefix,
        blToRbColorMap
      );

      // fetchAndCacheMinifigParts returns null if already synced (shouldn't happen
      // given our query, but handle gracefully) or on error. Both consume an API call
      // unless already synced.
      // Since we pre-filtered to only un-synced minifigs, every call = 1 API call.
      apiCallsUsed++;

      if (result) {
        log(`${prefix} Synced ${minifigNo}`, { parts: result.length });
      }
    }
  }

  log('Phase 2 complete', { apiCallsUsed });
  return apiCallsUsed;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const totalBudget =
    parseInt(process.env.SYNC_BUDGET ?? '', 10) || DEFAULT_BUDGET;
  log('Starting BrickLink minifig sync', { budget: totalBudget });

  // Step 0: Run Rebrickable ingestion first
  runRebrickableIngestion();

  // Phase 1: Set → minifigs
  const phase1Used = await phase1SyncSetMinifigs(totalBudget);

  // Phase 2: Minifig → component parts (remaining budget)
  const phase2Budget = totalBudget - phase1Used;
  const phase2Used = await phase2SyncMinifigParts(phase2Budget);

  const totalUsed = phase1Used + phase2Used;
  log('Sync complete', {
    phase1: phase1Used,
    phase2: phase2Used,
    total: totalUsed,
    budget: totalBudget,
  });
}

main().catch(err => {
  logError('Fatal error', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
