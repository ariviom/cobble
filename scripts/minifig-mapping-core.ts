import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';
import {
  getMinifigParts,
  getSetSubsets,
  ScriptBLMinifigPart,
} from './bricklink-script-client';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function createSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

export type BlMinifig = {
  minifigNo: string;
  name: string | null;
  quantity: number;
  imageUrl: string | null;
};

export type SetMappingResult = {
  processed: boolean;
  skipped: boolean;
  error: boolean;
  pairs: { rbFigId: string; blItemId: string }[];
};

/**
 * Process a single set: fetch BL minifigs, cache them, and create RB→BL mappings.
 * Returns { processed: true, pairs: [...] } if processed, { processed: false, skipped: true } if already synced, or { error: true } on errors.
 */
export async function processSetForMinifigMapping(
  supabase: SupabaseClient<Database>,
  setNum: string,
  logPrefix: string,
  force = false
): Promise<SetMappingResult> {
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
    return { processed: false, skipped: false, error: true, pairs: [] };
  }

  if (!force && blSet?.minifig_sync_status === 'ok') {
    // Skip already-synced sets unless force is enabled
    return { processed: false, skipped: true, error: false, pairs: [] };
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
    return { processed: false, skipped: false, error: true, pairs: [] };
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

  // Use BL minifigs directly for mapping (no need to re-fetch from DB)
  const blMinifigsForMapping: BlMinifig[] = blMinifigs;

  // Map RB minifigs in this set to BL minifigs by normalized name.
  const mappingResult = await createMinifigMappingsForSet(
    supabase,
    setNum,
    blMinifigsForMapping,
    logPrefix
  );

  if (mappingResult.count > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `${logPrefix} Mapped ${mappingResult.count} figs for set ${setNum}.`
    );

    const setLinkRows = mappingResult.pairs.map(({ rbFigId, blItemId }) => ({
      set_num: setNum,
      minifig_no: blItemId,
      rb_fig_id: rbFigId,
      last_refreshed_at: new Date().toISOString(),
    }));

    const { error: linkErr } = await supabase
      .from('bl_set_minifigs')
      .upsert(setLinkRows);

    if (linkErr) {
      // eslint-disable-next-line no-console
      console.error(
        `${logPrefix} Failed to store per-set RB links for`,
        setNum,
        linkErr.message
      );
    }
  }

  return {
    processed: true,
    skipped: false,
    error: false,
    pairs: mappingResult.pairs,
  };
}

type MappingResult = {
  count: number;
  pairs: { rbFigId: string; blItemId: string }[];
};

type RbCandidate = {
  fig_num: string;
  name: string;
  quantity: number;
};

type BlCandidate = {
  minifigNo: string;
  name: string;
  quantity: number;
};

/**
 * Create minifig mappings using simplified position-based matching.
 *
 * Strategy (simplified from previous 5-stage fuzzy matching):
 * 1. If RB count == BL count: pair by position (LEGO sets have consistent ordering)
 * 2. If counts differ: match by quantity first, then position for remaining
 *
 * This simpler approach works because LEGO sets have the same minifigs in both
 * data sources - the complex fuzzy matching was solving for edge cases that rarely matter.
 */
async function createMinifigMappingsForSet(
  supabase: SupabaseClient<Database>,
  setNum: string,
  blMinifigs: BlMinifig[],
  logPrefix: string
): Promise<MappingResult> {
  if (blMinifigs.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Load RB inventories for this set (ALL versions).
  const { data: inventories, error: invErr } = await supabase
    .from('rb_inventories')
    .select('id, version')
    .eq('set_num', setNum)
    .order('version', { ascending: true });

  if (invErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load RB inventories for set`,
      setNum,
      invErr.message
    );
    return { count: 0, pairs: [] };
  }

  const inventoryIds = (inventories ?? []).map(row => row.id);
  if (inventoryIds.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Load RB inventory minifigs.
  const { data: invMinifigs, error: invFigErr } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id,fig_num,quantity')
    .in('inventory_id', inventoryIds);

  if (invFigErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to load RB inventory minifigs for set`,
      setNum,
      invFigErr.message
    );
    return { count: 0, pairs: [] };
  }

  if (!invMinifigs || invMinifigs.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Aggregate quantities by fig_num (deduplicate across inventory versions)
  const figQuantityMap = new Map<string, number>();
  for (const row of invMinifigs) {
    const current = figQuantityMap.get(row.fig_num) ?? 0;
    figQuantityMap.set(row.fig_num, current + (row.quantity ?? 0));
  }

  const figNums = Array.from(figQuantityMap.keys());

  // Load RB minifig names for logging
  const { data: figs } = await supabase
    .from('rb_minifigs')
    .select('fig_num,name')
    .in('fig_num', figNums);

  const nameByFig = new Map<string, string>();
  for (const row of figs ?? []) {
    nameByFig.set(row.fig_num, row.name);
  }

  // Build RB and BL candidate lists
  const rbCandidates: RbCandidate[] = figNums.map(figNum => ({
    fig_num: figNum,
    name: nameByFig.get(figNum) ?? figNum,
    quantity: figQuantityMap.get(figNum) ?? 1,
  }));

  const blCandidates: BlCandidate[] = blMinifigs.map(bl => ({
    minifigNo: bl.minifigNo,
    name: bl.name ?? bl.minifigNo,
    quantity: bl.quantity,
  }));

  if (rbCandidates.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Simple position-based mapping
  const pairedIds: { rbFigId: string; blItemId: string }[] = [];
  const mappingRows: Database['public']['Tables']['bricklink_minifig_mappings']['Insert'][] =
    [];

  if (rbCandidates.length === blCandidates.length) {
    // Same count: pair by position (LEGO sets have consistent ordering)
    for (let i = 0; i < rbCandidates.length; i++) {
      const rb = rbCandidates[i]!;
      const bl = blCandidates[i]!;
      pairedIds.push({ rbFigId: rb.fig_num, blItemId: bl.minifigNo });
      mappingRows.push({
        rb_fig_id: rb.fig_num,
        bl_item_id: bl.minifigNo,
        confidence: 1.0,
        source: 'set:position-match',
      });
    }
  } else {
    // Different counts: match by quantity first, then by position for remaining
    const matchedRb = new Set<string>();
    const matchedBl = new Set<string>();

    // Group by quantity for matching
    const rbByQty = new Map<number, RbCandidate[]>();
    const blByQty = new Map<number, BlCandidate[]>();

    for (const rb of rbCandidates) {
      const list = rbByQty.get(rb.quantity) ?? [];
      list.push(rb);
      rbByQty.set(rb.quantity, list);
    }

    for (const bl of blCandidates) {
      const list = blByQty.get(bl.quantity) ?? [];
      list.push(bl);
      blByQty.set(bl.quantity, list);
    }

    // Match by unique quantities first
    for (const [qty, rbList] of rbByQty) {
      const blList = blByQty.get(qty) ?? [];
      if (rbList.length === 1 && blList.length === 1) {
        const rb = rbList[0]!;
        const bl = blList[0]!;
        pairedIds.push({ rbFigId: rb.fig_num, blItemId: bl.minifigNo });
        mappingRows.push({
          rb_fig_id: rb.fig_num,
          bl_item_id: bl.minifigNo,
          confidence: 0.95,
          source: 'set:quantity-match',
        });
        matchedRb.add(rb.fig_num);
        matchedBl.add(bl.minifigNo);
      }
    }

    // Remaining: pair by position
    const remainingRb = rbCandidates.filter(rb => !matchedRb.has(rb.fig_num));
    const remainingBl = blCandidates.filter(bl => !matchedBl.has(bl.minifigNo));

    const minLen = Math.min(remainingRb.length, remainingBl.length);
    for (let i = 0; i < minLen; i++) {
      const rb = remainingRb[i]!;
      const bl = remainingBl[i]!;
      pairedIds.push({ rbFigId: rb.fig_num, blItemId: bl.minifigNo });
      mappingRows.push({
        rb_fig_id: rb.fig_num,
        bl_item_id: bl.minifigNo,
        confidence: 0.8,
        source: 'set:position-fallback',
      });
    }

    // Log if we have unmatched figs (data mismatch between RB and BL)
    if (remainingRb.length !== remainingBl.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `${logPrefix} Count mismatch for set ${setNum}: RB=${rbCandidates.length}, BL=${blCandidates.length}`
      );
    }
  }

  if (mappingRows.length === 0) {
    return { count: 0, pairs: [] };
  }

  // Check for existing manually approved mappings - preserve them
  const rbFigIds = mappingRows.map(m => m.rb_fig_id);
  const { data: existingMappings } = await supabase
    .from('bricklink_minifig_mappings')
    .select('rb_fig_id, manually_approved')
    .in('rb_fig_id', rbFigIds);

  const manuallyApproved = new Set(
    (existingMappings || [])
      .filter(m => m.manually_approved === true)
      .map(m => m.rb_fig_id)
  );

  const mappingsToUpsert = mappingRows.filter(
    m => !manuallyApproved.has(m.rb_fig_id)
  );

  if (mappingsToUpsert.length === 0) {
    return { count: mappingRows.length, pairs: pairedIds };
  }

  const { error: mapErr } = await supabase
    .from('bricklink_minifig_mappings')
    .upsert(mappingsToUpsert, { onConflict: 'rb_fig_id' });

  if (mapErr) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to upsert fig mappings for set`,
      setNum,
      mapErr.message
    );
    return { count: 0, pairs: [] };
  }

  // eslint-disable-next-line no-console
  console.log(
    `${logPrefix} Mapped ${mappingRows.length} figs for set ${setNum} (position-based)`
  );

  return { count: mappingRows.length, pairs: pairedIds };
}

// =============================================================================
// MINIFIG COMPONENT PART MAPPING
// =============================================================================

type BlMinifigPartEntry = {
  bl_part_id: string;
  bl_color_id: number;
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
    name: p.item.name ?? null,
    quantity: p.quantity ?? 1,
  }));

  // Cache in bl_minifig_parts
  if (parts.length > 0) {
    const rows = parts.map(p => ({
      bl_minifig_no: blMinifigNo,
      bl_part_id: p.bl_part_id,
      bl_color_id: p.bl_color_id,
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

/**
 * Load RB minifig parts from the Rebrickable catalog (via Supabase).
 */
async function loadRbMinifigParts(
  supabase: SupabaseClient<Database>,
  rbFigId: string
): Promise<Array<{ part_num: string; color_id: number; quantity: number }>> {
  const { data, error } = await supabase
    .from('rb_minifig_parts')
    .select('part_num, color_id, quantity')
    .eq('fig_num', rbFigId);

  if (error || !data) {
    return [];
  }

  return data;
}

/**
 * Load cached BL minifig parts from Supabase.
 */
async function loadBlMinifigParts(
  supabase: SupabaseClient<Database>,
  blMinifigNo: string
): Promise<BlMinifigPartEntry[]> {
  const { data, error } = await supabase
    .from('bl_minifig_parts')
    .select('bl_part_id, bl_color_id, name, quantity')
    .eq('bl_minifig_no', blMinifigNo);

  if (error || !data) {
    return [];
  }

  return data;
}

// Minifig part categories for matching
type PartCategory =
  | 'head'
  | 'torso'
  | 'legs'
  | 'hips'
  | 'arms'
  | 'hands'
  | 'accessory'
  | 'other';

function categorizePartByName(name: string | null): PartCategory {
  if (!name) return 'other';
  const lower = name.toLowerCase();
  if (lower.includes('head') || lower.includes('face')) return 'head';
  if (lower.includes('torso') || lower.includes('body')) return 'torso';
  if (lower.includes('leg') && !lower.includes('hips')) return 'legs';
  if (lower.includes('hips')) return 'hips';
  if (lower.includes('arm')) return 'arms';
  if (lower.includes('hand')) return 'hands';
  return 'accessory';
}

/**
 * Map RB minifig parts to BL minifig parts by category and position.
 * Returns mappings to persist in part_id_mappings table.
 */
async function mapMinifigComponentParts(
  supabase: SupabaseClient<Database>,
  rbFigId: string,
  blMinifigNo: string,
  logPrefix: string
): Promise<number> {
  const rbParts = await loadRbMinifigParts(supabase, rbFigId);
  const blParts = await loadBlMinifigParts(supabase, blMinifigNo);

  if (rbParts.length === 0 || blParts.length === 0) {
    return 0;
  }

  // Group parts by category
  type CategorizedPart<T> = { part: T; category: PartCategory };

  // For RB parts, we need to fetch names from rb_parts
  const rbPartNums = rbParts.map(p => p.part_num);
  const { data: rbPartDetails } = await supabase
    .from('rb_parts')
    .select('part_num, name')
    .in('part_num', rbPartNums);

  const rbNameMap = new Map<string, string>();
  for (const p of rbPartDetails ?? []) {
    rbNameMap.set(p.part_num, p.name);
  }

  const categorizedRb: CategorizedPart<(typeof rbParts)[0]>[] = rbParts.map(
    p => ({
      part: p,
      category: categorizePartByName(rbNameMap.get(p.part_num) ?? null),
    })
  );

  const categorizedBl: CategorizedPart<BlMinifigPartEntry>[] = blParts.map(
    p => ({
      part: p,
      category: categorizePartByName(p.name),
    })
  );

  // Match parts by category
  const mappings: Array<{
    rb_part_id: string;
    bl_part_id: string;
    confidence: number;
  }> = [];
  const matchedBlParts = new Set<string>();

  // Group by category for matching
  const blByCategory = new Map<
    PartCategory,
    CategorizedPart<BlMinifigPartEntry>[]
  >();
  for (const bl of categorizedBl) {
    const list = blByCategory.get(bl.category) ?? [];
    list.push(bl);
    blByCategory.set(bl.category, list);
  }

  for (const rb of categorizedRb) {
    const candidates = blByCategory.get(rb.category) ?? [];
    const available = candidates.filter(
      c => !matchedBlParts.has(c.part.bl_part_id)
    );

    if (available.length === 0) continue;

    // Prefer color match
    let matched = available.find(c => c.part.bl_color_id === rb.part.color_id);

    // If no color match, take first available in category
    if (!matched && available.length === 1) {
      matched = available[0];
    }

    if (matched) {
      mappings.push({
        rb_part_id: rb.part.part_num,
        bl_part_id: matched.part.bl_part_id,
        confidence: matched.part.bl_color_id === rb.part.color_id ? 0.9 : 0.7,
      });
      matchedBlParts.add(matched.part.bl_part_id);
    }
  }

  if (mappings.length === 0) {
    return 0;
  }

  // Persist to part_id_mappings
  const rows = mappings.map(m => ({
    rb_part_id: m.rb_part_id,
    bl_part_id: m.bl_part_id,
    source: 'minifig-component',
    confidence: m.confidence,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('part_id_mappings')
    .upsert(rows, { onConflict: 'rb_part_id' });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      `${logPrefix} Failed to persist part mappings for ${rbFigId}→${blMinifigNo}`,
      error.message
    );
    return 0;
  }

  // eslint-disable-next-line no-console
  console.log(
    `${logPrefix} Mapped ${mappings.length} component parts for ${rbFigId}→${blMinifigNo}`
  );

  return mappings.length;
}

/**
 * Process minifig component part mappings for a list of RB↔BL minifig pairs.
 * This function respects rate limits by tracking API calls made.
 *
 * @param pairs - List of { rbFigId, blItemId } pairs from minifig mapping
 * @param maxApiCalls - Maximum number of BrickLink API calls to make (for rate limiting)
 * @returns Number of API calls made
 */
export async function processMinifigComponentMappings(
  supabase: SupabaseClient<Database>,
  pairs: Array<{ rbFigId: string; blItemId: string }>,
  maxApiCalls: number,
  logPrefix: string
): Promise<{ apiCallsMade: number; partsMapped: number }> {
  let apiCallsMade = 0;
  let partsMapped = 0;

  for (const { rbFigId, blItemId } of pairs) {
    if (apiCallsMade >= maxApiCalls) {
      // eslint-disable-next-line no-console
      console.log(
        `${logPrefix} Rate limit reached (${maxApiCalls} API calls), stopping component mapping`
      );
      break;
    }

    // Fetch BL minifig parts (makes 1 API call if not already cached)
    const blParts = await fetchAndCacheMinifigParts(
      supabase,
      blItemId,
      logPrefix
    );

    if (blParts !== null) {
      // Made an API call (wasn't already cached)
      apiCallsMade++;
    }

    // Map RB parts to BL parts (no API calls, uses cached data)
    const mapped = await mapMinifigComponentParts(
      supabase,
      rbFigId,
      blItemId,
      logPrefix
    );
    partsMapped += mapped;
  }

  return { apiCallsMade, partsMapped };
}
