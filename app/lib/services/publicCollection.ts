import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/supabase/types';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';

export type PublicSetSummary = {
  set_num: string;
  name: string;
  year: number | null;
  image_url: string | null;
  num_parts: number | null;
  theme_id: number | null;
  owned: boolean;
};

export type PublicMinifigSummary = {
  fig_num: string;
  name: string | null;
  num_parts: number | null;
  status: 'owned' | 'want' | null;
  image_url: string | null;
  bl_id: string | null;
  year: number | null;
  categoryId: number | null;
  categoryName: string | null;
};

export type PublicPartSummary = {
  partNum: string;
  colorId: number;
  quantity: number;
  partName: string;
  colorName: string;
  imageUrl: string | null;
  parentCategory: string | null;
};

export type PublicListSummary = {
  id: string;
  name: string;
  setNums: string[];
  minifigIds: string[];
};

export type PublicCollectionPayload = {
  allSets: PublicSetSummary[];
  allMinifigs: PublicMinifigSummary[];
  allParts: PublicPartSummary[];
  lists: PublicListSummary[];
};

export type FetchPublicCollectionOptions = {
  /** Client used to read public_*_view tables (or raw tables when includePrivate) and user_parts_inventory. */
  supabase?: SupabaseClient<Database>;
  /** Client used for catalog (rb_*) reads. */
  catalogClient?: SupabaseClient<Database>;
  /**
   * Read from the raw `user_*` tables instead of the privacy-filtered
   * `public_user_*_view` versions. Only admin callers (using the service-role
   * client) should set this.
   */
  includePrivate?: boolean;
};

export async function fetchPublicCollectionPayload(
  userId: string,
  options: FetchPublicCollectionOptions = {}
): Promise<PublicCollectionPayload> {
  const supabase = options.supabase ?? getSupabaseServerClient();
  const catalogClient = options.catalogClient ?? getCatalogReadClient();

  const setsPromise = options.includePrivate
    ? supabase.from('user_sets').select('set_num,owned').eq('user_id', userId)
    : supabase
        .from('public_user_sets_view')
        .select('set_num,owned')
        .eq('user_id', userId);
  const listsPromise = options.includePrivate
    ? supabase
        .from('user_lists')
        .select('id,name,is_system')
        .eq('user_id', userId)
        .order('name', { ascending: true })
    : supabase
        .from('public_user_lists_view')
        .select<'id,name,is_system'>('id,name,is_system')
        .eq('user_id', userId)
        .order('name', { ascending: true });
  const listItemsPromise = options.includePrivate
    ? supabase
        .from('user_list_items')
        .select('list_id,item_type,set_num,minifig_id')
        .eq('user_id', userId)
    : supabase
        .from('public_user_list_items_view')
        .select<'list_id,item_type,set_num,minifig_id'>(
          'list_id,item_type,set_num,minifig_id'
        )
        .eq('user_id', userId);
  const minifigsPromise = options.includePrivate
    ? supabase
        .from('user_minifigs')
        .select('fig_num,status')
        .eq('user_id', userId)
    : supabase
        .from('public_user_minifigs_view')
        .select<'fig_num,status'>('fig_num,status')
        .eq('user_id', userId);

  const [
    { data: userSets },
    { data: userLists },
    { data: listItems },
    { data: userMinifigs },
  ] = await Promise.all([
    setsPromise,
    listsPromise,
    listItemsPromise,
    minifigsPromise,
  ]);

  // Extract owned set numbers from the view
  const ownedSetNums: string[] = [];
  for (const row of (userSets ?? []) as Array<{
    set_num: string | null;
    owned: boolean | null;
  }>) {
    if (row.set_num && row.owned) {
      ownedSetNums.push(row.set_num);
    }
  }
  // Wishlist is now tracked via user_lists (system list), not user_sets
  const wishlistSetNums: string[] = [];

  const listMembership = new Map<
    string,
    { setNums: string[]; minifigIds: string[] }
  >();

  for (const list of userLists ?? []) {
    if (list.is_system || !list.id) continue;
    listMembership.set(list.id, { setNums: [], minifigIds: [] });
  }

  for (const item of listItems ?? []) {
    if (!item.list_id) continue;
    const bucket = listMembership.get(item.list_id);
    if (!bucket) continue;
    if (item.item_type === 'set' && item.set_num) {
      bucket.setNums.push(item.set_num);
    } else if (item.item_type === 'minifig' && item.minifig_id) {
      bucket.minifigIds.push(item.minifig_id);
    }
  }

  const listSetNums = Array.from(listMembership.values()).flatMap(
    membership => membership.setNums
  );
  const listMinifigIds = Array.from(listMembership.values()).flatMap(
    membership => membership.minifigIds
  );

  const allSetNums = Array.from(
    new Set([...ownedSetNums, ...wishlistSetNums, ...listSetNums])
  ).filter(Boolean);

  let setsById: Record<string, PublicSetSummary> = {};

  if (allSetNums.length > 0) {
    const { data: sets } = await supabase
      .from('rb_sets')
      .select<'set_num,name,year,image_url,num_parts,theme_id'>(
        'set_num,name,year,image_url,num_parts,theme_id'
      )
      .in('set_num', allSetNums);

    const ownedSet = new Set(ownedSetNums);
    setsById = Object.fromEntries(
      (sets ?? []).map(set => {
        return [
          set.set_num,
          {
            set_num: set.set_num,
            name: set.name,
            year: set.year,
            image_url: set.image_url,
            num_parts: set.num_parts,
            theme_id: set.theme_id,
            owned: ownedSet.has(set.set_num),
          } satisfies PublicSetSummary,
        ];
      })
    );
  }

  const allSets: PublicSetSummary[] = allSetNums
    .map(setNum => setsById[setNum])
    .filter(Boolean);

  const publicLists: PublicListSummary[] = (userLists ?? [])
    .filter(list => !list.is_system && !!list.id)
    .map(list => {
      if (!list.id) return null;
      const membership = listMembership.get(list.id) ?? {
        setNums: [],
        minifigIds: [],
      };
      return {
        id: list.id,
        name: list.name ?? '',
        setNums: membership.setNums,
        minifigIds: membership.minifigIds,
      };
    })
    .filter((v): v is PublicListSummary => Boolean(v));

  const minifigStatusMap = new Map<string, PublicMinifigSummary['status']>();
  for (const row of userMinifigs ?? []) {
    if (row.fig_num) {
      minifigStatusMap.set(row.fig_num, row.status ?? null);
    }
  }

  const allMinifigIds = Array.from(
    new Set([...minifigStatusMap.keys(), ...listMinifigIds])
  ).filter(Boolean);

  // Category name lookup - populated during minifig meta fetch
  const categoryNameById = new Map<number, string>();

  const minifigMeta: Record<
    string,
    {
      name: string | null;
      num_parts: number | null;
      image_url?: string | null;
      bl_id?: string | null;
      year?: number | null;
      categoryId?: number | null;
    }
  > = {};

  if (allMinifigIds.length > 0) {
    // Query rb_minifigs for names, num_parts, and BL IDs
    const { data: rbMinifigs } = await catalogClient
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .in(
        'bl_minifig_id',
        allMinifigIds.filter(id => !id.startsWith('fig-'))
      );

    for (const fig of rbMinifigs ?? []) {
      const blId = fig.bl_minifig_id;
      if (!blId) continue;
      minifigMeta[blId] = {
        name: fig.name ?? null,
        num_parts: fig.num_parts ?? null,
        image_url: null,
        bl_id: blId,
        year: null,
      };
    }

    // Also check for any fig-* style IDs (RB format)
    const rbStyleIds = allMinifigIds.filter(id => id.startsWith('fig-'));
    if (rbStyleIds.length > 0) {
      const { data: rbByFigNum } = await catalogClient
        .from('rb_minifigs')
        .select('fig_num, name, num_parts, bl_minifig_id')
        .in('fig_num', rbStyleIds);

      for (const fig of rbByFigNum ?? []) {
        const key = fig.bl_minifig_id ?? fig.fig_num;
        minifigMeta[key] = {
          name: fig.name ?? null,
          num_parts: fig.num_parts ?? null,
          image_url: null,
          bl_id: fig.bl_minifig_id ?? null,
          year: null,
        };
      }
    }

    // Get images from rb_minifig_images
    const figNums = (rbMinifigs ?? [])
      .map(f => f.fig_num)
      .concat(rbStyleIds)
      .filter(Boolean);
    if (figNums.length > 0) {
      const { data: images } = await catalogClient
        .from('rb_minifig_images')
        .select('fig_num, image_url')
        .in('fig_num', figNums);

      // Build fig_num → bl_minifig_id map for image assignment
      const figToBlId = new Map<string, string>();
      for (const fig of rbMinifigs ?? []) {
        if (fig.bl_minifig_id) {
          figToBlId.set(fig.fig_num, fig.bl_minifig_id);
        }
      }

      for (const img of images ?? []) {
        const blId = figToBlId.get(img.fig_num) ?? img.fig_num;
        const existing = minifigMeta[blId];
        if (existing && img.image_url) {
          existing.image_url = img.image_url;
        }
      }
    }
  }

  const allMinifigs: PublicMinifigSummary[] = allMinifigIds.map(figNum => {
    const meta = minifigMeta[figNum];
    const categoryId = meta?.categoryId ?? null;
    return {
      fig_num: figNum,
      name: meta?.name ?? figNum,
      num_parts: meta?.num_parts ?? null,
      status: minifigStatusMap.get(figNum) ?? null,
      image_url: meta?.image_url ?? null,
      bl_id: meta?.bl_id ?? figNum,
      year: meta?.year ?? null,
      categoryId,
      categoryName: categoryId
        ? (categoryNameById.get(categoryId) ?? null)
        : null,
    };
  });

  // Fetch public parts inventory
  const { data: userParts } = await supabase
    .from('user_parts_inventory')
    .select('part_num, color_id, quantity')
    .eq('user_id', userId);

  const partNums = [...new Set((userParts ?? []).map(p => p.part_num))];
  const colorIds = [...new Set((userParts ?? []).map(p => p.color_id))];

  const partsMetaMap: Map<
    string,
    { name: string; parentCategory: string | null }
  > = new Map();
  const colorNameMap: Map<number, string> = new Map();

  if (partNums.length > 0) {
    // Fetch part names (batch if needed)
    const { data: partsMeta } = await catalogClient
      .from('rb_parts')
      .select('part_num, name')
      .in('part_num', partNums.slice(0, 200));

    for (const p of partsMeta ?? []) {
      partsMetaMap.set(p.part_num, { name: p.name, parentCategory: null });
    }

    // Fetch color names
    const { data: colors } = await catalogClient
      .from('rb_colors')
      .select('id, name')
      .in('id', colorIds.slice(0, 200));

    for (const c of colors ?? []) {
      colorNameMap.set(c.id, c.name);
    }
  }

  const allPublicParts: PublicPartSummary[] = (userParts ?? []).map(p => {
    const meta = partsMetaMap.get(p.part_num);
    return {
      partNum: p.part_num,
      colorId: p.color_id,
      quantity: p.quantity,
      partName: meta?.name ?? p.part_num,
      colorName: colorNameMap.get(p.color_id) ?? `Color ${p.color_id}`,
      imageUrl: null,
      parentCategory: meta?.parentCategory ?? null,
    };
  });

  return {
    allSets,
    allMinifigs,
    allParts: allPublicParts,
    lists: publicLists,
  };
}
