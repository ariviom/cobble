import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { loadUserMinifigSyncPreferences } from '@/app/lib/userMinifigSyncPreferences';
import { logger } from '@/lib/metrics';
import type { Database, Enums, Tables } from '@/supabase/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MinifigSyncResult = {
  updated: number;
  listItemsSynced: number;
};

export type MinifigSyncOptions = {
  /** When true, run the sync even if the user's preference has it disabled. */
  force: boolean;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 200;

/**
 * Given a set of set_nums, resolve which sets to include based on sync scope.
 * Mutates `setNumsSet` in place for the 'collection' scope by adding list items.
 */
async function resolveSetScope(
  supabase: SupabaseClient<Database>,
  userId: string,
  syncScope: 'collection' | 'owned',
  setNumsSet: Set<string>
): Promise<void> {
  if (syncScope !== 'collection') return;

  const { data: listItems, error: listError } = await supabase
    .from('user_list_items')
    .select('set_num')
    .eq('user_id', userId)
    .eq('item_type', 'set')
    .not('set_num', 'is', null);

  if (listError) {
    logger.warn('user_minifigs.sync_from_sets.list_items_query_failed', {
      userId,
      error: listError.message,
    });
    // Continue with just owned sets — don't fail the whole sync
    return;
  }

  for (const row of listItems ?? []) {
    if (row.set_num) setNumsSet.add(row.set_num);
  }
}

/**
 * Query the catalog for the latest inventory version per set and return
 * the inventory IDs and a reverse map (inventory_id -> set_num).
 */
async function fetchLatestInventories(
  catalogClient: SupabaseClient<Database>,
  userId: string,
  setNums: string[]
): Promise<{
  invIds: number[];
  latestBySet: Map<string, { id: number; version: number }>;
} | null> {
  const { data: inventories, error: invError } = await catalogClient
    .from('rb_inventories')
    .select('id, set_num, version')
    .in('set_num', setNums)
    .not('set_num', 'like', 'fig-%');

  if (invError) {
    logger.error('user_minifigs.sync_from_sets.inventories_failed', {
      userId,
      error: invError.message,
    });
    return null;
  }

  if (!inventories || inventories.length === 0) {
    return { invIds: [], latestBySet: new Map() };
  }

  // Keep only the latest inventory version per set_num to avoid
  // double-counting minifigs across multiple versions.
  const latestBySet = new Map<string, { id: number; version: number }>();
  for (const inv of inventories) {
    if (!inv.set_num) continue;
    const prev = latestBySet.get(inv.set_num);
    if (!prev || (inv.version ?? -1) > (prev.version ?? -1)) {
      latestBySet.set(inv.set_num, {
        id: inv.id,
        version: inv.version ?? -1,
      });
    }
  }

  const invIds = [...latestBySet.values()].map(v => v.id);
  return { invIds, latestBySet };
}

/**
 * Compute per-minifig owned quantities from inventory minifig rows.
 *
 * Returns the contributions map and the fig→BL ID mapping, or null on error.
 */
async function computeMinifigContributions(
  catalogClient: SupabaseClient<Database>,
  userId: string,
  invIds: number[]
): Promise<{
  contributions: Map<string, { owned: number }>;
  figToBlId: Map<string, string>;
  invMinifigs: Array<{
    inventory_id: number;
    fig_num: string;
    quantity: number | null;
  }>;
} | null> {
  // Get all minifigs for these inventories
  const { data: invMinifigs, error: imError } = await catalogClient
    .from('rb_inventory_minifigs')
    .select('inventory_id, fig_num, quantity')
    .in('inventory_id', invIds);

  if (imError) {
    logger.error('user_minifigs.sync_from_sets.inventory_minifigs_failed', {
      userId,
      error: imError.message,
    });
    return null;
  }

  // Map fig_num to BL minifig ID
  const figNums = [...new Set((invMinifigs ?? []).map(im => im.fig_num))];

  if (figNums.length === 0) {
    return { contributions: new Map(), figToBlId: new Map(), invMinifigs: [] };
  }

  const { data: rbMinifigs } = await catalogClient
    .from('rb_minifigs')
    .select('fig_num, bl_minifig_id')
    .in('fig_num', figNums);

  const figToBlId = new Map<string, string>();
  for (const m of rbMinifigs ?? []) {
    figToBlId.set(m.fig_num, m.bl_minifig_id ?? m.fig_num);
  }

  // Track minifig contributions
  // Map: bl_minifig_no -> { owned: number }
  const contributions = new Map<string, { owned: number }>();

  for (const im of invMinifigs ?? []) {
    const blMinifigNo = figToBlId.get(im.fig_num) ?? im.fig_num;
    const entry = contributions.get(blMinifigNo) ?? { owned: 0 };
    entry.owned += im.quantity ?? 1;
    contributions.set(blMinifigNo, entry);
  }

  return {
    contributions,
    figToBlId,
    invMinifigs: (invMinifigs ?? []) as Array<{
      inventory_id: number;
      fig_num: string;
      quantity: number | null;
    }>,
  };
}

/**
 * Merge computed owned quantities with existing user_minifigs rows and upsert.
 *
 * Returns the number of rows upserted, or null on error.
 */
async function mergeAndUpsertMinifigs(
  supabase: SupabaseClient<Database>,
  userId: string,
  contributions: Map<string, { owned: number }>
): Promise<number | null> {
  if (contributions.size === 0) return 0;

  // Get existing user minifigs
  const { data: existingRows, error: existingError } = await supabase
    .from('user_minifigs')
    .select<'fig_num,status,quantity'>('fig_num,status,quantity')
    .eq('user_id', userId);

  if (existingError) {
    logger.error('user_minifigs.sync_from_sets.load_user_minifigs_failed', {
      userId,
      error: existingError.message,
    });
    return null;
  }

  const existingMap = new Map<
    string,
    { status: Enums<'set_status'>; quantity: number | null }
  >();
  for (const row of existingRows ?? []) {
    existingMap.set(row.fig_num, {
      status: row.status as Enums<'set_status'>,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity)
          ? row.quantity
          : null,
    });
  }

  // Build upsert rows. Omit created_at entirely — the DB default (now())
  // handles new rows, and ON CONFLICT UPDATE won't touch it for existing rows.
  // Including created_at in only some rows causes PostgREST to send null for
  // the missing ones, which violates the NOT NULL constraint.
  const upserts: Array<
    Omit<Tables<'user_minifigs'>, 'created_at'> & { updated_at: string }
  > = [];

  for (const [blMinifigNo, counts] of contributions.entries()) {
    const existing = existingMap.get(blMinifigNo);
    const hasOwned = counts.owned > 0;
    const computedStatus: Enums<'set_status'> | null = hasOwned
      ? 'owned'
      : null;

    let nextStatus: Enums<'set_status'> | null = null;

    if (existing?.status === 'owned') {
      nextStatus = 'owned';
    } else if (existing?.status === 'want') {
      if (computedStatus === 'owned') {
        nextStatus = 'owned';
      } else {
        nextStatus = 'want';
      }
    } else {
      nextStatus = computedStatus;
    }

    if (!nextStatus) {
      continue;
    }

    const ownedQuantity = counts.owned > 0 ? counts.owned : null;

    let quantity: number | null = existing?.quantity ?? null;
    if (nextStatus === 'owned' && ownedQuantity != null) {
      quantity = ownedQuantity;
    }

    upserts.push({
      user_id: userId,
      fig_num: blMinifigNo,
      status: nextStatus,
      updated_at: new Date().toISOString(),
      quantity: quantity ?? 0,
    });
  }

  if (upserts.length === 0) return 0;

  const { error: upsertError } = await supabase
    .from('user_minifigs')
    .upsert(upserts, { onConflict: 'user_id,fig_num' });

  if (upsertError) {
    logger.error('user_minifigs.sync_from_sets.upsert_failed', {
      userId,
      error: upsertError.message,
    });
    return null;
  }

  return upserts.length;
}

/**
 * Sync list memberships from parent sets to their minifigs.
 *
 * Best-effort: failures are logged but do not propagate.
 */
async function syncListMemberships(
  supabase: SupabaseClient<Database>,
  userId: string,
  latestBySet: Map<string, { id: number; version: number }>,
  invMinifigs: Array<{
    inventory_id: number;
    fig_num: string;
    quantity: number | null;
  }>,
  figToBlId: Map<string, string>
): Promise<number> {
  let listItemsSynced = 0;

  try {
    // Reverse map: inventory_id → set_num
    const invIdToSetNum = new Map<number, string>();
    for (const [setNum, inv] of latestBySet) {
      invIdToSetNum.set(inv.id, setNum);
    }

    // Map: blMinifigId → set of set_nums it came from
    const minifigToSets = new Map<string, Set<string>>();
    for (const im of invMinifigs) {
      const blMinifigNo = figToBlId.get(im.fig_num) ?? im.fig_num;
      const setNum = invIdToSetNum.get(im.inventory_id);
      if (!setNum) continue;
      let setNums = minifigToSets.get(blMinifigNo);
      if (!setNums) {
        setNums = new Set();
        minifigToSets.set(blMinifigNo, setNums);
      }
      setNums.add(setNum);
    }

    // Get all list memberships for these sets
    const allSetNums = [
      ...new Set([...minifigToSets.values()].flatMap(s => [...s])),
    ];
    if (allSetNums.length > 0) {
      const setListMemberships = new Map<string, string[]>(); // set_num → list_ids

      for (let i = 0; i < allSetNums.length; i += CHUNK_SIZE) {
        const chunk = allSetNums.slice(i, i + CHUNK_SIZE);
        const { data: listItems, error: listError } = await supabase
          .from('user_list_items')
          .select('set_num, list_id')
          .eq('user_id', userId)
          .eq('item_type', 'set')
          .in('set_num', chunk);

        if (listError) {
          logger.warn(
            'user_minifigs.sync_from_sets.list_membership_query_failed',
            { userId, error: listError.message }
          );
          break;
        }

        for (const row of listItems ?? []) {
          if (!row.set_num || !row.list_id) continue;
          const existing = setListMemberships.get(row.set_num) ?? [];
          existing.push(row.list_id);
          setListMemberships.set(row.set_num, existing);
        }
      }

      // Build minifig list items to insert
      const minifigListRows: Array<{
        user_id: string;
        list_id: string;
        item_type: 'minifig';
        minifig_id: string;
      }> = [];

      for (const [blMinifigId, parentSets] of minifigToSets) {
        const listIds = new Set<string>();
        for (const setNum of parentSets) {
          for (const listId of setListMemberships.get(setNum) ?? []) {
            listIds.add(listId);
          }
        }
        for (const listId of listIds) {
          minifigListRows.push({
            user_id: userId,
            list_id: listId,
            item_type: 'minifig',
            minifig_id: blMinifigId,
          });
        }
      }

      if (minifigListRows.length > 0) {
        // Batch upsert in chunks — ignoreDuplicates avoids overwriting
        for (let i = 0; i < minifigListRows.length; i += CHUNK_SIZE) {
          const chunk = minifigListRows.slice(i, i + CHUNK_SIZE);
          const { error: listUpsertError } = await supabase
            .from('user_list_items')
            .upsert(chunk, {
              onConflict: 'user_id,list_id,item_type,minifig_id',
              ignoreDuplicates: true,
            });

          if (listUpsertError) {
            logger.warn(
              'user_minifigs.sync_from_sets.list_items_upsert_failed',
              { userId, error: listUpsertError.message }
            );
          } else {
            listItemsSynced += chunk.length;
          }
        }
      }
    }
  } catch (listSyncErr) {
    // List sync is best-effort — don't fail the whole operation
    logger.warn('user_minifigs.sync_from_sets.list_sync_error', {
      userId,
      error:
        listSyncErr instanceof Error
          ? listSyncErr.message
          : String(listSyncErr),
    });
  }

  return listItemsSynced;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sync user minifigs owned status from their owned sets.
 *
 * Reads the user's owned sets (and optionally list items based on sync scope),
 * resolves which minifigs those sets contain via the Rebrickable catalog,
 * computes owned quantities, merges with existing user_minifigs, and upserts.
 *
 * Also syncs list memberships from parent sets to their minifigs (best-effort).
 *
 * @param supabase  Auth-scoped Supabase client for user data
 * @param userId    The authenticated user's ID
 * @param options   Sync options (force flag)
 * @returns Sync result with counts, or null if sync was skipped (pref disabled)
 * @throws  Re-throws unexpected errors after logging
 */
export async function syncMinifigsFromSets(
  supabase: SupabaseClient<Database>,
  userId: string,
  options: MinifigSyncOptions
): Promise<MinifigSyncResult | null> {
  const prefs = await loadUserMinifigSyncPreferences(supabase, userId);

  if (!options.force && !prefs.syncOwnedFromSets) {
    return null;
  }

  const syncScope = prefs.syncScope ?? 'collection';

  // 1. Collect owned set_nums
  const { data: userSets, error: setsError } = await supabase
    .from('user_sets')
    .select('set_num,owned')
    .eq('user_id', userId)
    .eq('owned', true);

  if (setsError) {
    logger.error('user_minifigs.sync_from_sets.user_sets_failed', {
      userId,
      error: setsError.message,
    });
    throw new Error('Failed to load user sets');
  }

  const sets = (userSets ?? []) as Array<
    Pick<Tables<'user_sets'>, 'set_num' | 'owned'>
  >;

  const setNumsSet = new Set(
    sets.filter(s => s.owned && s.set_num).map(s => s.set_num)
  );

  // Expand scope to include list items if needed
  await resolveSetScope(supabase, userId, syncScope, setNumsSet);

  if (setNumsSet.size === 0) {
    return { updated: 0, listItemsSynced: 0 };
  }

  // 2. Fetch latest catalog inventories for these sets
  const catalogClient = getCatalogWriteClient();
  const invResult = await fetchLatestInventories(catalogClient, userId, [
    ...setNumsSet,
  ]);

  if (!invResult) {
    throw new Error('Failed to fetch inventories');
  }

  if (invResult.invIds.length === 0) {
    return { updated: 0, listItemsSynced: 0 };
  }

  // 3. Compute minifig contributions
  const contribResult = await computeMinifigContributions(
    catalogClient,
    userId,
    invResult.invIds
  );

  if (!contribResult) {
    throw new Error('Failed to compute minifig contributions');
  }

  if (contribResult.contributions.size === 0) {
    return { updated: 0, listItemsSynced: 0 };
  }

  // 4. Merge with existing user_minifigs and upsert
  const updated = await mergeAndUpsertMinifigs(
    supabase,
    userId,
    contribResult.contributions
  );

  if (updated === null) {
    throw new Error('Failed to upsert minifigs');
  }

  // 5. Sync list memberships (best-effort)
  const listItemsSynced = await syncListMemberships(
    supabase,
    userId,
    invResult.latestBySet,
    contribResult.invMinifigs,
    contribResult.figToBlId
  );

  return { updated, listItemsSynced };
}
