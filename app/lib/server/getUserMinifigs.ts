import type { Database } from '@/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

type UserMinifig = {
  /** BrickLink minifig ID (primary, after migration) */
  figNum: string;
  status: string | null;
  quantity: number | null;
  name: string;
  numParts: number | null;
  imageUrl: string | null;
  /** BrickLink ID (same as figNum for BL-based data) */
  blId: string | null;
  /** Release year from BrickLink catalog */
  year: number | null;
  /** BrickLink category ID */
  categoryId: number | null;
  /** Category/theme name from bricklink_categories */
  categoryName: string | null;
};

type Args = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

/**
 * Get user minifigs with BrickLink IDs as primary identifiers.
 *
 * After the BL migration, user_minifigs.fig_num contains BL minifig IDs.
 * Metadata comes from bricklink_minifigs and bl_set_minifigs.
 */
export async function getUserMinifigs({
  userId,
  supabase,
}: Args): Promise<UserMinifig[]> {
  const { data, error } = await supabase
    .from('user_minifigs')
    .select('fig_num, status, quantity')
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
    }>) ?? [];

  const blMinifigNos = rows.map(r => r.fig_num).filter(Boolean);
  if (blMinifigNos.length === 0) {
    return [];
  }

  // Get names, years, and category IDs from bricklink_minifigs catalog
  const { data: blCatalog } = await supabase
    .from('bricklink_minifigs')
    .select('item_id, name, item_year, category_id')
    .in('item_id', blMinifigNos);

  const nameByBlId = new Map<string, string>();
  const yearByBlId = new Map<string, number>();
  const categoryIdByBlId = new Map<string, number>();
  for (const row of blCatalog ?? []) {
    if (row.name) {
      nameByBlId.set(row.item_id, row.name);
    }
    if (typeof row.item_year === 'number' && row.item_year > 0) {
      yearByBlId.set(row.item_id, row.item_year);
    }
    if (typeof row.category_id === 'number') {
      categoryIdByBlId.set(row.item_id, row.category_id);
    }
  }

  // Get category names from bricklink_categories
  const categoryIds = [...new Set(categoryIdByBlId.values())];
  const categoryNameById = new Map<number, string>();
  if (categoryIds.length > 0) {
    const { data: categories } = await supabase
      .from('bricklink_categories')
      .select('category_id, category_name')
      .in('category_id', categoryIds);

    for (const cat of categories ?? []) {
      categoryNameById.set(cat.category_id, cat.category_name);
    }
  }

  // Get images/names from bl_set_minifigs (may have more recent data)
  const { data: blSetMinifigs } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, name, image_url')
    .in('minifig_no', blMinifigNos);

  const imageByBlId = new Map<string, string | null>();
  for (const row of blSetMinifigs ?? []) {
    // Use first image found
    if (!imageByBlId.has(row.minifig_no) && row.image_url) {
      imageByBlId.set(row.minifig_no, row.image_url);
    }
    // Use bl_set_minifigs name if not in catalog
    if (!nameByBlId.has(row.minifig_no) && row.name) {
      nameByBlId.set(row.minifig_no, row.name);
    }
  }

  // Get part counts from bl_minifig_parts
  const { data: partCounts } = await supabase
    .from('bl_minifig_parts')
    .select('bl_minifig_no')
    .in('bl_minifig_no', blMinifigNos);

  const partsCountByBlId = new Map<string, number>();
  for (const row of partCounts ?? []) {
    const current = partsCountByBlId.get(row.bl_minifig_no) ?? 0;
    partsCountByBlId.set(row.bl_minifig_no, current + 1);
  }

  return rows.map(row => {
    const categoryId = categoryIdByBlId.get(row.fig_num) ?? null;
    return {
      figNum: row.fig_num,
      status: row.status ?? null,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity)
          ? row.quantity
          : null,
      name: nameByBlId.get(row.fig_num) ?? row.fig_num,
      numParts: partsCountByBlId.get(row.fig_num) ?? null,
      imageUrl: imageByBlId.get(row.fig_num) ?? null,
      blId: row.fig_num, // BL ID is the primary ID after migration
      year: yearByBlId.get(row.fig_num) ?? null,
      categoryId,
      categoryName: categoryId
        ? (categoryNameById.get(categoryId) ?? null)
        : null,
    };
  });
}
