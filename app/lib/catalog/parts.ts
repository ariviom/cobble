import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

export async function getPartByPartNum(partNum: string) {
  const supabase = getCatalogReadClient();
  const { data, error } = await supabase
    .from('rb_parts')
    .select('part_num, name, part_cat_id, bl_part_id')
    .eq('part_num', partNum)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getPartColors(partNum: string) {
  // rb_part_rarity has no FK to rb_colors, so we need a separate query.
  const supabase = getCatalogReadClient();
  const { data: rarityRows } = await supabase
    .from('rb_part_rarity')
    .select('color_id')
    .eq('part_num', partNum);

  if (!rarityRows?.length) return [];

  const colorIds = rarityRows.map(r => r.color_id);
  const { data: colors } = await supabase
    .from('rb_colors')
    .select('id, name, rgb')
    .in('id', colorIds);

  return (colors ?? []).map(c => ({
    color_id: c.id,
    name: c.name,
    rgb: c.rgb,
  }));
}

export async function getPartSetCount(partNum: string, colorId?: number) {
  const supabase = getCatalogReadClient();
  let query = supabase
    .from('rb_part_rarity')
    .select('set_count, color_id')
    .eq('part_num', partNum);

  if (colorId != null) {
    query = query.eq('color_id', colorId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getSetsContainingPart(partNum: string, colorId?: number) {
  // rb_inventory_parts has a FK to rb_inventories, so we do two queries.
  const supabase = getCatalogReadClient();
  let query = supabase
    .from('rb_inventory_parts')
    .select('inventory_id')
    .eq('part_num', partNum)
    .eq('is_spare', false);

  if (colorId != null) {
    query = query.eq('color_id', colorId);
  }

  const { data: invParts } = await query.limit(500);
  if (!invParts?.length) return [];

  const invIds = [...new Set(invParts.map(r => r.inventory_id))];

  const { data: inventories } = await supabase
    .from('rb_inventories')
    .select('set_num')
    .in('id', invIds.slice(0, 200))
    .not('set_num', 'like', 'fig-%');

  const setNums = new Set<string>();
  for (const row of inventories ?? []) {
    if (row.set_num) setNums.add(row.set_num);
  }
  return [...setNums];
}
