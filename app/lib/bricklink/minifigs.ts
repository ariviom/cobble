/**
 * Bricklink Minifig Data Access
 *
 * This module provides direct access to Bricklink minifig data stored in Supabase.
 * It replaces the old RB→BL mapping logic with direct BL table queries.
 *
 * Tables used:
 * - bl_set_minifigs: Minifigs per set (primary source)
 * - bricklink_minifigs: Full minifig catalog
 * - bl_minifig_parts: Minifig component parts
 * - bl_sets: Set sync status tracking
 */
import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';
import {
  triggerMinifigSync,
  isSyncInProgress,
  waitForSync,
} from '@/app/lib/sync/minifigSync';

// =============================================================================
// IMAGE URL HELPERS
// =============================================================================

/**
 * Construct a BrickLink minifig image URL from the minifig ID.
 * BrickLink minifig images follow the pattern: /ItemImage/MN/0/{minifig_no}.png
 */
export function getBlMinifigImageUrl(minifigNo: string): string {
  return `https://img.bricklink.com/ItemImage/MN/0/${encodeURIComponent(minifigNo)}.png`;
}

/**
 * Construct a BrickLink part image URL from the part ID and color ID.
 * BrickLink part images follow the pattern: /ItemImage/PN/{color_id}/{part_no}.png
 */
export function getBlPartImageUrl(partNo: string, colorId: number): string {
  return `https://img.bricklink.com/ItemImage/PN/${colorId}/${encodeURIComponent(partNo)}.png`;
}

// =============================================================================
// TYPES
// =============================================================================

export type BlSetMinifig = {
  minifigNo: string;
  name: string | null;
  quantity: number;
  imageUrl: string | null;
  rbFigId: string | null;
};

export type BlMinifigPart = {
  blPartId: string;
  blColorId: number;
  name: string | null;
  quantity: number;
};

export type SetMinifigResult = {
  minifigs: BlSetMinifig[];
  syncStatus: 'ok' | 'error' | 'pending' | null;
  syncTriggered: boolean;
};

// =============================================================================
// SET SYNC (delegates to minifigSync.ts for deduplication)
// =============================================================================

/**
 * Execute a sync for a set, deduplicating concurrent requests.
 * Returns true if sync completed successfully, false otherwise.
 *
 * Delegates to minifigSync.ts which is the single source of truth
 * for in-flight sync tracking. This prevents duplicate BrickLink
 * API calls when both this module and minifigSync.ts are used.
 */
async function executeSetSyncDeduplicated(setNumber: string): Promise<boolean> {
  // Check if already in progress (from any caller)
  if (isSyncInProgress(setNumber)) {
    logger.debug('bricklink.minifigs.join_existing_sync', { setNumber });
    return waitForSync(setNumber);
  }

  // Delegate to the canonical sync module (skip cooldown for self-healing)
  const result = await triggerMinifigSync(setNumber, { skipCooldown: true });
  return result.success;
}

// =============================================================================
// SET MINIFIGS (PRIMARY)
// =============================================================================

/**
 * Get BrickLink minifigs for a set directly from bl_set_minifigs.
 * Self-heals by triggering sync if data is missing.
 *
 * This is the primary entry point for minifig data. No RB→BL mapping needed.
 */
export async function getSetMinifigsBl(
  setNumber: string
): Promise<SetMinifigResult> {
  const supabase = getCatalogWriteClient();

  // Check sync status first
  const { data: blSet, error: setErr } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status')
    .eq('set_num', setNumber)
    .maybeSingle();

  if (setErr) {
    logger.error('bricklink.minifigs.get_sync_status_failed', {
      setNumber,
      error: setErr.message,
    });
  }

  const syncStatus =
    (blSet?.minifig_sync_status as 'ok' | 'error' | 'pending') ?? null;

  // Self-healing: trigger sync if not OK
  let syncTriggered = false;
  if (syncStatus !== 'ok') {
    logger.debug('bricklink.minifigs.triggering_self_heal', {
      setNumber,
      currentStatus: syncStatus,
    });
    syncTriggered = true;
    const success = await executeSetSyncDeduplicated(setNumber);
    if (!success) {
      return {
        minifigs: [],
        syncStatus: 'error',
        syncTriggered: true,
      };
    }
  }

  // Fetch minifigs from bl_set_minifigs (ordered for deterministic results)
  const { data: minifigs, error: minifigErr } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, name, quantity, image_url, rb_fig_id')
    .eq('set_num', setNumber)
    .order('minifig_no', { ascending: true });

  if (minifigErr) {
    logger.error('bricklink.minifigs.get_set_minifigs_failed', {
      setNumber,
      error: minifigErr.message,
    });
    return {
      minifigs: [],
      syncStatus: syncTriggered ? 'ok' : syncStatus,
      syncTriggered,
    };
  }

  const result: BlSetMinifig[] = (minifigs ?? []).map(m => ({
    minifigNo: m.minifig_no,
    name: m.name,
    quantity: m.quantity ?? 1,
    // Use stored image URL or construct from BrickLink pattern
    imageUrl: m.image_url ?? getBlMinifigImageUrl(m.minifig_no),
    rbFigId: m.rb_fig_id,
  }));

  return {
    minifigs: result,
    syncStatus: 'ok',
    syncTriggered,
  };
}

// =============================================================================
// MINIFIG PARTS
// =============================================================================

const inFlightPartsSyncs = new Map<string, Promise<boolean>>();

/**
 * Fetch and cache minifig parts from BrickLink API.
 * Returns true if sync succeeded, false otherwise.
 */
async function syncMinifigParts(blMinifigNo: string): Promise<boolean> {
  const existing = inFlightPartsSyncs.get(blMinifigNo);
  if (existing) {
    return existing;
  }

  const syncPromise = (async () => {
    const supabase = getCatalogWriteClient();

    // Check if already synced
    const { data: minifig } = await supabase
      .from('bricklink_minifigs')
      .select('parts_sync_status')
      .eq('item_id', blMinifigNo)
      .maybeSingle();

    if (minifig?.parts_sync_status === 'ok') {
      return true;
    }

    // Import dynamically to avoid circular dependencies
    const { fetchAndCacheMinifigParts } = await import(
      '@/scripts/minifig-mapping-core'
    );

    try {
      // This function returns parts if it made an API call, null if already synced
      const result = await fetchAndCacheMinifigParts(
        supabase as Parameters<typeof fetchAndCacheMinifigParts>[0],
        blMinifigNo,
        '[bricklink:parts:on-demand]'
      );
      return result !== null || minifig?.parts_sync_status === 'ok';
    } catch (err) {
      logger.error('bricklink.minifigs.sync_parts_failed', {
        blMinifigNo,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      inFlightPartsSyncs.delete(blMinifigNo);
    }
  })();

  inFlightPartsSyncs.set(blMinifigNo, syncPromise);
  return syncPromise;
}

/**
 * Get component parts for a BrickLink minifig.
 * Self-heals by triggering API fetch if data is missing.
 */
export async function getMinifigPartsBl(
  blMinifigNo: string
): Promise<BlMinifigPart[]> {
  const supabase = getCatalogWriteClient();

  // First try to get cached parts (ordered for deterministic results)
  const { data: parts, error: partsErr } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, name, quantity')
    .eq('bl_minifig_no', blMinifigNo)
    .order('bl_part_id', { ascending: true })
    .order('bl_color_id', { ascending: true });

  if (partsErr) {
    logger.error('bricklink.minifigs.get_parts_failed', {
      blMinifigNo,
      error: partsErr.message,
    });
    return [];
  }

  // If we have parts, return them
  if (parts && parts.length > 0) {
    return parts.map(p => ({
      blPartId: p.bl_part_id,
      blColorId: p.bl_color_id,
      name: p.name,
      quantity: p.quantity ?? 1,
    }));
  }

  // Self-heal: fetch parts from BrickLink API
  logger.debug('bricklink.minifigs.self_heal_parts', { blMinifigNo });
  const success = await syncMinifigParts(blMinifigNo);

  if (!success) {
    return [];
  }

  // Re-fetch after sync (ordered for deterministic results)
  const { data: newParts, error: newErr } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, name, quantity')
    .eq('bl_minifig_no', blMinifigNo)
    .order('bl_part_id', { ascending: true })
    .order('bl_color_id', { ascending: true });

  if (newErr) {
    logger.error('bricklink.minifigs.get_parts_after_sync_failed', {
      blMinifigNo,
      error: newErr.message,
    });
    return [];
  }

  return (newParts ?? []).map(p => ({
    blPartId: p.bl_part_id,
    blColorId: p.bl_color_id,
    name: p.name,
    quantity: p.quantity ?? 1,
  }));
}

// =============================================================================
// MINIFIG METADATA
// =============================================================================

export type BlMinifigMeta = {
  itemId: string;
  name: string;
  categoryId: number | null;
  itemYear: number | null;
};

/**
 * Get metadata for a BrickLink minifig from the catalog.
 */
export async function getMinifigMetaBl(
  blMinifigNo: string
): Promise<BlMinifigMeta | null> {
  const supabase = getCatalogWriteClient();

  const { data, error } = await supabase
    .from('bricklink_minifigs')
    .select('item_id, name, category_id, item_year')
    .eq('item_id', blMinifigNo)
    .maybeSingle();

  if (error) {
    logger.error('bricklink.minifigs.get_meta_failed', {
      blMinifigNo,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    itemId: data.item_id,
    name: data.name,
    categoryId: data.category_id,
    itemYear: data.item_year,
  };
}

// =============================================================================
// SELF-HEALING: FETCH FROM BRICKLINK API
// =============================================================================

export type FetchedMinifigMeta = {
  name: string | null;
  year: number | null;
};

/**
 * Fetch minifig metadata from BrickLink API and cache in bricklink_minifigs.
 * Used for self-healing when catalog doesn't have the minifig.
 */
export async function fetchMinifigMetaBl(
  minifigNo: string
): Promise<FetchedMinifigMeta | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { blGetMinifig } = await import('@/app/lib/bricklink');
    const response = await blGetMinifig(minifigNo);

    if (!response?.name) {
      logger.debug('bricklink.minifigs.fetch_meta_no_name', { minifigNo });
      return null;
    }

    // Cache in bricklink_minifigs for future lookups
    const supabase = getCatalogWriteClient();
    const { error: upsertErr } = await supabase
      .from('bricklink_minifigs')
      .upsert(
        {
          item_id: minifigNo,
          name: response.name,
          category_id: response.category_id ?? null,
          item_year: response.year_released ?? null,
        },
        { onConflict: 'item_id' }
      );

    if (upsertErr) {
      logger.warn('bricklink.minifigs.fetch_meta_cache_failed', {
        minifigNo,
        error: upsertErr.message,
      });
    } else {
      logger.debug('bricklink.minifigs.fetch_meta_cached', {
        minifigNo,
        name: response.name,
      });
    }

    return {
      name: response.name,
      year: response.year_released ?? null,
    };
  } catch (err) {
    logger.warn('bricklink.minifigs.fetch_meta_failed', {
      minifigNo,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Fetch metadata for multiple minifigs from BrickLink API, with rate limiting.
 * Returns map of minifig_no -> { name, year }
 *
 * Self-heals by caching results in bricklink_minifigs for future loads.
 */
export async function fetchMinifigMetaBatch(
  minifigNos: string[],
  maxCalls = 100
): Promise<Map<string, FetchedMinifigMeta>> {
  const results = new Map<string, FetchedMinifigMeta>();

  if (minifigNos.length === 0) {
    return results;
  }

  const toFetch = minifigNos.slice(0, maxCalls);

  logger.debug('bricklink.minifigs.batch_fetch_start', {
    total: minifigNos.length,
    fetching: toFetch.length,
    capped: minifigNos.length > maxCalls,
  });

  // Fetch in parallel
  const fetchResults = await Promise.allSettled(
    toFetch.map(async no => {
      const meta = await fetchMinifigMetaBl(no);
      return { no, meta };
    })
  );

  for (const result of fetchResults) {
    if (result.status === 'fulfilled' && result.value.meta) {
      results.set(result.value.no, result.value.meta);
    }
  }

  logger.debug('bricklink.minifigs.batch_fetch_complete', {
    requested: toFetch.length,
    succeeded: results.size,
  });

  return results;
}

// =============================================================================
// REVERSE LOOKUP (BL → RB, for inventory compatibility)
// =============================================================================

const blToRbCache = new Map<string, string | null>();

/**
 * Map a BrickLink minifig ID to a Rebrickable ID.
 * This is needed for inventory lookups that still use RB IDs.
 *
 * Checks:
 * 1. In-memory cache
 * 2. bl_set_minifigs.rb_fig_id
 * 3. bricklink_minifig_mappings table
 */
export async function mapBlToRbFigId(
  blMinifigNo: string
): Promise<string | null> {
  const cacheKey = blMinifigNo.toLowerCase();

  if (blToRbCache.has(cacheKey)) {
    return blToRbCache.get(cacheKey)!;
  }

  const supabase = getCatalogWriteClient();

  // Check bl_set_minifigs first (most common source)
  const { data: setMapping } = await supabase
    .from('bl_set_minifigs')
    .select('rb_fig_id')
    .eq('minifig_no', blMinifigNo)
    .not('rb_fig_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (setMapping?.rb_fig_id) {
    blToRbCache.set(cacheKey, setMapping.rb_fig_id);
    return setMapping.rb_fig_id;
  }

  // Fallback to explicit mappings table
  const { data: explicitMapping } = await supabase
    .from('bricklink_minifig_mappings')
    .select('rb_fig_id')
    .eq('bl_item_id', blMinifigNo)
    .maybeSingle();

  if (explicitMapping?.rb_fig_id) {
    blToRbCache.set(cacheKey, explicitMapping.rb_fig_id);
    return explicitMapping.rb_fig_id;
  }

  blToRbCache.set(cacheKey, null);
  return null;
}

// =============================================================================
// SET LOOKUP (BL-based replacement for RB API)
// =============================================================================

export type MinifigSetInfo = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  quantity: number;
};

// In-flight deduplication for minifig supersets API calls
const inFlightMinifigSupersets = new Map<string, Promise<MinifigSetInfo[]>>();

/**
 * Get sets containing a minifig using BrickLink data.
 * Self-heals by calling BrickLink API if no cached data exists.
 *
 * Flow:
 * 1. Check bl_set_minifigs cache for this minifig
 * 2. If empty, call BrickLink /items/MINIFIG/{no}/supersets API
 * 3. Cache results to bl_set_minifigs for future lookups
 * 4. Enrich with set details from rb_sets
 */
export async function getSetsForMinifigBl(
  blMinifigNo: string
): Promise<MinifigSetInfo[]> {
  const trimmed = blMinifigNo.trim();
  if (!trimmed) return [];

  // Check for in-flight request
  const inFlight = inFlightMinifigSupersets.get(trimmed.toLowerCase());
  if (inFlight) {
    logger.debug('bricklink.minifigs.supersets_join_inflight', {
      blMinifigNo: trimmed,
    });
    return inFlight;
  }

  const promise = getSetsForMinifigBlInternal(trimmed);
  inFlightMinifigSupersets.set(trimmed.toLowerCase(), promise);

  try {
    return await promise;
  } finally {
    inFlightMinifigSupersets.delete(trimmed.toLowerCase());
  }
}

async function getSetsForMinifigBlInternal(
  blMinifigNo: string
): Promise<MinifigSetInfo[]> {
  const supabase = getCatalogWriteClient();

  // Query bl_set_minifigs for sets containing this minifig
  const { data: setMinifigs, error: setErr } = await supabase
    .from('bl_set_minifigs')
    .select('set_num, quantity')
    .eq('minifig_no', blMinifigNo);

  if (setErr) {
    logger.error('bricklink.minifigs.get_sets_for_minifig_failed', {
      blMinifigNo,
      error: setErr.message,
    });
    return [];
  }

  // If no cached data, self-heal by calling BrickLink API
  if (!setMinifigs || setMinifigs.length === 0) {
    logger.debug('bricklink.minifigs.supersets_self_heal', { blMinifigNo });

    try {
      // Dynamic import to avoid circular dependency
      const { blGetMinifigSupersets } = await import('@/app/lib/bricklink');
      const supersets = await blGetMinifigSupersets(blMinifigNo);

      if (supersets.length > 0) {
        // Cache to bl_set_minifigs for future lookups
        const rows = supersets.map(s => ({
          set_num: s.setNumber,
          minifig_no: blMinifigNo,
          quantity: s.quantity,
          // Note: name and image_url are for the minifig, not the set
          // We leave them null here; they get populated when the set is synced
          name: null as string | null,
          image_url: null as string | null,
          last_refreshed_at: new Date().toISOString(),
        }));

        const { error: upsertErr } = await supabase
          .from('bl_set_minifigs')
          .upsert(rows, { onConflict: 'set_num,minifig_no' });

        if (upsertErr) {
          logger.warn('bricklink.minifigs.supersets_cache_failed', {
            blMinifigNo,
            error: upsertErr.message,
          });
        } else {
          logger.debug('bricklink.minifigs.supersets_cached', {
            blMinifigNo,
            count: supersets.length,
          });
        }

        // Return enriched results directly from API response
        return enrichSetsWithDetails(supabase, supersets);
      }

      // API returned empty - minifig might not exist or has no sets
      return [];
    } catch (err) {
      logger.error('bricklink.minifigs.supersets_api_failed', {
        blMinifigNo,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // Have cached data - enrich with set details
  return enrichSetsWithDetails(
    supabase,
    setMinifigs.map(s => ({
      setNumber: s.set_num,
      name: s.set_num, // Placeholder, will be enriched
      imageUrl: null,
      quantity: s.quantity ?? 1,
    }))
  );
}

/**
 * Enrich set results with details from rb_sets catalog.
 */
async function enrichSetsWithDetails(
  supabase: ReturnType<typeof getCatalogWriteClient>,
  sets: Array<{
    setNumber: string;
    quantity: number;
    name?: string;
    imageUrl?: string | null;
  }>
): Promise<MinifigSetInfo[]> {
  if (sets.length === 0) return [];

  const setNums = sets.map(s => s.setNumber);
  const { data: setDetails, error: detailErr } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, image_url')
    .in('set_num', setNums);

  if (detailErr) {
    logger.warn('bricklink.minifigs.get_set_details_failed', {
      error: detailErr.message,
    });
  }

  // Build lookup map for set details
  const detailsBySetNum = new Map<
    string,
    { name: string; year: number; image_url: string | null }
  >();
  for (const set of setDetails ?? []) {
    detailsBySetNum.set(set.set_num, {
      name: set.name,
      year: set.year ?? 0,
      image_url: set.image_url,
    });
  }

  // Map and enrich results
  const results: MinifigSetInfo[] = sets.map(s => {
    const details = detailsBySetNum.get(s.setNumber);
    return {
      setNumber: s.setNumber,
      name: details?.name ?? s.setNumber,
      year: details?.year ?? 0,
      imageUrl: details?.image_url ?? null,
      quantity: s.quantity ?? 1,
    };
  });

  // Sort: highest quantity first, then newest year
  results.sort((a, b) => {
    if (b.quantity !== a.quantity) return b.quantity - a.quantity;
    return b.year - a.year;
  });

  return results;
}
