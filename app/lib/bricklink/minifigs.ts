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
