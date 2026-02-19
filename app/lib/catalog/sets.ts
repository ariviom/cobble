import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import type { PartInSet, SimpleSet } from '@/app/lib/rebrickable';
import {
  mapCategoryNameToParent,
  normalizeText,
  sortAggregatedResults,
} from '@/app/lib/rebrickable';
import { filterExactMatches } from '@/app/lib/searchExactMatch';
import { dedup } from '@/app/lib/utils/dedup';
import type { MatchType } from '@/app/types/search';
import { logger } from '@/lib/metrics';

import {
  buildThemeMetaHelpers,
  deriveRootThemeName,
  getThemesLocal,
  type LocalTheme,
} from './themes';

// ---------------------------------------------------------------------------
// In-process category cache (small static table, ~50 rows)
// ---------------------------------------------------------------------------
const CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let categoryCache: {
  at: number;
  map: Map<number, { id: number; name: string }>;
} | null = null;

async function getCategoryMap(): Promise<
  Map<number, { id: number; name: string }>
> {
  const now = Date.now();
  if (categoryCache && now - categoryCache.at < CATEGORY_CACHE_TTL_MS) {
    return categoryCache.map;
  }

  const supabase = getCatalogReadClient();
  const { data, error } = await supabase
    .from('rb_part_categories')
    .select('id, name');

  const map = new Map<number, { id: number; name: string }>();
  if (error) {
    logger.warn('catalog.category_cache_build_failed', {
      error: error.message,
    });
    return map;
  }

  for (const cat of data ?? []) {
    map.set(cat.id, cat);
  }
  categoryCache = { at: now, map };
  return map;
}

export async function searchSetsLocal(
  query: string,
  sort: string,
  options?: { exactMatch?: boolean }
): Promise<SimpleSet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const exactMatch = options?.exactMatch ?? false;

  // rb_sets is publicly readable (anon SELECT policy)
  const supabase = getCatalogReadClient();

  const keyBase = trimmed.toLowerCase();

  // We fetch by set number prefix and by name contains, and merge with theme-
  // based matches, then sort in-memory for relevance and other sort modes.
  const [bySetNum, byName, themesRaw] = await Promise.all([
    dedup(
      `searchSetsLocal:setnum:${keyBase}:${sort}:${exactMatch}`,
      async () => {
        const { data, error } = await supabase
          .from('rb_sets')
          .select('set_num, name, year, num_parts, image_url, theme_id')
          .ilike('set_num', `${trimmed}%`)
          .limit(250);
        return { data, error };
      }
    ),
    dedup(`searchSetsLocal:name:${keyBase}:${sort}:${exactMatch}`, async () => {
      const { data, error } = await supabase
        .from('rb_sets')
        .select('set_num, name, year, num_parts, image_url, theme_id')
        .ilike('name', `%${trimmed}%`)
        .limit(250);
      return { data, error };
    }),
    dedup(`searchSetsLocal:themes`, () => getThemesLocal()),
  ]);

  if (bySetNum.error && !bySetNum.data && byName.error && !byName.data) {
    throw new Error(
      `Supabase searchSetsLocal failed: ${bySetNum.error?.message ?? ''} ${byName.error?.message ?? ''}`.trim()
    );
  }

  const themes = themesRaw ?? [];
  const themeById = new Map<number, LocalTheme>(themes.map(t => [t.id, t]));
  const { getThemeMeta, matchesTheme } = buildThemeMetaHelpers(themes);

  function getMatchTypeForTheme(themeId: number | null | undefined): MatchType {
    if (themeId == null || !Number.isFinite(themeId)) {
      return 'set';
    }
    const theme = themeById.get(themeId as number);
    if (theme && theme.parent_id != null) {
      return 'subtheme';
    }
    return 'theme';
  }

  const seen = new Map<string, SimpleSet>();
  const MATCH_PRIORITY: Record<MatchType, number> = {
    set: 3,
    subtheme: 2,
    theme: 1,
  };

  function addRow(
    row: {
      set_num: string;
      name: string;
      year: number | null;
      num_parts: number | null;
      image_url: string | null;
      theme_id: number | null;
    },
    matchType: MatchType = 'set'
  ) {
    const key = row.set_num.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      const types = new Set(
        existing.matchTypes ?? [existing.matchType ?? 'set']
      );
      types.add(matchType);
      const typesArr = Array.from(types);
      const bestType = typesArr.reduce((a, b) =>
        MATCH_PRIORITY[a] >= MATCH_PRIORITY[b] ? a : b
      );
      seen.set(key, {
        ...existing,
        matchType: bestType,
        matchTypes: typesArr,
      });
      return;
    }

    const rawThemeId =
      typeof row.theme_id === 'number' && Number.isFinite(row.theme_id)
        ? row.theme_id
        : null;
    const { themeName, themePath } = getThemeMeta(rawThemeId);

    seen.set(key, {
      setNumber: row.set_num,
      name: row.name,
      year: row.year ?? 0,
      numParts: row.num_parts ?? 0,
      imageUrl: row.image_url ?? null,
      themeId: rawThemeId,
      ...(themeName ? { themeName } : {}),
      ...(themePath ? { themePath } : {}),
      matchType,
      matchTypes: [matchType],
    });
  }

  for (const row of bySetNum.data ?? []) {
    addRow(
      row as {
        set_num: string;
        name: string;
        year: number | null;
        num_parts: number | null;
        image_url: string | null;
        theme_id: number | null;
      },
      'set'
    );
  }

  for (const row of byName.data ?? []) {
    addRow(
      row as {
        set_num: string;
        name: string;
        year: number | null;
        num_parts: number | null;
        image_url: string | null;
        theme_id: number | null;
      },
      'set'
    );
  }

  // Theme & subtheme keyword search: include sets whose full theme path matches
  // the query (e.g., "Star Wars" or "Classic Space").
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  if (hasLetters && themeById.size > 0) {
    const normalizedQuery = normalizeText(trimmed);
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const matchingThemeIds = matchesTheme(normalizedQuery, compactQuery);

    if (matchingThemeIds.size > 0) {
      const { data: byTheme, error: byThemeError } = await supabase
        .from('rb_sets')
        .select('set_num, name, year, num_parts, image_url, theme_id')
        .in('theme_id', Array.from(matchingThemeIds))
        .limit(500);

      if (byThemeError) {
        logger.error('catalog.search_by_theme_failed', {
          error: byThemeError.message,
        });
      } else {
        for (const row of byTheme ?? []) {
          const matchTypeForTheme = getMatchTypeForTheme(
            typeof row.theme_id === 'number' && Number.isFinite(row.theme_id)
              ? row.theme_id
              : null
          );
          addRow(
            row as {
              set_num: string;
              name: string;
              year: number | null;
              num_parts: number | null;
              image_url: string | null;
              theme_id: number | null;
            },
            matchTypeForTheme
          );
        }
      }
    }
  }

  let items = Array.from(seen.values());
  if (items.length === 0) return [];
  if (exactMatch) {
    items = filterExactMatches(items, trimmed);
  }
  if (items.length === 0) return [];

  return sortAggregatedResults(items, sort, trimmed);
}

export async function getSetSummaryLocal(setNumber: string): Promise<{
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
  /**
   * Root theme name for this set, when available (e.g., top-level parent theme).
   */
  themeName: string | null;
} | null> {
  const trimmed = setNumber.trim();
  if (!trimmed) return null;

  const data = await dedup(
    `getSetSummaryLocal:${trimmed.toLowerCase()}`,
    async () => {
      // rb_sets is publicly readable (anon SELECT policy)
      const supabase = getCatalogReadClient();
      const { data, error } = await supabase
        .from('rb_sets')
        .select('set_num, name, year, num_parts, image_url, theme_id')
        .eq('set_num', trimmed)
        .maybeSingle();

      if (error) {
        throw new Error(
          `Supabase getSetSummaryLocal rb_sets failed: ${error.message}`
        );
      }
      return data ?? null;
    }
  );

  if (!data) return null;

  // Resolve root theme name using cached local themes, when a theme_id is present.
  let themeName: string | null = null;
  const rawThemeId =
    typeof data.theme_id === 'number' && Number.isFinite(data.theme_id)
      ? data.theme_id
      : null;
  if (rawThemeId != null) {
    try {
      const themes = await getThemesLocal();
      const themeById = new Map<number, LocalTheme>(
        (themes ?? []).map(t => [t.id, t])
      );
      let current: LocalTheme | null | undefined = themeById.get(rawThemeId);
      if (current) {
        const visited = new Set<number>();
        while (current && !visited.has(current.id)) {
          visited.add(current.id);
          if (current.parent_id != null) {
            const parent = themeById.get(current.parent_id);
            if (!parent) break;
            current = parent;
          } else {
            break;
          }
        }
        themeName = current?.name ?? null;
      }
    } catch {
      // If theme lookup fails, fall back to null without breaking summary.
      themeName = null;
    }
  }

  return {
    setNumber: data.set_num,
    name: data.name,
    year: data.year ?? 0,
    numParts: data.num_parts ?? 0,
    imageUrl: data.image_url ?? null,
    themeId: rawThemeId,
    themeName,
  };
}

export async function getSetInventoryLocal(
  setNumber: string
): Promise<InventoryRow[]> {
  const trimmedSet = setNumber.trim();
  if (!trimmedSet) return [];

  // Catalog reads use anon client. Inventory parts come from the public view
  // rb_inventory_parts_public, which exposes non-sensitive columns with RLS in place.
  const supabase = getCatalogReadClient();

  type InventoryPartRow = {
    part_num: string;
    color_id: number;
    quantity: number;
    is_spare: boolean;
    element_id?: string | null;
    img_url?: string | null;
  };

  // Prefer inventory_parts (with color-specific img_url) using the latest inventory version.
  let setParts: InventoryPartRow[] = [];

  const { data: inventories, error: inventoriesError } = await supabase
    .from('rb_inventories')
    .select('id, version')
    .eq('set_num', trimmedSet);

  if (inventoriesError) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_inventories failed: ${inventoriesError.message}`
    );
  }

  const inventoryCandidates =
    inventories?.filter(
      row => typeof row?.id === 'number' && Number.isFinite(row.id)
    ) ?? [];

  // Track minifig parent info (components handled by inventory.ts via rb_minifig_parts)
  let figNumsEarly: string[] = [];
  let inventoryMinifigsEarly: Array<{ fig_num: string; quantity: number }> = [];

  if (inventoryCandidates.length > 0) {
    inventoryCandidates.sort((a, b) => (b.version ?? -1) - (a.version ?? -1));
    const selectedInventoryId = inventoryCandidates[0]!.id;

    // Fire inventory parts + minifigs queries in parallel (both depend only on selectedInventoryId)
    const [partsResult, minifigsResult] = await Promise.all([
      supabase
        .from('rb_inventory_parts_public')
        .select('part_num, color_id, quantity, is_spare, element_id, img_url')
        .eq('inventory_id', selectedInventoryId)
        .eq('is_spare', false),
      supabase
        .from('rb_inventory_minifigs')
        .select('fig_num, quantity')
        .eq('inventory_id', selectedInventoryId),
    ]);

    if (partsResult.error) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_inventory_parts failed: ${partsResult.error.message}`
      );
    }
    if (minifigsResult.error) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_inventory_minifigs failed: ${minifigsResult.error.message}`
      );
    }

    if (partsResult.data?.length) {
      setParts = partsResult.data as InventoryPartRow[];
    }

    // Process minifig parent info
    inventoryMinifigsEarly = (minifigsResult.data ?? [])
      .filter(
        f =>
          typeof f?.fig_num === 'string' &&
          f.fig_num.trim().length > 0 &&
          typeof f?.quantity === 'number'
      )
      .map(f => ({
        fig_num: f.fig_num.trim(),
        quantity: f.quantity as number,
      }));

    figNumsEarly = Array.from(
      new Set(inventoryMinifigsEarly.map(f => f.fig_num))
    );
    // NOTE: Minifig component parts are NOT loaded here.
    // They are loaded from rb_minifig_parts in inventory.ts with identity resolution.
  }

  // Fallback to legacy rb_set_parts when no inventory records were found.
  if (setParts.length === 0) {
    const { data: setPartsFallback, error: setPartsError } = await supabase
      .from('rb_set_parts')
      .select('part_num, color_id, quantity, is_spare')
      .eq('set_num', trimmedSet);

    if (setPartsError) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_set_parts failed: ${setPartsError.message}`
      );
    }

    setParts = setPartsFallback ?? [];
  }

  const mainParts = setParts.filter(row => row && row.is_spare === false);
  if (mainParts.length === 0) return [];

  // ==========================================================================
  // END EARLY MINIFIG LOADING (components deferred to inventory.ts)
  // ==========================================================================

  const partNums = Array.from(
    new Set(mainParts.map(row => row.part_num).filter(Boolean))
  );
  const colorIds = Array.from(
    new Set(mainParts.map(row => row.color_id).filter(id => id != null))
  );

  // Build part+color pairs for parallel rarity query
  const partColorPairs = mainParts.map(row => ({
    partNum: row.part_num,
    colorId: row.color_id,
  }));

  const [partsRes, colorsRes, categoryMap, partRarityMap] = await Promise.all([
    partNums.length
      ? supabase
          .from('rb_parts')
          .select('part_num, name, part_cat_id, image_url, bl_part_id')
          .in('part_num', partNums)
      : Promise.resolve({ data: [], error: null } as {
          data: {
            part_num: string;
            name: string;
            part_cat_id: number | null;
            image_url: string | null;
            bl_part_id: string | null;
          }[];
          error: null;
        }),
    colorIds.length
      ? supabase.from('rb_colors').select('id, name').in('id', colorIds)
      : Promise.resolve({ data: [], error: null } as {
          data: { id: number; name: string }[];
          error: null;
        }),
    getCategoryMap(),
    queryPartRarityBatch(supabase, partColorPairs),
  ]);

  if (partsRes.error) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_parts failed: ${partsRes.error.message}`
    );
  }
  if (colorsRes.error) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_colors failed: ${colorsRes.error.message}`
    );
  }

  const parts = partsRes.data ?? [];
  const colors = colorsRes.data ?? [];

  const partMap = new Map<
    string,
    {
      part_num: string;
      name: string;
      part_cat_id: number | null;
      image_url: string | null;
      bl_part_id: string | null;
    }
  >();
  for (const part of parts) {
    partMap.set(part.part_num, part);
  }

  const colorMap = new Map<number, { id: number; name: string }>();
  for (const color of colors) {
    colorMap.set(color.id, color);
  }

  const rows: InventoryRow[] = mainParts.map(row => {
    const part = partMap.get(row.part_num);
    const color = colorMap.get(row.color_id);
    const catId =
      typeof part?.part_cat_id === 'number' ? part.part_cat_id : undefined;
    const catName =
      typeof catId === 'number' ? categoryMap.get(catId)?.name : undefined;
    const parentCategory =
      catName != null ? mapCategoryNameToParent(catName) : undefined;
    const bricklinkPartId = part?.bl_part_id ?? null;
    const elementId =
      typeof row.element_id === 'string' && row.element_id.trim().length > 0
        ? row.element_id.trim()
        : null;
    const imageUrl =
      (typeof row.img_url === 'string' && row.img_url.trim().length > 0
        ? row.img_url.trim()
        : null) ??
      part?.image_url ??
      null;

    const setCount =
      partRarityMap.get(`${row.part_num}:${row.color_id}`) ?? null;

    return {
      setNumber: trimmedSet,
      partId: row.part_num,
      partName: part?.name ?? row.part_num,
      colorId: row.color_id,
      colorName: color?.name ?? `Color ${row.color_id}`,
      quantityRequired: row.quantity,
      imageUrl,
      elementId,
      ...(typeof catId === 'number' && { partCategoryId: catId }),
      ...(catName && { partCategoryName: catName }),
      ...(parentCategory && { parentCategory }),
      inventoryKey: `${row.part_num}:${row.color_id}`,
      // Only include bricklinkPartId if different from partId
      ...(bricklinkPartId &&
        bricklinkPartId !== row.part_num && {
          bricklinkPartId,
        }),
      ...(setCount != null && { setCount }),
    };
  });
  const partRowMap = new Map<string, InventoryRow>();
  for (const r of rows) {
    partRowMap.set(r.inventoryKey, r);
  }

  // ---- Minifigs (parent rows only) ----
  // Component parts are loaded from rb_minifig_parts in inventory.ts
  // with identity resolution for RB↔BL mapping
  const parentRows: InventoryRow[] = [];

  if (figNumsEarly.length > 0) {
    const figNums = figNumsEarly;

    // Fetch metadata, images, and rarity for minifig parent rows in parallel
    type MinifigRarityRow = {
      fig_num: string;
      min_subpart_set_count: number;
      set_count: number;
    };

    const [figMetaRes, figImagesRes, figRarityRes] = await Promise.all([
      supabase
        .from('rb_minifigs')
        .select('fig_num, name, num_parts, bl_minifig_id')
        .in('fig_num', figNums),
      supabase
        .from('rb_minifig_images')
        .select('fig_num, image_url')
        .in('fig_num', figNums),
      supabase
        .from('rb_minifig_rarity' as never)
        .select('fig_num, min_subpart_set_count, set_count')
        .in('fig_num', figNums) as unknown as Promise<{
        data: MinifigRarityRow[] | null;
        error: { message: string } | null;
      }>,
    ]);

    if (figMetaRes.error) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_minifigs failed: ${figMetaRes.error.message}`
      );
    }
    if (figImagesRes.error) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_minifig_images failed: ${figImagesRes.error.message}`
      );
    }
    // Rarity failure is non-fatal
    if (figRarityRes.error) {
      logger.warn('catalog.minifig_rarity_failed', {
        error: figRarityRes.error.message,
      });
    }

    const figRarityById = new Map<string, number>();
    for (const r of figRarityRes.data ?? []) {
      figRarityById.set(r.fig_num, r.min_subpart_set_count);
    }

    const figMetaById = new Map<
      string,
      {
        name?: string | null;
        num_parts?: number | null;
        bl_minifig_id?: string | null;
      }
    >();
    for (const m of figMetaRes.data ?? []) {
      figMetaById.set(m.fig_num, {
        name: m.name ?? null,
        num_parts: m.num_parts ?? null,
        bl_minifig_id: m.bl_minifig_id ?? null,
      });
    }

    const figImgById = new Map<string, string | null>();
    for (const img of figImagesRes.data ?? []) {
      figImgById.set(
        img.fig_num,
        typeof img.image_url === 'string' && img.image_url.trim().length > 0
          ? img.image_url.trim()
          : null
      );
    }

    // Create parent rows for each minifig (componentRelations added by inventory.ts)
    for (const invFig of inventoryMinifigsEarly) {
      const figNum = invFig.fig_num;
      if (!figNum) continue;
      const parentQuantity =
        typeof invFig.quantity === 'number' && Number.isFinite(invFig.quantity)
          ? invFig.quantity
          : 1;
      const parentKey = `fig:${figNum}`;
      const meta = figMetaById.get(figNum);
      const blMinifigId = meta?.bl_minifig_id ?? null;
      const figSetCount = figRarityById.get(figNum) ?? null;
      const parentRow: InventoryRow = {
        setNumber: trimmedSet,
        partId: parentKey,
        partName: meta?.name ?? figNum,
        colorId: 0,
        colorName: '—',
        quantityRequired: parentQuantity,
        imageUrl: figImgById.get(figNum) ?? null,
        partCategoryName: 'Minifig',
        parentCategory: 'Minifigure',
        inventoryKey: parentKey,
        ...(blMinifigId && { bricklinkFigId: blMinifigId }),
        ...(figSetCount != null && { setCount: figSetCount }),
        // componentRelations populated by inventory.ts from rb_minifig_parts
      };

      parentRows.push(parentRow);
    }
  }

  const mergedRows = Array.from(partRowMap.values());
  // Sort parent rows by inventoryKey for deterministic ordering
  const sortedParentRows = [...parentRows].sort((a, b) =>
    a.inventoryKey.localeCompare(b.inventoryKey)
  );
  return [...mergedRows, ...sortedParentRows];
}

/**
 * Find sets containing a part using the normalized inventory tables.
 *
 * Matches the rarity system's UNION logic:
 *  1. Direct parts in sets (rb_inventory_parts → rb_inventories)
 *  2. Parts via minifig subparts (rb_minifig_parts → rb_inventory_minifigs → rb_inventories)
 */
export async function getSetsForPartLocal(
  partNum: string,
  colorId?: number | null
): Promise<PartInSet[]> {
  const trimmed = partNum.trim();
  if (!trimmed) return [];

  return dedup(
    `getSetsForPartLocal:${trimmed.toLowerCase()}:${colorId ?? ''}`,
    () => getSetsForPartLocalImpl(trimmed, colorId)
  );
}

async function getSetsForPartLocalImpl(
  partNum: string,
  colorId?: number | null
): Promise<PartInSet[]> {
  const supabase = getCatalogReadClient();

  // ── Step 1: Parallel fetch — direct inventory parts + minifig subparts ──
  const directQuery = supabase
    .from('rb_inventory_parts')
    .select('inventory_id, quantity')
    .eq('part_num', partNum)
    .eq('is_spare', false)
    .limit(2000);
  if (typeof colorId === 'number') directQuery.eq('color_id', colorId);

  const figQuery = supabase
    .from('rb_minifig_parts')
    .select('fig_num, quantity')
    .eq('part_num', partNum)
    .limit(500);
  if (typeof colorId === 'number') figQuery.eq('color_id', colorId);

  const [directRes, figRes] = await Promise.all([directQuery, figQuery]);
  if (directRes.error) {
    throw new Error(
      `Supabase getSetsForPartLocal direct failed: ${directRes.error.message}`
    );
  }
  if (figRes.error) {
    throw new Error(
      `Supabase getSetsForPartLocal minifig_parts failed: ${figRes.error.message}`
    );
  }

  const directParts = directRes.data ?? [];
  const figParts = figRes.data ?? [];

  // ── Step 2: For minifig path, find inventories containing those figs ──
  const figInvData: {
    inventory_id: number;
    fig_num: string;
    quantity: number;
  }[] = [];
  if (figParts.length > 0) {
    const figNums = [...new Set(figParts.map(f => f.fig_num))];
    for (let i = 0; i < figNums.length; i += 200) {
      const batch = figNums.slice(i, i + 200);
      const { data, error } = await supabase
        .from('rb_inventory_minifigs')
        .select('inventory_id, fig_num, quantity')
        .in('fig_num', batch);
      if (error) {
        throw new Error(
          `Supabase getSetsForPartLocal inv_minifigs failed: ${error.message}`
        );
      }
      figInvData.push(...(data ?? []));
    }
  }

  // ── Step 3: Resolve inventory_ids → set_nums (excluding fig-* inventories) ──
  const allInvIds = [
    ...new Set([
      ...directParts.map(r => r.inventory_id),
      ...figInvData.map(r => r.inventory_id),
    ]),
  ];
  if (allInvIds.length === 0) return [];

  const inventoryRows: { id: number; set_num: string }[] = [];
  for (let i = 0; i < allInvIds.length; i += 200) {
    const batch = allInvIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('rb_inventories')
      .select('id, set_num')
      .in('id', batch)
      .not('set_num', 'like', 'fig-%');
    if (error) {
      throw new Error(
        `Supabase getSetsForPartLocal inventories failed: ${error.message}`
      );
    }
    for (const row of data ?? []) {
      if (row.set_num) inventoryRows.push({ id: row.id, set_num: row.set_num });
    }
  }

  const invToSet = new Map<number, string>();
  for (const inv of inventoryRows) {
    if (inv.set_num) invToSet.set(inv.id, inv.set_num);
  }

  // ── Step 4: Aggregate quantities per set ──
  const setQuantities = new Map<string, number>();

  for (const dp of directParts) {
    const setNum = invToSet.get(dp.inventory_id);
    if (!setNum) continue;
    setQuantities.set(
      setNum,
      (setQuantities.get(setNum) ?? 0) + (dp.quantity ?? 1)
    );
  }

  // Parts via minifigs: total = minifig_qty_in_set × part_qty_in_minifig
  const figPartQty = new Map<string, number>();
  for (const fp of figParts) {
    figPartQty.set(fp.fig_num, fp.quantity ?? 1);
  }
  for (const mf of figInvData) {
    const setNum = invToSet.get(mf.inventory_id);
    if (!setNum) continue;
    const partQty = figPartQty.get(mf.fig_num) ?? 1;
    setQuantities.set(
      setNum,
      (setQuantities.get(setNum) ?? 0) + (mf.quantity ?? 1) * partQty
    );
  }

  if (setQuantities.size === 0) return [];

  // ── Step 5: Fetch rb_sets metadata ──
  const setNums = [...setQuantities.keys()];
  type SetRow = {
    set_num: string;
    name: string;
    year: number | null;
    num_parts: number | null;
    image_url: string | null;
    theme_id: number | null;
  };
  const setRows: SetRow[] = [];
  for (let i = 0; i < setNums.length; i += 200) {
    const batch = setNums.slice(i, i + 200);
    const { data, error } = await supabase
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .in('set_num', batch);
    if (error) {
      throw new Error(
        `Supabase getSetsForPartLocal sets failed: ${error.message}`
      );
    }
    setRows.push(...((data as SetRow[]) ?? []));
  }

  // ── Build result with theme enrichment ──
  const themes = await getThemesLocal();
  const themeById = new Map<number, LocalTheme>(
    (themes ?? []).map(t => [t.id, t])
  );

  const bySet = new Map<string, PartInSet>();
  for (const row of setRows) {
    const quantity = setQuantities.get(row.set_num) ?? 1;
    const rawThemeId =
      typeof row.theme_id === 'number' && Number.isFinite(row.theme_id)
        ? row.theme_id
        : null;
    const themeName = deriveRootThemeName(themeById, rawThemeId);

    bySet.set(row.set_num.toLowerCase(), {
      setNumber: row.set_num,
      name: row.name ?? row.set_num,
      year: row.year ?? 0,
      imageUrl: row.image_url ?? null,
      quantity,
      numParts: row.num_parts ?? null,
      themeId: rawThemeId,
      themeName: themeName ?? null,
    });
  }

  return Array.from(bySet.values());
}

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
async function queryPartRarityBatch(
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
      }>;
    })
  );

  for (const { data } of results) {
    for (const r of data ?? []) {
      map.set(`${r.part_num}:${r.color_id}`, r.set_count);
    }
  }

  return map;
}
