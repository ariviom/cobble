import 'server-only';

import type { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { logger } from '@/lib/metrics';

// ---------------------------------------------------------------------------
// Rarity query helper — fires all batches in parallel
// ---------------------------------------------------------------------------

type PartRarityRow = {
  part_num: string;
  color_id: number;
  set_count: number;
};

const RARITY_BATCH_SIZE = 100;

/**
 * Query rb_part_rarity for a set of (part_num, color_id) pairs.
 * Fires all batches in parallel and returns a Map keyed by "partNum:colorId".
 */
export async function queryPartRarityBatch(
  supabase: ReturnType<typeof getCatalogReadClient>,
  pairs: Array<{ partNum: string; colorId: number }>
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (pairs.length === 0) return map;

  const batches: Array<Array<{ partNum: string; colorId: number }>> = [];
  for (let i = 0; i < pairs.length; i += RARITY_BATCH_SIZE) {
    batches.push(pairs.slice(i, i + RARITY_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map(batch => {
      const orFilter = batch
        .map(p => `and(part_num.eq.${p.partNum},color_id.eq.${p.colorId})`)
        .join(',');
      return supabase
        .from('rb_part_rarity' as never)
        .select('part_num, color_id, set_count')
        .or(orFilter) as unknown as Promise<{
        data: PartRarityRow[] | null;
        error: { message: string } | null;
      }>;
    })
  );

  for (const { data, error } of results) {
    if (error) {
      logger.warn('rarity.query_batch_failed', { error: error.message });
      continue;
    }
    for (const r of data ?? []) {
      map.set(`${r.part_num}:${r.color_id}`, r.set_count);
    }
  }

  return map;
}
