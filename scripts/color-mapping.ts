/**
 * Script-compatible color mapping: BL↔RB color ID maps from `rb_colors`.
 *
 * Same logic as `app/lib/colors/colorMapping.ts` but takes an injectable
 * Supabase client (no `server-only` import) for use in batch scripts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

/**
 * Parse `external_ids` JSON from an `rb_colors` row to extract BrickLink IDs.
 */
function extractBlColorIds(externalIds: unknown): number[] {
  if (typeof externalIds !== 'object' || externalIds == null) return [];
  const bl = (externalIds as Record<string, unknown>)['BrickLink'];
  if (typeof bl !== 'object' || bl == null) return [];
  const extIds = (bl as Record<string, unknown>)['ext_ids'];
  if (!Array.isArray(extIds)) return [];
  return extIds.filter((id): id is number => typeof id === 'number');
}

/**
 * Build BL→RB color map from `rb_colors` table.
 *
 * @param supabase - Injectable Supabase client (service role for scripts)
 */
export async function buildBlToRbColorMap(
  supabase: SupabaseClient<Database>
): Promise<Map<number, number>> {
  const blToRb = new Map<number, number>();

  const { data, error } = await supabase
    .from('rb_colors')
    .select('id, external_ids');

  if (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load rb_colors for color mapping:', error.message);
    return blToRb;
  }

  for (const row of data ?? []) {
    const blIds = extractBlColorIds(row.external_ids);
    for (const blId of blIds) {
      if (!blToRb.has(blId)) {
        blToRb.set(blId, row.id);
      }
    }
  }

  return blToRb;
}
