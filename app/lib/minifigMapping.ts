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

  const { data, error } = await supabase
    .from('bricklink_minifig_mappings')
    .select('bl_item_id')
    .eq('rb_fig_id', figId)
    .maybeSingle();

  if (error) {
    console.error('[minifigMapping] failed to load mapping', error);
    globalMinifigIdCache.set(cacheKey, null);
    return null;
  }

  const blId = data?.bl_item_id ?? null;
  globalMinifigIdCache.set(cacheKey, blId);
  return blId;
}
