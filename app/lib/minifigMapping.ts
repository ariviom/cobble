import 'server-only';

import { getSupabaseServiceRoleClient } from '@/app/lib/supabaseServiceRoleClient';
import { processSetForMinifigMapping } from '@/scripts/minifig-mapping-core';

const globalMinifigIdCache = new Map<string, string | null>();

export function normalizeRebrickableFigId(figId: string): string {
  return figId.trim().toLowerCase();
}

export async function mapSetRebrickableFigsToBrickLink(
  setNumber: string,
  figIds: string[]
): Promise<Map<string, string | null>> {
  const supabase = getSupabaseServiceRoleClient();
  const cleanIds = figIds.map(normalizeRebrickableFigId).filter(Boolean);
  if (!cleanIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('bl_set_minifigs')
    .select('rb_fig_id,minifig_no')
    .eq('set_num', setNumber)
    .in('rb_fig_id', cleanIds);

  if (error) {
    console.error('[minifigMapping] failed to load set mappings', {
      setNumber,
      error: error.message,
    });
    return new Map();
  }

  const map = new Map<string, string | null>();
  for (const row of data ?? []) {
    if (!row.rb_fig_id) continue;
    map.set(normalizeRebrickableFigId(row.rb_fig_id), row.minifig_no ?? null);
  }
  return map;
}

/**
 * On-demand variant that will trigger a BrickLink sync for the given set
 * when we detect missing mappings, then re-read the per-set map.
 *
 * This avoids showing "Not mapped" for sets that simply haven't been synced yet.
 */
export async function mapSetRebrickableFigsToBrickLinkOnDemand(
  setNumber: string,
  figIds: string[]
): Promise<Map<string, string | null>> {
  const cleanIds = figIds.map(normalizeRebrickableFigId).filter(Boolean);
  if (!cleanIds.length) {
    return new Map();
  }

  const initial = await mapSetRebrickableFigsToBrickLink(setNumber, cleanIds);

  const missingIds = cleanIds.filter(
    id => !initial.has(normalizeRebrickableFigId(id))
  );
  if (!missingIds.length) {
    return initial;
  }

  const supabase = getSupabaseServiceRoleClient();

  // Avoid hammering BrickLink for sets that have already been successfully synced.
  const { data: blSet, error: blSetErr } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status')
    .eq('set_num', setNumber)
    .maybeSingle();

  if (blSetErr) {
    console.error('[minifigMapping] failed to read bl_sets for on-demand map', {
      setNumber,
      error: blSetErr.message,
    });
    return initial;
  }

  if (blSet?.minifig_sync_status === 'ok') {
    // Heuristics already ran for this set; don't re-call BrickLink on every request.
    return initial;
  }

  try {
    await processSetForMinifigMapping(
      supabase,
      setNumber,
      '[minifig-mapping:on-demand]'
    );
  } catch (err) {
    console.error('[minifigMapping] on-demand mapping failed', {
      setNumber,
      error: err instanceof Error ? err.message : String(err),
    });
    return initial;
  }

  // Re-read per-set mappings after the sync.
  const updated = await mapSetRebrickableFigsToBrickLink(setNumber, cleanIds);
  const merged = new Map(initial);
  for (const [id, blId] of updated.entries()) {
    merged.set(id, blId);
  }
  return merged;
}

export async function mapRebrickableFigToBrickLink(
  figId: string
): Promise<string | null> {
  const cacheKey = normalizeRebrickableFigId(figId);
  if (globalMinifigIdCache.has(cacheKey)) {
    return globalMinifigIdCache.get(cacheKey)!;
  }

  const supabase = getSupabaseServiceRoleClient();

  // 1) Check the explicit bricklink_minifig_mappings table first.
  const { data, error } = await supabase
    .from('bricklink_minifig_mappings')
    .select('bl_item_id')
    .eq('rb_fig_id', figId)
    .maybeSingle();

  if (error) {
    console.error('[minifigMapping] failed to load mapping', error);
  }

  if (data?.bl_item_id) {
    globalMinifigIdCache.set(cacheKey, data.bl_item_id);
    return data.bl_item_id;
  }

  // 2) Fallback: check bl_set_minifigs for any per-set mapping with this rb_fig_id.
  //    This catches minifigs from sets that were synced on-demand.
  try {
    const { data: setMinifig, error: setErr } = await supabase
      .from('bl_set_minifigs')
      .select('minifig_no')
      .eq('rb_fig_id', figId)
      .not('minifig_no', 'is', null)
      .limit(1)
      .maybeSingle();

    if (setErr) {
      console.error('[minifigMapping] bl_set_minifigs fallback failed', {
        figId,
        error: setErr.message,
      });
    } else if (setMinifig?.minifig_no) {
      globalMinifigIdCache.set(cacheKey, setMinifig.minifig_no);
      return setMinifig.minifig_no;
    }
  } catch (err) {
    console.error('[minifigMapping] bl_set_minifigs fallback error', {
      figId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  globalMinifigIdCache.set(cacheKey, null);
  return null;
}

/**
 * On-demand variant for a single minifig. If no BL mapping exists,
 * look up a set that contains this minifig and trigger the set's
 * on-demand sync, then return the newly-created mapping.
 */
export async function mapRebrickableFigToBrickLinkOnDemand(
  figId: string
): Promise<string | null> {
  // First try the regular lookup (checks cache + existing mappings).
  const existing = await mapRebrickableFigToBrickLink(figId);
  if (existing) {
    return existing;
  }

  const supabase = getSupabaseServiceRoleClient();

  // Find a set that contains this minifig via rb_inventory_minifigs.
  const { data: inventoryRow, error: invErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id')
    .eq('fig_num', figId)
    .limit(1)
    .maybeSingle();

  if (invErr || !inventoryRow?.inventory_id) {
    console.error('[minifigMapping] could not find inventory for fig', {
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
    console.error('[minifigMapping] could not find set for inventory', {
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

  // Trigger on-demand sync for this set.
  console.log('[minifigMapping] triggering on-demand sync for minifig', {
    figId,
    setNum,
  });

  try {
    await processSetForMinifigMapping(
      supabase,
      setNum,
      '[minifig-mapping:on-demand-fig]'
    );
  } catch (err) {
    console.error('[minifigMapping] on-demand fig sync failed', {
      figId,
      setNum,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // Clear the cache entry so we re-read from DB.
  const cacheKey = normalizeRebrickableFigId(figId);
  globalMinifigIdCache.delete(cacheKey);

  // Re-attempt lookup after sync.
  return mapRebrickableFigToBrickLink(figId);
}
