/**
 * One-time backfill: populate `rb_color_id` on existing `bl_minifig_parts` rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-rb-color-ids.ts
 *   DRY_RUN=true npx tsx scripts/backfill-rb-color-ids.ts   # preview only
 */
import dotenv from 'dotenv';

import { createSupabaseClient } from './minifig-mapping-core';
import { buildBlToRbColorMap } from './color-mapping';

dotenv.config();
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: '.env.local', override: true });
}

const BATCH_SIZE = 500;
const DRY_RUN = process.env.DRY_RUN === 'true';

function log(message: string, extra?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [backfill-rb-color-ids] ${message}`, extra ?? '');
}

async function main() {
  const supabase = createSupabaseClient();

  log('Building BL→RB color map from rb_colors...');
  const blToRb = await buildBlToRbColorMap(supabase);
  log('Color map loaded', { entries: blToRb.size });

  if (DRY_RUN) {
    log('DRY RUN — no updates will be made');
  }

  // Fetch all rows where rb_color_id IS NULL
  log('Querying rows with NULL rb_color_id...');
  const { data: rows, error } = await supabase
    .from('bl_minifig_parts')
    .select('bl_minifig_no, bl_part_id, bl_color_id')
    .is('rb_color_id', null);

  if (error) {
    log('Failed to query bl_minifig_parts', { error: error.message });
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    log('No rows need backfilling — all done!');
    return;
  }

  log('Rows needing backfill', { count: rows.length });

  // Build update batches
  const unmappedBlColorIds = new Set<number>();
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const updates = batch
      .map(row => {
        const rbColorId = blToRb.get(row.bl_color_id);
        if (rbColorId == null) {
          unmappedBlColorIds.add(row.bl_color_id);
          skipped++;
          return null;
        }
        return {
          bl_minifig_no: row.bl_minifig_no,
          bl_part_id: row.bl_part_id,
          bl_color_id: row.bl_color_id,
          rb_color_id: rbColorId,
        };
      })
      .filter(Boolean) as Array<{
      bl_minifig_no: string;
      bl_part_id: string;
      bl_color_id: number;
      rb_color_id: number;
    }>;

    if (updates.length > 0 && !DRY_RUN) {
      const { error: upsertErr } = await supabase
        .from('bl_minifig_parts')
        .upsert(updates, {
          onConflict: 'bl_minifig_no,bl_part_id,bl_color_id',
        });

      if (upsertErr) {
        log('Batch upsert failed', {
          offset: i,
          error: upsertErr.message,
        });
        continue;
      }
    }

    updated += updates.length;

    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= rows.length) {
      log('Progress', {
        processed: Math.min(i + BATCH_SIZE, rows.length),
        total: rows.length,
        updated,
        skipped,
      });
    }
  }

  log('Backfill complete', { updated, skipped });

  if (unmappedBlColorIds.size > 0) {
    log('Unmapped BL color IDs (no RB equivalent found)', {
      count: unmappedBlColorIds.size,
      ids: [...unmappedBlColorIds].sort((a, b) => a - b),
    });
  }
}

main().catch(err => {
  log('Fatal error', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
