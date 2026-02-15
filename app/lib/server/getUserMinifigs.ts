import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
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
  /** Release year */
  year: number | null;
  /** Theme ID (from containing set) */
  categoryId: number | null;
  /** Theme name (from containing set) */
  categoryName: string | null;
};

type Args = {
  userId: string;
  supabase: SupabaseClient<Database>;
};

/**
 * Get user minifigs with metadata from RB catalog.
 *
 * user_minifigs.fig_num contains BL minifig IDs.
 * Metadata comes from rb_minifigs, rb_minifig_images, and set-containment
 * chain (rb_inventory_minifigs → rb_inventories → rb_sets → rb_themes).
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

  const catalog = getCatalogReadClient();

  // Lookup rb_minifigs by BL minifig ID for name, num_parts, and fig_num
  const { data: rbMinifigs } = await catalog
    .from('rb_minifigs')
    .select('fig_num, name, num_parts, bl_minifig_id')
    .in('bl_minifig_id', blMinifigNos);

  const nameByBlId = new Map<string, string>();
  const numPartsByBlId = new Map<string, number>();
  const blIdToFigNum = new Map<string, string>();

  for (const fig of rbMinifigs ?? []) {
    const blId = fig.bl_minifig_id;
    if (!blId) continue;
    if (fig.name) nameByBlId.set(blId, fig.name);
    if (typeof fig.num_parts === 'number')
      numPartsByBlId.set(blId, fig.num_parts);
    blIdToFigNum.set(blId, fig.fig_num);
  }

  // Get images from rb_minifig_images
  const figNums = Array.from(blIdToFigNum.values());
  const imageByBlId = new Map<string, string>();

  if (figNums.length > 0) {
    const { data: images } = await catalog
      .from('rb_minifig_images')
      .select('fig_num, image_url')
      .in('fig_num', figNums);

    // Build reverse map: fig_num → bl_id
    const figNumToBlId = new Map<string, string>();
    for (const [blId, fn] of blIdToFigNum) {
      figNumToBlId.set(fn, blId);
    }

    for (const img of images ?? []) {
      if (img.image_url) {
        const blId = figNumToBlId.get(img.fig_num);
        if (blId) imageByBlId.set(blId, img.image_url);
      }
    }
  }

  // Get year/theme from containing sets via rb_inventory_minifigs chain
  const yearByBlId = new Map<string, number>();
  const themeByBlId = new Map<string, { id: number; name: string }>();

  if (figNums.length > 0) {
    // Get inventory entries for these minifigs
    const { data: invMinifigs } = await catalog
      .from('rb_inventory_minifigs')
      .select('fig_num, inventory_id')
      .in('fig_num', figNums);

    if (invMinifigs && invMinifigs.length > 0) {
      const invIds = [...new Set(invMinifigs.map(im => im.inventory_id))];

      // Get set numbers from inventories (exclude fig-* entries)
      const { data: inventories } = await catalog
        .from('rb_inventories')
        .select('id, set_num')
        .in('id', invIds)
        .not('set_num', 'like', 'fig-%');

      if (inventories && inventories.length > 0) {
        // Map inventory_id → set_num
        const invToSetNum = new Map<number, string>();
        for (const inv of inventories) {
          if (typeof inv.set_num === 'string') {
            invToSetNum.set(inv.id, inv.set_num);
          }
        }

        // Map fig_num → first set_num
        const figNumToSetNum = new Map<string, string>();
        for (const im of invMinifigs) {
          if (figNumToSetNum.has(im.fig_num)) continue;
          const setNum = invToSetNum.get(im.inventory_id);
          if (setNum) figNumToSetNum.set(im.fig_num, setNum);
        }

        const setNums = [...new Set(figNumToSetNum.values())];
        if (setNums.length > 0) {
          const { data: sets } = await catalog
            .from('rb_sets')
            .select('set_num, year, theme_id')
            .in('set_num', setNums);

          const setByNum = new Map<
            string,
            { year: number | null; theme_id: number | null }
          >();
          const themeIds = new Set<number>();
          for (const s of sets ?? []) {
            setByNum.set(s.set_num, { year: s.year, theme_id: s.theme_id });
            if (typeof s.theme_id === 'number') themeIds.add(s.theme_id);
          }

          // Get theme names
          const themeNameById = new Map<number, string>();
          if (themeIds.size > 0) {
            const { data: themes } = await catalog
              .from('rb_themes')
              .select('id, name')
              .in('id', Array.from(themeIds));
            for (const t of themes ?? []) {
              themeNameById.set(t.id, t.name);
            }
          }

          // Build reverse: fig_num → bl_id
          const figNumToBlIdReverse = new Map<string, string>();
          for (const [blId, fn] of blIdToFigNum) {
            figNumToBlIdReverse.set(fn, blId);
          }

          // Assign year/theme to each minifig
          for (const [fn, setNum] of figNumToSetNum) {
            const blId = figNumToBlIdReverse.get(fn);
            if (!blId) continue;
            const setInfo = setByNum.get(setNum);
            if (!setInfo) continue;
            if (typeof setInfo.year === 'number' && setInfo.year > 0) {
              yearByBlId.set(blId, setInfo.year);
            }
            if (typeof setInfo.theme_id === 'number') {
              const themeName = themeNameById.get(setInfo.theme_id);
              if (themeName) {
                themeByBlId.set(blId, {
                  id: setInfo.theme_id,
                  name: themeName,
                });
              }
            }
          }
        }
      }
    }
  }

  return rows.map(row => {
    const theme = themeByBlId.get(row.fig_num) ?? null;
    return {
      figNum: row.fig_num,
      status: row.status ?? null,
      quantity:
        typeof row.quantity === 'number' && Number.isFinite(row.quantity)
          ? row.quantity
          : null,
      name: nameByBlId.get(row.fig_num) ?? row.fig_num,
      numParts: numPartsByBlId.get(row.fig_num) ?? null,
      imageUrl: imageByBlId.get(row.fig_num) ?? null,
      blId: row.fig_num,
      year: yearByBlId.get(row.fig_num) ?? null,
      categoryId: theme?.id ?? null,
      categoryName: theme?.name ?? null,
    };
  });
}
