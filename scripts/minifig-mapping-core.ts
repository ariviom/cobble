/**
 * BrickLink Minifig Sync Core
 *
 * This module handles syncing BrickLink minifig data to Supabase.
 * BrickLink is the exclusive source of truth for minifig IDs.
 *
 * No RB↔BL mapping is performed - mappings were heuristic-based and unreliable.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';
import {
  getMinifigParts,
  getSetSubsets,
  ScriptBLMinifigPart,
} from './bricklink-script-client';

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

// =============================================================================
// TYPES
// =============================================================================

export type BlMinifig = {
  minifigNo: string;
  name: string | null;
  quantity: number;
  imageUrl: string | null;
};

export type SetSyncResult = {
  processed: boolean;
  skipped: boolean;
  error: boolean;
  minifigCount: number;
};

// =============================================================================
// SET MINIFIG SYNC
// =============================================================================

/**
 * Sync BrickLink minifigs for a single set.
 *
 * Fetches minifigs from BrickLink API and caches them in:
 * - bl_set_minifigs: Minifigs per set
 * - bricklink_minifigs: Minifig catalog (names)
 *
 * Returns { processed: true } if synced, { skipped: true } if already synced,
 * or { error: true } on errors.
 */
export async function processSetForMinifigMapping(
  supabase: SupabaseClient<Database>,
  setNum: string,
  logPrefix: string,
  force = false
): Promise<SetSyncResult> {
  // Check if we already have a successful sync for this set.
  const { data: blSet, error: blSetErr } = await supabase
    .from('bl_sets')
    .select('minifig_sync_status,last_minifig_sync_at')
    .eq('set_num', setNum)
    .maybeSingle();

  if (blSetErr) {
    // eslint-disable-next-line no-console
    console.error(`${logPrefix} Failed to read bl_sets for`, {
      setNum,
      error: blSetErr.message,
    });
    return { processed: false, skipped: false, error: true, minifigCount: 0 };
  }

  if (!force && blSet?.minifig_sync_status === 'ok') {
    // Skip already-synced sets unless force is enabled
    return { processed: false, skipped: true, error: false, minifigCount: 0 };
  }

  // Fetch BrickLink set subsets (minifigs).
  let blMinifigs: BlMinifig[] = [];
  try {
    const subsets = await getSetSubsets(setNum);
    blMinifigs = subsets
      .filter(entry => entry.item?.type === 'MINIFIG')
      .map(entry => ({
        minifigNo: entry.item.no,
        name: entry.item.name ?? null,
        quantity:
          typeof entry.quantity === 'number' && entry.quantity > 0
            ? entry.quantity
            : 1,
        imageUrl: entry.item.image_url ?? null,
      }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to fetch BL subsets for set`,
      setNum,
      err
    );
    await supabase.from('bl_sets').upsert({
      set_num: setNum,
      minifig_sync_status: 'error',
      last_error:
        err instanceof Error ? err.message : String(err ?? 'unknown error'),
      last_minifig_sync_at: new Date().toISOString(),
    });
    return { processed: false, skipped: false, error: true, minifigCount: 0 };
  }

  // Upsert BL set sync status.
  await supabase.from('bl_sets').upsert(
    {
      set_num: setNum,
      minifig_sync_status: 'ok',
      last_minifig_sync_at: new Date().toISOString(),
    },
    { onConflict: 'set_num' }
  );

  // Cache BL set minifigs.
  if (blMinifigs.length > 0) {
    const blSetRows = blMinifigs.map(m => ({
      set_num: setNum,
      minifig_no: m.minifigNo,
      name: m.name,
      quantity: m.quantity,
      image_url: m.imageUrl,
      last_refreshed_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('bl_set_minifigs')
      .upsert(blSetRows);
    if (upsertErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to upsert bl_set_minifigs for`,
        setNum,
        upsertErr.message
      );
    }

    // Self-heal: populate bricklink_minifigs catalog with names
    // This ensures minifig names are available for immediate lookup
    const catalogRows = blMinifigs
      .filter(m => m.name) // Only insert if we have a name
      .map(m => ({
        item_id: m.minifigNo,
        name: m.name!,
      }));

    if (catalogRows.length > 0) {
      const { error: catalogErr } = await supabase
        .from('bricklink_minifigs')
        .upsert(catalogRows, { onConflict: 'item_id', ignoreDuplicates: true });
      if (catalogErr) {
        // eslint-disable-next-line no-console
        console.error(
          `${logPrefix} Failed to upsert bricklink_minifigs for`,
          setNum,
          catalogErr.message
        );
      }
    }
  }

  return {
    processed: true,
    skipped: false,
    error: false,
    minifigCount: blMinifigs.length,
  };
}

// =============================================================================
// MINIFIG COMPONENT PARTS SYNC
// =============================================================================

type BlMinifigPartEntry = {
  bl_part_id: string;
  bl_color_id: number;
  color_name: string | null;
  name: string | null;
  quantity: number;
};

/**
 * Check if a BL minifig has had its component parts synced.
 */
async function isMinifigPartsSynced(
  supabase: SupabaseClient<Database>,
  blMinifigNo: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('bricklink_minifigs')
    .select('parts_sync_status')
    .eq('item_id', blMinifigNo)
    .maybeSingle();

  if (error) {
    return false;
  }

  return data?.parts_sync_status === 'ok';
}

/**
 * Fetch and cache BL minifig component parts.
 * Returns the list of parts, or null if already synced or on error.
 */
export async function fetchAndCacheMinifigParts(
  supabase: SupabaseClient<Database>,
  blMinifigNo: string,
  logPrefix: string
): Promise<BlMinifigPartEntry[] | null> {
  // Check if already synced
  if (await isMinifigPartsSynced(supabase, blMinifigNo)) {
    return null; // Already synced, skip API call
  }

  let blParts: ScriptBLMinifigPart[] = [];
  try {
    blParts = await getMinifigParts(blMinifigNo);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to fetch BL parts for minifig`,
      blMinifigNo,
      err
    );
    // Mark as error so we don't retry indefinitely
    await supabase.from('bricklink_minifigs').upsert(
      {
        item_id: blMinifigNo,
        name: blMinifigNo, // Placeholder name
        parts_sync_status: 'error',
        last_parts_sync_at: new Date().toISOString(),
      },
      { onConflict: 'item_id' }
    );
    return null;
  }

  const parts: BlMinifigPartEntry[] = blParts.map(p => ({
    bl_part_id: p.item.no,
    bl_color_id: p.color_id ?? 0,
    color_name: p.color_name ?? null,
    name: p.item.name ?? null,
    quantity: p.quantity ?? 1,
  }));

  // Cache in bl_minifig_parts
  if (parts.length > 0) {
    const rows = parts.map(p => ({
      bl_minifig_no: blMinifigNo,
      bl_part_id: p.bl_part_id,
      bl_color_id: p.bl_color_id,
      color_name: p.color_name,
      name: p.name,
      quantity: p.quantity,
      last_refreshed_at: new Date().toISOString(),
    }));

    const { error: upsertErr } = await supabase
      .from('bl_minifig_parts')
      .upsert(rows);

    if (upsertErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to cache bl_minifig_parts for`,
        blMinifigNo,
        upsertErr.message
      );
    }
  }

  // Update sync status
  await supabase.from('bricklink_minifigs').upsert(
    {
      item_id: blMinifigNo,
      name: blMinifigNo, // Placeholder name, will be overwritten if entry exists
      parts_sync_status: 'ok',
      last_parts_sync_at: new Date().toISOString(),
    },
    { onConflict: 'item_id' }
  );

  return parts;
}
