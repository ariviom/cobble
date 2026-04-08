import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/supabase/types';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A validated sync operation ready for processing. */
export type SyncOperation =
  | {
      id: number;
      table: 'user_set_parts';
      operation: 'upsert' | 'delete';
      payload: {
        set_num: string;
        part_num: string;
        color_id: number;
        is_spare?: boolean | undefined;
        owned_quantity?: number | undefined;
      };
    }
  | {
      id: number;
      table: 'user_loose_parts';
      operation: 'upsert' | 'delete';
      payload: {
        part_num: string;
        color_id: number;
        loose_quantity: number;
      };
    };

/** Result returned by processSyncOperations. */
export type SyncResult = {
  success: boolean;
  processed: number;
  failed: Array<{ id: number; error: string }>;
  versions?: Record<string, number> | undefined;
};

// ---------------------------------------------------------------------------
// Internal bucket types
// ---------------------------------------------------------------------------

type SetPartUpsert = {
  id: number;
  payload: {
    user_id: string;
    set_num: string;
    part_num: string;
    color_id: number;
    is_spare: boolean;
    owned_quantity: number;
  };
};

type SetPartDelete = {
  id: number;
  payload: {
    set_num: string;
    part_num: string;
    color_id: number;
    is_spare: boolean;
  };
};

type LoosePartUpsert = {
  id: number;
  payload: {
    user_id: string;
    part_num: string;
    color_id: number;
    loose_quantity: number;
  };
};

type LoosePartDelete = {
  id: number;
  payload: {
    part_num: string;
    color_id: number;
  };
};

// ---------------------------------------------------------------------------
// Categorisation
// ---------------------------------------------------------------------------

function categoriseOperations(
  operations: SyncOperation[],
  userId: string
): {
  userSetPartsUpserts: SetPartUpsert[];
  userSetPartsDeletes: SetPartDelete[];
  userLoosePartsUpserts: LoosePartUpsert[];
  userLoosePartsDeletes: LoosePartDelete[];
} {
  const userSetPartsUpserts: SetPartUpsert[] = [];
  const userSetPartsDeletes: SetPartDelete[] = [];
  const userLoosePartsUpserts: LoosePartUpsert[] = [];
  const userLoosePartsDeletes: LoosePartDelete[] = [];

  for (const op of operations) {
    if (op.table === 'user_set_parts') {
      const payload = op.payload;
      const isSpare = payload.is_spare ?? false;

      if (op.operation === 'upsert') {
        const quantity = payload.owned_quantity ?? 0;
        userSetPartsUpserts.push({
          id: op.id,
          payload: {
            user_id: userId,
            set_num: payload.set_num,
            part_num: payload.part_num,
            color_id: payload.color_id,
            is_spare: isSpare,
            owned_quantity: Math.max(0, Math.floor(quantity)),
          },
        });
      } else {
        userSetPartsDeletes.push({
          id: op.id,
          payload: {
            set_num: payload.set_num,
            part_num: payload.part_num,
            color_id: payload.color_id,
            is_spare: isSpare,
          },
        });
      }
    } else {
      // user_loose_parts
      const payload = op.payload;
      const looseQty = Math.max(0, Math.floor(payload.loose_quantity));

      if (op.operation === 'upsert') {
        userLoosePartsUpserts.push({
          id: op.id,
          payload: {
            user_id: userId,
            part_num: payload.part_num,
            color_id: payload.color_id,
            loose_quantity: looseQty,
          },
        });
      } else {
        userLoosePartsDeletes.push({
          id: op.id,
          payload: {
            part_num: payload.part_num,
            color_id: payload.color_id,
          },
        });
      }
    }
  }

  return {
    userSetPartsUpserts,
    userSetPartsDeletes,
    userLoosePartsUpserts,
    userLoosePartsDeletes,
  };
}

// ---------------------------------------------------------------------------
// DB write helpers
// ---------------------------------------------------------------------------

async function executeSetPartUpserts(
  supabase: SupabaseClient<Database>,
  upserts: SetPartUpsert[],
  failed: Array<{ id: number; error: string }>
): Promise<number> {
  if (upserts.length === 0) return 0;

  let processed = 0;
  const rows = upserts.map(u => u.payload);
  const { error: upsertError } = await supabase
    .from('user_set_parts')
    .upsert(rows, {
      onConflict: 'user_id,set_num,part_num,color_id,is_spare',
    });

  if (upsertError) {
    // Batch failed — retry each row individually so one bad row
    // (e.g. BrickLink ID not in rb_parts) doesn't kill the batch.
    for (const u of upserts) {
      const { error: rowError } = await supabase
        .from('user_set_parts')
        .upsert([u.payload], {
          onConflict: 'user_id,set_num,part_num,color_id,is_spare',
        });

      if (rowError) {
        failed.push({
          id: u.id,
          error: `upsert_failed:${rowError.message}`,
        });
      } else {
        processed++;
      }
    }
  } else {
    processed += upserts.length;
  }

  return processed;
}

async function executeSetPartDeletes(
  supabase: SupabaseClient<Database>,
  userId: string,
  deletes: SetPartDelete[],
  failed: Array<{ id: number; error: string }>
): Promise<number> {
  // Process in batches to avoid overwhelming Supabase with concurrent requests
  const BATCH_SIZE = 20;
  let processed = 0;

  for (let i = 0; i < deletes.length; i += BATCH_SIZE) {
    const batch = deletes.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async d => {
        const { error: deleteError } = await supabase
          .from('user_set_parts')
          .delete()
          .eq('user_id', userId)
          .eq('set_num', d.payload.set_num)
          .eq('part_num', d.payload.part_num)
          .eq('color_id', d.payload.color_id)
          .eq('is_spare', d.payload.is_spare);

        if (deleteError) {
          failed.push({
            id: d.id,
            error: `delete_failed:${deleteError.message}`,
          });
          return false;
        }
        return true;
      })
    );
    processed += results.filter(Boolean).length;
  }

  return processed;
}

async function executeLoosePartUpserts(
  supabase: SupabaseClient<Database>,
  upserts: LoosePartUpsert[],
  failed: Array<{ id: number; error: string }>
): Promise<number> {
  if (upserts.length === 0) return 0;

  let processed = 0;

  // Omit `quantity` so existing set-derived values are preserved;
  // new rows get the DB default (0).
  const rows = upserts.map(u => ({
    user_id: u.payload.user_id,
    part_num: u.payload.part_num,
    color_id: u.payload.color_id,
    loose_quantity: u.payload.loose_quantity,
    updated_at: new Date().toISOString(),
  }));
  const { error: upsertError } = await supabase
    .from('user_parts_inventory')
    .upsert(rows, {
      onConflict: 'user_id,part_num,color_id',
    });

  if (upsertError) {
    // Batch failed — retry each row individually
    for (const u of upserts) {
      const { error: rowError } = await supabase
        .from('user_parts_inventory')
        .upsert(
          [
            {
              user_id: u.payload.user_id,
              part_num: u.payload.part_num,
              color_id: u.payload.color_id,
              loose_quantity: u.payload.loose_quantity,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'user_id,part_num,color_id' }
        );

      if (rowError) {
        failed.push({
          id: u.id,
          error: `upsert_failed:${rowError.message}`,
        });
      } else {
        processed++;
      }
    }
  } else {
    processed += upserts.length;
  }

  return processed;
}

async function executeLoosePartDeletes(
  supabase: SupabaseClient<Database>,
  userId: string,
  deletes: LoosePartDelete[],
  failed: Array<{ id: number; error: string }>
): Promise<number> {
  let processed = 0;

  for (const d of deletes) {
    const { error: deleteError } = await supabase
      .from('user_parts_inventory')
      .update({ loose_quantity: 0, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('part_num', d.payload.part_num)
      .eq('color_id', d.payload.color_id);

    if (deleteError) {
      failed.push({
        id: d.id,
        error: `delete_failed:${deleteError.message}`,
      });
    } else {
      processed++;
      // Clean up orphan rows where both quantity and loose_quantity are 0
      await supabase
        .from('user_parts_inventory')
        .delete()
        .eq('user_id', userId)
        .eq('part_num', d.payload.part_num)
        .eq('color_id', d.payload.color_id)
        .eq('quantity', 0)
        .eq('loose_quantity', 0);
    }
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Post-write: found_count + sync versions
// ---------------------------------------------------------------------------

function collectAffectedSetNums(
  upserts: SetPartUpsert[],
  deletes: SetPartDelete[]
): Set<string> {
  const affected = new Set<string>();
  for (const u of upserts) {
    if (!u.payload.is_spare) affected.add(u.payload.set_num);
  }
  for (const d of deletes) {
    if (!d.payload.is_spare) affected.add(d.payload.set_num);
  }
  return affected;
}

async function updateFoundCounts(
  supabase: SupabaseClient<Database>,
  affectedSetNums: Set<string>
): Promise<void> {
  // Parallelize — each RPC is independent and non-critical
  await Promise.all(
    Array.from(affectedSetNums).map(async setNum => {
      try {
        await supabase.rpc('update_found_count', { p_set_num: setNum });
      } catch {
        // Non-critical — found_count will self-correct on next sync
      }
    })
  );
}

async function fetchSyncVersions(
  supabase: SupabaseClient<Database>,
  userId: string,
  affectedSetNums: Set<string>
): Promise<Record<string, number> | undefined> {
  try {
    const { data: versionRows } = await supabase.rpc('get_max_sync_versions', {
      p_user_id: userId,
      p_set_nums: Array.from(affectedSetNums),
    });
    if (versionRows && versionRows.length > 0) {
      const versions: Record<string, number> = {};
      for (const row of versionRows) {
        versions[row.set_num] = Number(row.max_version);
      }
      return versions;
    }
  } catch {
    // Non-critical — client will catch up on next pull
    logger.warn('sync.versions_fetch_failed');
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process a batch of validated sync operations against Supabase.
 *
 * Groups operations by table, attempts batch writes, and falls back to
 * per-row retries on failure. After writes, atomically updates found_count
 * for affected sets and fetches sync versions.
 *
 * @returns A {@link SyncResult} with processed/failed counts and optional
 *   version watermarks — never throws.
 */
export async function processSyncOperations(
  supabase: SupabaseClient<Database>,
  userId: string,
  operations: SyncOperation[]
): Promise<SyncResult> {
  const failed: Array<{ id: number; error: string }> = [];
  let processed = 0;

  // Categorise operations by table and operation type
  const {
    userSetPartsUpserts,
    userSetPartsDeletes,
    userLoosePartsUpserts,
    userLoosePartsDeletes,
  } = categoriseOperations(operations, userId);

  // Execute all DB writes
  processed += await executeSetPartUpserts(
    supabase,
    userSetPartsUpserts,
    failed
  );
  processed += await executeSetPartDeletes(
    supabase,
    userId,
    userSetPartsDeletes,
    failed
  );
  processed += await executeLoosePartUpserts(
    supabase,
    userLoosePartsUpserts,
    failed
  );
  processed += await executeLoosePartDeletes(
    supabase,
    userId,
    userLoosePartsDeletes,
    failed
  );

  // Post-write: update found_count and fetch versions
  const affectedSetNums = collectAffectedSetNums(
    userSetPartsUpserts,
    userSetPartsDeletes
  );

  if (affectedSetNums.size > 0) {
    await updateFoundCounts(supabase, affectedSetNums);
  }

  let versions: Record<string, number> | undefined;
  if (affectedSetNums.size > 0) {
    versions = await fetchSyncVersions(supabase, userId, affectedSetNums);
  }

  return {
    success: failed.length === 0,
    processed,
    failed,
    versions,
  };
}
