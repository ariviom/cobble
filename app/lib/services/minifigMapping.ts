import 'server-only';

import { blGetMinifigSupersets } from '@/app/lib/bricklink';
import { findRbMinifig } from '@/app/lib/catalog/minifigs';
import {
  getCatalogReadClient,
  getCatalogWriteClient,
} from '@/app/lib/db/catalogAccess';
import { dedup } from '@/app/lib/utils/dedup';
import { logger } from '@/lib/metrics';

/**
 * Self-healing minifig ID resolution.
 *
 * Given a BrickLink minifig ID (e.g., "bdp147"), attempts to find or create
 * the mapping to an RB fig_num in rb_minifigs.
 *
 * Tiered resolution:
 *  - Tier 0: Direct catalog lookup (findRbMinifig — already done by caller,
 *            but we re-check to handle concurrent resolution)
 *  - Tier 1: Cross-reference bl_set_minifigs → rb_inventories →
 *            rb_inventory_minifigs to find candidate fig_nums by process of
 *            elimination within shared sets.
 *  - Tier 2: BrickLink API supersets call to discover containing sets, then
 *            same matching logic as Tier 1.
 *
 * On success: persists the mapping via UPDATE rb_minifigs SET bl_minifig_id.
 * Returns the resolved fig_num, or null if unresolvable.
 */
export function resolveBlMinifigId(
  blMinifigId: string
): Promise<string | null> {
  return dedup(`resolve-minifig:${blMinifigId}`, () =>
    resolveBlMinifigIdImpl(blMinifigId)
  );
}

async function resolveBlMinifigIdImpl(
  blMinifigId: string
): Promise<string | null> {
  // Tier 0: Direct catalog lookup
  const existing = await findRbMinifig(blMinifigId);
  if (existing) return existing.fig_num;

  // Tier 1: Cross-reference via bl_set_minifigs (no API call)
  const tier1Result = await matchViaSetMinifigs(blMinifigId);
  if (tier1Result) {
    await persistMapping(blMinifigId, tier1Result);
    return tier1Result;
  }

  // Tier 2: BrickLink API supersets → same matching
  try {
    const supersets = await blGetMinifigSupersets(blMinifigId);
    if (supersets.length > 0) {
      const setNums = supersets.map(s => s.setNumber);
      const reader = getCatalogReadClient();
      const tier2Result = await matchViaRbInventories(reader, setNums);
      if (tier2Result) {
        await persistMapping(blMinifigId, tier2Result);
        return tier2Result;
      }
    }
  } catch (err) {
    logger.warn('minifig_mapping.tier2_failed', {
      blMinifigId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Tier 1: Find sets containing this BL minifig via bl_set_minifigs,
 * then cross-reference with rb_inventory_minifigs to find candidate fig_nums.
 */
async function matchViaSetMinifigs(
  blMinifigId: string
): Promise<string | null> {
  const writer = getCatalogWriteClient();

  const { data: blSets } = await writer
    .from('bl_set_minifigs')
    .select('set_num')
    .eq('minifig_no', blMinifigId);

  if (!blSets?.length) return null;

  const setNums = blSets.map(s => s.set_num);
  return matchViaRbInventories(writer, setNums);
}

/**
 * Given a list of set_nums that contain the BL minifig, find the RB fig_num
 * by process of elimination: for each set, find the RB inventory minifigs
 * that don't already have a bl_minifig_id mapping. If exactly one unmapped
 * fig_num remains, that's our match.
 */
async function matchViaRbInventories(
  supabase: ReturnType<typeof getCatalogReadClient>,
  setNums: string[]
): Promise<string | null> {
  if (setNums.length === 0) return null;

  // Get RB inventories for these sets
  const { data: inventories } = await supabase
    .from('rb_inventories')
    .select('id, set_num')
    .in('set_num', setNums.slice(0, 200))
    .not('set_num', 'like', 'fig-%');

  if (!inventories?.length) return null;

  const invIds = inventories.map(inv => inv.id);

  // Get all minifigs in these inventories
  const { data: invMinifigs } = await supabase
    .from('rb_inventory_minifigs')
    .select('fig_num, inventory_id')
    .in('inventory_id', invIds);

  if (!invMinifigs?.length) return null;

  // Get unique fig_nums
  const candidateFigNums = [...new Set(invMinifigs.map(im => im.fig_num))];

  // Look up which already have bl_minifig_id mappings
  const { data: rbMinifigs } = await supabase
    .from('rb_minifigs')
    .select('fig_num, bl_minifig_id')
    .in('fig_num', candidateFigNums);

  // Find fig_nums that don't already have a BL mapping
  const unmapped = (rbMinifigs ?? []).filter(m => !m.bl_minifig_id);

  if (unmapped.length === 1) {
    return unmapped[0]!.fig_num;
  }

  // If multiple unmapped, try narrowing by checking which sets contain
  // this specific minifig via bl_set_minifigs, and cross-referencing
  // the inventory_id → set_num → which fig_nums appear in those specific sets.
  // This handles cases where multiple unmapped figs exist across different sets
  // but only one appears in the same sets as our target.
  if (unmapped.length > 1) {
    const unmappedSet = new Set(unmapped.map(m => m.fig_num));

    // For each set, find which unmapped fig_nums appear in it
    const invToSetNum = new Map<number, string>();
    for (const inv of inventories) {
      if (typeof inv.set_num === 'string') {
        invToSetNum.set(inv.id, inv.set_num);
      }
    }

    // Count how many of our target sets each unmapped fig_num appears in
    const figNumSetCount = new Map<string, number>();
    for (const im of invMinifigs) {
      if (!unmappedSet.has(im.fig_num)) continue;
      const setNum = invToSetNum.get(im.inventory_id);
      if (setNum) {
        figNumSetCount.set(
          im.fig_num,
          (figNumSetCount.get(im.fig_num) ?? 0) + 1
        );
      }
    }

    // If exactly one unmapped fig appears in ALL target sets, it's our match
    const maxCount = Math.max(...figNumSetCount.values());
    const bestMatches = [...figNumSetCount.entries()].filter(
      ([, count]) => count === maxCount
    );
    if (bestMatches.length === 1) {
      return bestMatches[0]![0];
    }
  }

  return null;
}

async function persistMapping(
  blMinifigId: string,
  figNum: string
): Promise<void> {
  try {
    const writer = getCatalogWriteClient();
    const { error } = await writer
      .from('rb_minifigs')
      .update({ bl_minifig_id: blMinifigId })
      .eq('fig_num', figNum);

    if (error) {
      logger.warn('minifig_mapping.persist_failed', {
        blMinifigId,
        figNum,
        error: error.message,
      });
    } else {
      logger.info('minifig_mapping.resolved', { blMinifigId, figNum });
    }
  } catch (err) {
    logger.warn('minifig_mapping.persist_error', {
      blMinifigId,
      figNum,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
