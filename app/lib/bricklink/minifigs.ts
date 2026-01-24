/**
 * BrickLink Minifig Data Access
 *
 * This module provides read-only access to BrickLink minifig data stored in Supabase.
 * It is a pure data access layer that:
 *
 * 1. Reads cached data from Supabase tables
 * 2. Delegates sync operations to minifigSync.ts (the orchestration layer)
 * 3. Provides image URL helpers
 *
 * Architecture:
 * - app/lib/sync/minifigSync.ts: Orchestration (when to sync, deduplication)
 * - scripts/minifig-mapping-core.ts: BrickLink API execution
 * - This module: Data access (reads from cache, delegates sync)
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
  triggerSetMinifigSync,
  triggerMinifigPartsSync,
  isSetSyncInProgress,
  isPartsSyncInProgress,
  waitForSetSync,
  waitForPartsSync,
  checkSetSyncStatus,
} from '@/app/lib/sync/minifigSync';

// =============================================================================
// IMAGE URL HELPERS
// =============================================================================

/**
 * Construct a BrickLink minifig image URL from the minifig ID.
 * BrickLink minifig images follow the pattern: /ItemImage/MN/0/{minifig_no}.png
 */
export function getBlMinifigImageUrl(blMinifigId: string): string {
  return `https://img.bricklink.com/ItemImage/MN/0/${encodeURIComponent(blMinifigId)}.png`;
}

/**
 * Construct a BrickLink part image URL from the part ID and color ID.
 * BrickLink part images follow the pattern: /ItemImage/PN/{color_id}/{part_no}.png
 */
export function getBlPartImageUrl(blPartId: string, blColorId: number): string {
  return `https://img.bricklink.com/ItemImage/PN/${blColorId}/${encodeURIComponent(blPartId)}.png`;
}

// =============================================================================
// TYPES
// =============================================================================

export type BlSetMinifig = {
  /** BrickLink minifig ID (e.g., "sw0001") */
  blMinifigId: string;
  name: string | null;
  quantity: number;
  imageUrl: string | null;
};

export type BlMinifigPart = {
  /** BrickLink part ID */
  blPartId: string;
  /** BrickLink color ID */
  blColorId: number;
  /** Color name from BrickLink */
  colorName: string | null;
  name: string | null;
  quantity: number;
};

export type SetMinifigResult = {
  minifigs: BlSetMinifig[];
  syncStatus: 'ok' | 'error' | 'never_synced' | null;
  syncTriggered: boolean;
};

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
  const syncInfo = await checkSetSyncStatus(setNumber);

  // Self-healing: trigger sync if not OK
  let syncTriggered = false;
  if (syncInfo.status !== 'ok') {
    logger.debug('bricklink.minifigs.triggering_self_heal', {
      setNumber,
      currentStatus: syncInfo.status,
    });
    syncTriggered = true;

    // If already in progress, wait for it
    if (isSetSyncInProgress(setNumber)) {
      await waitForSetSync(setNumber);
    } else {
      const result = await triggerSetMinifigSync(setNumber, {
        skipCooldown: true,
      });
      if (!result.success) {
        return {
          minifigs: [],
          syncStatus: 'error',
          syncTriggered: true,
        };
      }
    }
  }

  // Fetch minifigs from bl_set_minifigs (ordered for deterministic results)
  const { data: minifigs, error: minifigErr } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, name, quantity, image_url')
    .eq('set_num', setNumber)
    .order('minifig_no', { ascending: true });

  if (minifigErr) {
    logger.error('bricklink.minifigs.get_set_minifigs_failed', {
      setNumber,
      error: minifigErr.message,
    });
    return {
      minifigs: [],
      syncStatus: syncTriggered ? 'ok' : syncInfo.status,
      syncTriggered,
    };
  }

  const result: BlSetMinifig[] = (minifigs ?? []).map(m => ({
    blMinifigId: m.minifig_no,
    name: m.name,
    quantity: m.quantity ?? 1,
    // Use stored image URL or construct from BrickLink pattern
    imageUrl: m.image_url ?? getBlMinifigImageUrl(m.minifig_no),
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

/**
 * Get component parts for a BrickLink minifig.
 * Self-heals by triggering API fetch if data is missing.
 */
export async function getMinifigPartsBl(
  blMinifigId: string
): Promise<BlMinifigPart[]> {
  const supabase = getCatalogWriteClient();

  // First try to get cached parts (ordered for deterministic results)
  const { data: parts, error: partsErr } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, color_name, name, quantity')
    .eq('bl_minifig_no', blMinifigId)
    .order('bl_part_id', { ascending: true })
    .order('bl_color_id', { ascending: true });

  if (partsErr) {
    logger.error('bricklink.minifigs.get_parts_failed', {
      blMinifigId,
      error: partsErr.message,
    });
    return [];
  }

  // If we have parts, return them
  if (parts && parts.length > 0) {
    return parts.map(p => ({
      blPartId: p.bl_part_id,
      blColorId: p.bl_color_id,
      colorName: p.color_name,
      name: p.name,
      quantity: p.quantity ?? 1,
    }));
  }

  // Self-heal: trigger parts sync via orchestration layer
  logger.debug('bricklink.minifigs.self_heal_parts', { blMinifigId });

  // If already in progress, wait for it
  if (isPartsSyncInProgress(blMinifigId)) {
    await waitForPartsSync(blMinifigId);
  } else {
    const result = await triggerMinifigPartsSync(blMinifigId, {
      skipCooldown: true,
    });
    if (!result.success) {
      return [];
    }
  }

  // Re-fetch after sync (ordered for deterministic results)
  const { data: newParts, error: newErr } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, color_name, name, quantity')
    .eq('bl_minifig_no', blMinifigId)
    .order('bl_part_id', { ascending: true })
    .order('bl_color_id', { ascending: true });

  if (newErr) {
    logger.error('bricklink.minifigs.get_parts_after_sync_failed', {
      blMinifigId,
      error: newErr.message,
    });
    return [];
  }

  return (newParts ?? []).map(p => ({
    blPartId: p.bl_part_id,
    blColorId: p.bl_color_id,
    colorName: p.color_name,
    name: p.name,
    quantity: p.quantity ?? 1,
  }));
}

// =============================================================================
// MINIFIG METADATA
// =============================================================================

export type BlMinifigMeta = {
  /** BrickLink minifig ID */
  blMinifigId: string;
  name: string;
  categoryId: number | null;
  itemYear: number | null;
};

/**
 * Get metadata for a BrickLink minifig from the catalog.
 */
export async function getMinifigMetaBl(
  blMinifigId: string
): Promise<BlMinifigMeta | null> {
  const supabase = getCatalogWriteClient();

  const { data, error } = await supabase
    .from('bricklink_minifigs')
    .select('item_id, name, category_id, item_year')
    .eq('item_id', blMinifigId)
    .maybeSingle();

  if (error) {
    logger.error('bricklink.minifigs.get_meta_failed', {
      blMinifigId,
      error: error.message,
    });
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    blMinifigId: data.item_id,
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
  blMinifigId: string
): Promise<FetchedMinifigMeta | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { blGetMinifig } = await import('@/app/lib/bricklink');
    const response = await blGetMinifig(blMinifigId);

    if (!response?.name) {
      logger.debug('bricklink.minifigs.fetch_meta_no_name', { blMinifigId });
      return null;
    }

    // Cache in bricklink_minifigs for future lookups
    const supabase = getCatalogWriteClient();
    const { error: upsertErr } = await supabase
      .from('bricklink_minifigs')
      .upsert(
        {
          item_id: blMinifigId,
          name: response.name,
          category_id: response.category_id ?? null,
          item_year: response.year_released ?? null,
        },
        { onConflict: 'item_id' }
      );

    if (upsertErr) {
      logger.warn('bricklink.minifigs.fetch_meta_cache_failed', {
        blMinifigId,
        error: upsertErr.message,
      });
    } else {
      logger.debug('bricklink.minifigs.fetch_meta_cached', {
        blMinifigId,
        name: response.name,
      });
    }

    return {
      name: response.name,
      year: response.year_released ?? null,
    };
  } catch (err) {
    logger.warn('bricklink.minifigs.fetch_meta_failed', {
      blMinifigId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Fetch metadata for multiple minifigs from BrickLink API, with rate limiting.
 * Returns map of blMinifigId -> { name, year }
 *
 * Self-heals by caching results in bricklink_minifigs for future loads.
 */
export async function fetchMinifigMetaBatch(
  blMinifigIds: string[],
  maxCalls = 100
): Promise<Map<string, FetchedMinifigMeta>> {
  const results = new Map<string, FetchedMinifigMeta>();

  if (blMinifigIds.length === 0) {
    return results;
  }

  const toFetch = blMinifigIds.slice(0, maxCalls);

  logger.debug('bricklink.minifigs.batch_fetch_start', {
    total: blMinifigIds.length,
    fetching: toFetch.length,
    capped: blMinifigIds.length > maxCalls,
  });

  // Fetch in parallel
  const fetchResults = await Promise.allSettled(
    toFetch.map(async blMinifigId => {
      const meta = await fetchMinifigMetaBl(blMinifigId);
      return { blMinifigId, meta };
    })
  );

  for (const result of fetchResults) {
    if (result.status === 'fulfilled' && result.value.meta) {
      results.set(result.value.blMinifigId, result.value.meta);
    }
  }

  logger.debug('bricklink.minifigs.batch_fetch_complete', {
    requested: toFetch.length,
    succeeded: results.size,
  });

  return results;
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
  blMinifigId: string
): Promise<MinifigSetInfo[]> {
  const trimmed = blMinifigId.trim();
  if (!trimmed) return [];

  // Check for in-flight request
  const inFlight = inFlightMinifigSupersets.get(trimmed.toLowerCase());
  if (inFlight) {
    logger.debug('bricklink.minifigs.supersets_join_inflight', {
      blMinifigId: trimmed,
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
  blMinifigId: string
): Promise<MinifigSetInfo[]> {
  const supabase = getCatalogWriteClient();

  // Query bl_set_minifigs for sets containing this minifig
  const { data: setMinifigs, error: setErr } = await supabase
    .from('bl_set_minifigs')
    .select('set_num, quantity')
    .eq('minifig_no', blMinifigId);

  if (setErr) {
    logger.error('bricklink.minifigs.get_sets_for_minifig_failed', {
      blMinifigId,
      error: setErr.message,
    });
    return [];
  }

  // If no cached data, self-heal by calling BrickLink API
  if (!setMinifigs || setMinifigs.length === 0) {
    logger.debug('bricklink.minifigs.supersets_self_heal', { blMinifigId });

    try {
      // Dynamic import to avoid circular dependency
      const { blGetMinifigSupersets } = await import('@/app/lib/bricklink');
      const supersets = await blGetMinifigSupersets(blMinifigId);

      if (supersets.length > 0) {
        // Cache to bl_set_minifigs for future lookups
        const rows = supersets.map(s => ({
          set_num: s.setNumber,
          minifig_no: blMinifigId,
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
            blMinifigId,
            error: upsertErr.message,
          });
        } else {
          logger.debug('bricklink.minifigs.supersets_cached', {
            blMinifigId,
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
        blMinifigId,
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

// =============================================================================
// LEGACY API COMPATIBILITY
// =============================================================================

// Re-export with old property names for backwards compatibility in inventory.ts
export type LegacyBlSetMinifig = {
  /** @deprecated Use blMinifigId instead */
  minifigNo: string;
  name: string | null;
  quantity: number;
  imageUrl: string | null;
};

/**
 * Convert new type to legacy type for backwards compatibility.
 */
export function toLegacyBlSetMinifig(
  minifig: BlSetMinifig
): LegacyBlSetMinifig {
  return {
    minifigNo: minifig.blMinifigId,
    name: minifig.name,
    quantity: minifig.quantity,
    imageUrl: minifig.imageUrl,
  };
}
