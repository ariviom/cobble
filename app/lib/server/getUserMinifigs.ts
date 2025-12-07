import { mapRebrickableFigToBrickLinkOnDemand } from '@/app/lib/minifigMapping';
import type { Database } from '@/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type UserMinifig = {
  figNum: string;
  status: string | null;
  quantity: number | null;
  name: string;
  numParts: number | null;
  imageUrl: string | null;
  blId: string | null;
};

type Args = {
  userId: string;
  supabase: SupabaseClient<Database>;
  /**
   * Max number of missing figs to attempt on-demand mapping for in this call.
   * Keep this small to avoid extra BrickLink calls per request.
   */
  onDemandLimit?: number;
};

export async function getUserMinifigs({
  userId,
  supabase,
  onDemandLimit = 5,
}: Args): Promise<UserMinifig[]> {
  const { data, error } = await supabase
    .from('user_minifigs')
    .select(
      `
      fig_num,
      status,
      quantity,
      rb_minifigs(name,num_parts)
    `
    )
    .eq('user_id', userId)
    .order('fig_num', { ascending: true });

  if (error) {
    throw error;
  }

  const rows =
    (data as Array<{
      fig_num: string;
      status: string | null;
      quantity: number | null;
      rb_minifigs: { name?: string | null; num_parts?: number | null } | null;
    }>) ?? [];

  const figNums = rows.map(r => r.fig_num).filter(Boolean);

  // Images
  let imagesMap = new Map<string, string | null>();
  if (figNums.length > 0) {
    const { data: images, error: imgErr } = await supabase
      .from('rb_minifig_images')
      .select('fig_num,image_url')
      .in('fig_num', figNums);
    if (!imgErr) {
      imagesMap = new Map(
        (images ?? []).map(img => [img.fig_num, img.image_url ?? null])
      );
    }
  }

  // BL mappings
  const blMap = new Map<string, string | null>();
  if (figNums.length > 0) {
    const { data: mappings } = await supabase
      .from('bricklink_minifig_mappings')
      .select('rb_fig_id,bl_item_id')
      .in('rb_fig_id', figNums);
    for (const row of mappings ?? []) {
      if (row.rb_fig_id) {
        blMap.set(row.rb_fig_id, row.bl_item_id ?? null);
      }
    }

    const missing = figNums.filter(id => !blMap.has(id));
    if (missing.length > 0) {
      const { data: setMap } = await supabase
        .from('bl_set_minifigs')
        .select('rb_fig_id,minifig_no')
        .in('rb_fig_id', missing);
      for (const row of setMap ?? []) {
        if (row.rb_fig_id && row.minifig_no && !blMap.has(row.rb_fig_id)) {
          blMap.set(row.rb_fig_id, row.minifig_no);
        }
      }
    }

    // On-demand mapping for a bounded number of remaining figs
    const stillMissing = figNums.filter(id => !blMap.has(id)).slice(0, onDemandLimit);
    for (const id of stillMissing) {
      const mapped = await mapRebrickableFigToBrickLinkOnDemand(id);
      if (mapped) {
        blMap.set(id, mapped);
      }
    }

    // Re-read mappings for any that were just on-demand mapped
    if (stillMissing.length > 0) {
      const { data: updatedMap } = await supabase
        .from('bricklink_minifig_mappings')
        .select('rb_fig_id,bl_item_id')
        .in('rb_fig_id', stillMissing);
      for (const row of updatedMap ?? []) {
        if (row.rb_fig_id && !blMap.has(row.rb_fig_id)) {
          blMap.set(row.rb_fig_id, row.bl_item_id ?? null);
        }
      }
    }
  }

  return (
    rows.map(row => ({
      figNum: row.fig_num,
      status: row.status ?? null,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity)
          ? row.quantity
          : null,
      name: row.rb_minifigs?.name ?? row.fig_num,
      numParts: row.rb_minifigs?.num_parts ?? null,
      imageUrl: imagesMap.get(row.fig_num) ?? null,
      blId: blMap.get(row.fig_num) ?? null,
    })) ?? []
  );
}



