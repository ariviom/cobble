import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { normalizeText } from '@/app/lib/rebrickable';
import { logger } from '@/lib/metrics';
import type { MinifigMatchSource, MinifigSortOption } from '@/app/types/search';

import type { PartInSet } from '@/app/lib/rebrickable';

import {
  buildThemeMetaHelpers,
  getThemesLocal,
  type ThemeMeta,
} from './themes';

export type MinifigCatalogResult = {
  figNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number | null;
  themeName?: string | null;
  themePath?: string | null;
  matchSource?: MinifigMatchSource;
};

const MATCH_SOURCE_PRIORITY: Record<MinifigMatchSource, number> = {
  'bricklink-id': 4,
  'rebrickable-id': 3,
  name: 2,
  theme: 1,
};

function chooseMatchSource(
  existing?: MinifigMatchSource,
  incoming?: MinifigMatchSource
): MinifigMatchSource | undefined {
  if (!incoming && !existing) return undefined;
  if (!incoming) return existing;
  if (!existing) return incoming;
  return MATCH_SOURCE_PRIORITY[incoming] >= MATCH_SOURCE_PRIORITY[existing]
    ? incoming
    : existing;
}

function isLikelyBricklinkFigId(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length < 3) return false;
  const withoutPrefix = trimmed.replace(/^fig:/i, '');
  const hasLetter = /[a-z]/i.test(withoutPrefix);
  const hasDigit = /\d/.test(withoutPrefix);
  if (!hasLetter || !hasDigit) return false;
  return /^[a-z0-9:-]+$/i.test(withoutPrefix);
}

/**
 * Search minifigs using Rebrickable catalog data.
 *
 * Sources:
 * - rb_minifigs: Full RB minifig catalog (with bl_minifig_id mapping)
 * - rb_inventory_minifigs + rb_inventories: Set-based minifig search
 * - rb_minifig_parts: Part counts
 *
 * Returns BL minifig IDs (e.g., sw0001, cty1234) via rb_minifigs.bl_minifig_id.
 */
export async function searchMinifigsLocal(
  query: string,
  options?: {
    page?: number;
    pageSize?: number;
    sort?: MinifigSortOption;
  }
): Promise<{ results: MinifigCatalogResult[]; nextPage: number | null }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], nextPage: null };
  }

  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? 20));
  const sort = options?.sort ?? 'relevance';

  const normalizedQuery = normalizeText(trimmed);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const looksLikeBricklinkId = isLikelyBricklinkFigId(trimmed);

  const supabase = getCatalogReadClient();
  const themes = await getThemesLocal();
  const { getThemeMeta, matchesTheme } = buildThemeMetaHelpers(themes ?? []);

  const themeIds = looksLikeBricklinkId
    ? new Set<number>()
    : matchesTheme(normalizedQuery, compactQuery);

  // Search rb_minifigs by name and by bl_minifig_id
  const [byName, byBlId, byFigNum] = await Promise.all([
    // Name search
    supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .ilike('name', `%${trimmed}%`)
      .limit(200),
    // BL ID search
    supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .ilike('bl_minifig_id', `${trimmed}%`)
      .limit(100),
    // RB fig_num search (for fig- style queries)
    supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .ilike('fig_num', `%${trimmed}%`)
      .limit(100),
  ]);

  const seen = new Map<string, MinifigCatalogResult>();
  const candidateFigNums = new Set<string>();

  function addFig(
    blMinifigNo: string,
    name: string | null,
    imageUrl: string | null,
    numParts: number | null,
    themeMeta?: ThemeMeta,
    options?: { matchSource?: MinifigMatchSource }
  ) {
    const existing = seen.get(blMinifigNo);
    const preferredSource = chooseMatchSource(
      existing?.matchSource,
      options?.matchSource
    );
    const next: MinifigCatalogResult = {
      figNum: blMinifigNo,
      name: name || blMinifigNo,
      imageUrl: imageUrl ?? existing?.imageUrl ?? null,
      numParts: numParts ?? existing?.numParts ?? null,
      themeName: themeMeta?.themeName ?? existing?.themeName ?? null,
      themePath: themeMeta?.themePath ?? existing?.themePath ?? null,
    };
    if (preferredSource) {
      next.matchSource = preferredSource;
    }
    seen.set(blMinifigNo, next);
    candidateFigNums.add(blMinifigNo);
  }

  // Process name results
  if (byName.error) {
    throw new Error(
      `Supabase rb_minifigs search by name failed: ${byName.error.message}`
    );
  }
  for (const row of byName.data ?? []) {
    const blId = row.bl_minifig_id ?? row.fig_num;
    addFig(blId, row.name, null, row.num_parts, undefined, {
      matchSource: 'name',
    });
  }

  // Process BL ID results
  if (byBlId.error) {
    throw new Error(
      `Supabase rb_minifigs search by bl_id failed: ${byBlId.error.message}`
    );
  }
  for (const row of byBlId.data ?? []) {
    const blId = row.bl_minifig_id ?? row.fig_num;
    addFig(blId, row.name, null, row.num_parts, undefined, {
      matchSource: 'bricklink-id',
    });
  }

  // Process fig_num results
  if (byFigNum.error) {
    throw new Error(
      `Supabase rb_minifigs search by fig_num failed: ${byFigNum.error.message}`
    );
  }
  for (const row of byFigNum.data ?? []) {
    const blId = row.bl_minifig_id ?? row.fig_num;
    if (!candidateFigNums.has(blId)) {
      addFig(blId, row.name, null, row.num_parts, undefined, {
        matchSource: 'rebrickable-id',
      });
    }
  }

  // Direct ID resolution: try exact BL minifig ID
  if (!candidateFigNums.has(trimmed)) {
    const { data: exactMatch } = await supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts, bl_minifig_id')
      .eq('bl_minifig_id', trimmed)
      .maybeSingle();

    if (exactMatch) {
      const blId = exactMatch.bl_minifig_id ?? exactMatch.fig_num;
      addFig(blId, exactMatch.name, null, exactMatch.num_parts, undefined, {
        matchSource: 'bricklink-id',
      });
    }
  }

  // Theme-based search
  const figThemeIds = new Map<string, Set<number>>();

  if (themeIds.size > 0) {
    const { data: setsForThemes, error: themeSetsError } = await supabase
      .from('rb_sets')
      .select('set_num, theme_id')
      .in('theme_id', Array.from(themeIds))
      .limit(800);
    if (themeSetsError) {
      throw new Error(
        `Supabase minifig theme set lookup failed: ${themeSetsError.message}`
      );
    }

    const themeBySet = new Map<string, number>();
    for (const row of setsForThemes ?? []) {
      if (typeof row.set_num === 'string' && typeof row.theme_id === 'number') {
        themeBySet.set(row.set_num, row.theme_id);
      }
    }

    const setNums = Array.from(themeBySet.keys());
    if (setNums.length > 0) {
      // Get inventories for these sets
      const { data: inventories } = await supabase
        .from('rb_inventories')
        .select('id, set_num')
        .in('set_num', setNums)
        .not('set_num', 'like', 'fig-%');

      if (inventories && inventories.length > 0) {
        const invIds = inventories.map(inv => inv.id);
        const invToSetNum = new Map(
          inventories.map(inv => [inv.id, inv.set_num])
        );

        const { data: invMinifigs, error: imError } = await supabase
          .from('rb_inventory_minifigs')
          .select('inventory_id, fig_num')
          .in('inventory_id', invIds)
          .limit(6000);

        if (imError) {
          throw new Error(
            `Supabase rb_inventory_minifigs lookup failed: ${imError.message}`
          );
        }

        // Collect unique fig_nums for metadata lookup
        const themeMinifigFigNums = new Set<string>();
        const figNumToInvSetNum = new Map<string, string>();
        for (const row of invMinifigs ?? []) {
          themeMinifigFigNums.add(row.fig_num);
          const setNum = invToSetNum.get(row.inventory_id);
          if (setNum) figNumToInvSetNum.set(row.fig_num, setNum);
        }

        // Fetch metadata for these minifigs
        if (themeMinifigFigNums.size > 0) {
          const { data: figMeta } = await supabase
            .from('rb_minifigs')
            .select('fig_num, name, num_parts, bl_minifig_id')
            .in('fig_num', Array.from(themeMinifigFigNums));

          const figMetaMap = new Map((figMeta ?? []).map(f => [f.fig_num, f]));

          for (const row of invMinifigs ?? []) {
            const setNum = invToSetNum.get(row.inventory_id);
            const themeId = setNum ? themeBySet.get(setNum) : undefined;
            if (themeId == null) continue;

            const meta = figMetaMap.get(row.fig_num);
            const blId = meta?.bl_minifig_id ?? row.fig_num;

            const current = figThemeIds.get(blId) ?? new Set<number>();
            current.add(themeId);
            figThemeIds.set(blId, current);

            if (!candidateFigNums.has(blId)) {
              const themeMeta = getThemeMeta(themeId);
              addFig(
                blId,
                meta?.name ?? null,
                null,
                meta?.num_parts ?? null,
                themeMeta,
                { matchSource: 'theme' }
              );
            }
          }
        }
      }
    }
  }

  // Enrich all entries with theme meta when available
  for (const [figNum, result] of seen.entries()) {
    const themesForFig = figThemeIds.get(figNum);
    if (themesForFig && themesForFig.size > 0) {
      const firstThemeId = Array.from(themesForFig)[0];
      const meta = getThemeMeta(firstThemeId);
      seen.set(figNum, {
        ...result,
        themeName: meta.themeName ?? result.themeName ?? null,
        themePath: meta.themePath ?? result.themePath ?? null,
      });
    }
  }

  // Enrich search results with images from rb_minifig_images (batch)
  const blIdToFigNumAll = new Map<string, string>();
  for (const row of [
    ...(byName.data ?? []),
    ...(byBlId.data ?? []),
    ...(byFigNum.data ?? []),
  ]) {
    const blId = row.bl_minifig_id ?? row.fig_num;
    blIdToFigNumAll.set(blId, row.fig_num);
  }

  const itemsNeedingImages = Array.from(seen.entries()).filter(
    ([, result]) => !result.imageUrl
  );
  if (itemsNeedingImages.length > 0) {
    const figNumsForImages = itemsNeedingImages
      .map(([blId]) => blIdToFigNumAll.get(blId))
      .filter((v): v is string => Boolean(v));

    if (figNumsForImages.length > 0) {
      const { data: images } = await supabase
        .from('rb_minifig_images')
        .select('fig_num, image_url')
        .in('fig_num', figNumsForImages.slice(0, 200));

      if (images) {
        const imgByFigNum = new Map<string, string>();
        for (const img of images) {
          if (img.image_url) imgByFigNum.set(img.fig_num, img.image_url);
        }

        // Build reverse: fig_num → blId
        const figNumToBlIdImg = new Map<string, string>();
        for (const [blId, fn] of blIdToFigNumAll) {
          figNumToBlIdImg.set(fn, blId);
        }

        for (const [fn, imgUrl] of imgByFigNum) {
          const blId = figNumToBlIdImg.get(fn);
          if (blId) {
            const existing = seen.get(blId);
            if (existing && !existing.imageUrl) {
              seen.set(blId, { ...existing, imageUrl: imgUrl });
            }
          }
        }
      }
    }
  }

  let items = Array.from(seen.values());

  // Part counts are already available from rb_minifigs.num_parts
  // Supplement missing counts from rb_minifig_parts
  const missingCounts = items.filter(item => item.numParts == null);
  if (missingCounts.length > 0) {
    // Build a reverse map: blId → fig_num for lookup
    const blIdToFigNum = new Map<string, string>();
    for (const row of [
      ...(byName.data ?? []),
      ...(byBlId.data ?? []),
      ...(byFigNum.data ?? []),
    ]) {
      const blId = row.bl_minifig_id ?? row.fig_num;
      blIdToFigNum.set(blId, row.fig_num);
    }

    const figNumsForCount = missingCounts
      .map(item => blIdToFigNum.get(item.figNum))
      .filter((v): v is string => Boolean(v));

    if (figNumsForCount.length > 0) {
      const { data: partCounts } = await supabase
        .from('rb_minifig_parts')
        .select('fig_num')
        .in('fig_num', figNumsForCount.slice(0, 4000));

      if (partCounts) {
        const countByFig = new Map<string, number>();
        for (const row of partCounts) {
          const current = countByFig.get(row.fig_num) ?? 0;
          countByFig.set(row.fig_num, current + 1);
        }

        // Build reverse: fig_num → blId
        const figNumToBlId = new Map<string, string>();
        for (const [blId, fn] of blIdToFigNum) {
          figNumToBlId.set(fn, blId);
        }

        items = items.map(item => {
          if (item.numParts != null) return item;
          const fn = blIdToFigNum.get(item.figNum);
          if (fn && countByFig.has(fn)) {
            return { ...item, numParts: countByFig.get(fn)! };
          }
          return item;
        });
      }
    }
  }

  const sorted = sortMinifigResults(items, sort, trimmed);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = sorted.slice(start, end);
  const nextPage = end < sorted.length ? page + 1 : null;

  return { results: slice, nextPage };
}

export function sortMinifigResults(
  items: MinifigCatalogResult[],
  sort: MinifigSortOption,
  query: string
): MinifigCatalogResult[] {
  const queryLower = query.trim().toLowerCase();
  const normalizedQuery = normalizeText(query);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const isBricklinkIdQuery = isLikelyBricklinkFigId(query);

  if (sort === 'theme-asc' || sort === 'theme-desc') {
    return [...items].sort((a, b) => {
      const ta = (a.themePath ?? a.themeName ?? '').toLowerCase();
      const tb = (b.themePath ?? b.themeName ?? '').toLowerCase();
      if (ta === tb) return (a.name ?? '').localeCompare(b.name ?? '');
      return sort === 'theme-asc' ? ta.localeCompare(tb) : tb.localeCompare(ta);
    });
  }
  if (sort === 'name-asc' || sort === 'name-desc') {
    return [...items].sort((a, b) =>
      sort === 'name-asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    );
  }
  if (sort === 'parts-asc' || sort === 'parts-desc') {
    return [...items].sort((a, b) => {
      const pa = a.numParts ?? 0;
      const pb = b.numParts ?? 0;
      return sort === 'parts-asc' ? pa - pb : pb - pa;
    });
  }

  // Relevance: id/source signals, then name, then theme.
  return [...items]
    .map((item, idx) => {
      const nameNorm = normalizeText(item.name);
      const themeNorm = normalizeText(item.themePath ?? item.themeName ?? '');
      let score = 0;
      if (item.figNum.toLowerCase() === queryLower) {
        score += 15;
      } else if (item.figNum.toLowerCase().startsWith(queryLower)) {
        score += 8;
      }
      if (item.matchSource === 'bricklink-id') {
        score += 40;
        if (isBricklinkIdQuery) {
          score += 20;
        }
      } else if (item.matchSource === 'rebrickable-id') {
        score += 10;
      } else if (item.matchSource === 'name') {
        score += 4;
      } else if (item.matchSource === 'theme' && isBricklinkIdQuery) {
        score -= 5;
      }
      if (nameNorm.includes(normalizedQuery)) score += 2;
      if (
        compactQuery.length >= 2 &&
        nameNorm.replace(/\s+/g, '').includes(compactQuery)
      )
        score += 1;
      if (themeNorm.includes(normalizedQuery)) score += 2;
      return { item, idx, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    })
    .map(x => x.item);
}

export type LocalSetMinifig = {
  figNum: string;
  quantity: number;
};

/**
 * Get minifigs for a set using RB catalog data.
 * Returns BL minifig IDs (e.g., sw0001) via rb_minifigs.bl_minifig_id.
 */
export async function getSetMinifigsLocal(
  setNumber: string
): Promise<LocalSetMinifig[]> {
  const trimmed = setNumber.trim();
  if (!trimmed) return [];

  const supabase = getCatalogReadClient();

  // Get inventory IDs for this set
  const { data: inventories, error: invError } = await supabase
    .from('rb_inventories')
    .select('id')
    .eq('set_num', trimmed);

  if (invError) {
    throw new Error(
      `Supabase getSetMinifigsLocal rb_inventories failed: ${invError.message}`
    );
  }

  if (!inventories || inventories.length === 0) {
    return [];
  }

  const invIds = inventories.map(inv => inv.id);

  // Get minifigs from rb_inventory_minifigs
  const { data: invMinifigs, error: imError } = await supabase
    .from('rb_inventory_minifigs')
    .select('fig_num, quantity')
    .in('inventory_id', invIds);

  if (imError) {
    throw new Error(
      `Supabase getSetMinifigsLocal rb_inventory_minifigs failed: ${imError.message}`
    );
  }

  if (!invMinifigs || invMinifigs.length === 0) {
    return [];
  }

  // Get BL IDs for these fig_nums
  const figNums = [...new Set(invMinifigs.map(im => im.fig_num))];
  const { data: rbMinifigs } = await supabase
    .from('rb_minifigs')
    .select('fig_num, bl_minifig_id')
    .in('fig_num', figNums);

  const figToBlId = new Map<string, string>();
  for (const m of rbMinifigs ?? []) {
    figToBlId.set(m.fig_num, m.bl_minifig_id ?? m.fig_num);
  }

  // Aggregate by BL minifig ID
  const byFig = new Map<string, number>();
  for (const row of invMinifigs) {
    if (!row.fig_num) continue;
    const blId = figToBlId.get(row.fig_num) ?? row.fig_num;
    const current = byFig.get(blId) ?? 0;
    const q =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity)
        ? row.quantity
        : 0;
    byFig.set(blId, current + q);
  }

  return Array.from(byFig.entries())
    .map(([figNum, quantity]) => ({
      figNum,
      quantity,
    }))
    .sort((a, b) => a.figNum.localeCompare(b.figNum));
}

/**
 * Get or fetch a Rebrickable minifig image URL.
 *
 * 1. Checks rb_minifig_images cache
 * 2. On miss, fetches from the Rebrickable API and caches the result
 *
 * Returns null if both lookups fail.
 */
export async function getOrFetchMinifigImageUrl(
  figNum: string
): Promise<string | null> {
  const supabase = getCatalogReadClient();

  // Check cache first
  const { data: cached } = await supabase
    .from('rb_minifig_images')
    .select('image_url')
    .eq('fig_num', figNum)
    .maybeSingle();

  if (cached?.image_url) {
    return cached.image_url;
  }

  // Fetch from RB API
  const apiKey = process.env.REBRICKABLE_API;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://rebrickable.com/api/v3/lego/minifigs/${encodeURIComponent(figNum)}/?key=${apiKey}`
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { set_img_url?: string | null };
    const imgUrl = data.set_img_url ?? null;

    // Cache the result (best-effort, don't block on failure)
    if (imgUrl) {
      const writer = getCatalogWriteClient();
      writer
        .from('rb_minifig_images')
        .upsert(
          {
            fig_num: figNum,
            image_url: imgUrl,
            last_fetched_at: new Date().toISOString(),
          },
          { onConflict: 'fig_num' }
        )
        .then(({ error }) => {
          if (error) {
            logger.warn('minifig.image_cache_write_failed', {
              figNum,
              error: error.message,
            });
          }
        });
    }

    return imgUrl;
  } catch (err) {
    logger.warn('minifig.image_api_fetch_failed', {
      figNum,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Max set_count for a subpart to be considered "rare" enough to show. */
const RAREST_SUBPART_MAX_SET_COUNT = 10;

export type RarestSubpartSetsResult = {
  count: number | null;
  sets: PartInSet[];
};

/**
 * Find the rarest subpart of a minifig and return the sets it appears in.
 *
 * Steps:
 * 1. Get subpart (part_num, color_id) pairs from rb_minifig_parts
 * 2. Batch-query rb_part_rarity for set_count per subpart
 * 3. Pick subpart with minimum set_count (skip if > RAREST_SUBPART_MAX_SET_COUNT)
 * 4. Find sets containing that specific part+color via rb_inventory_parts → rb_inventories → rb_sets
 * 5. Filter out excludeSetNums (the minifig's own direct sets, already shown elsewhere)
 */
export async function getRarestSubpartSets(
  supabase: ReturnType<typeof getCatalogReadClient>,
  rbFigNum: string,
  excludeSetNums: Set<string>
): Promise<RarestSubpartSetsResult> {
  // 1. Get subparts
  const { data: subparts } = await supabase
    .from('rb_minifig_parts')
    .select('part_num, color_id')
    .eq('fig_num', rbFigNum);

  if (!subparts?.length) return { count: null, sets: [] };

  // 2. Batch-query rarity
  const orClauses = subparts.map(
    p => `and(part_num.eq.${p.part_num},color_id.eq.${p.color_id})`
  );
  const { data: rarityRows } = await supabase
    .from('rb_part_rarity')
    .select('part_num, color_id, set_count')
    .or(orClauses.join(','));

  if (!rarityRows?.length) return { count: null, sets: [] };

  // 3. Pick subpart with minimum set_count
  let minRow: (typeof rarityRows)[0] | null = null;
  for (const r of rarityRows) {
    if (minRow == null || r.set_count < minRow.set_count) {
      minRow = r;
    }
  }
  if (!minRow || minRow.set_count > RAREST_SUBPART_MAX_SET_COUNT) {
    return { count: minRow?.set_count ?? null, sets: [] };
  }

  // 4. Find sets containing this part+color (both direct and via minifig paths,
  //    matching how rb_part_rarity.set_count is computed)
  const [directResult, minifigPathResult] = await Promise.all([
    // Path A: Direct parts in set inventories
    supabase
      .from('rb_inventory_parts')
      .select('inventory_id')
      .eq('part_num', minRow.part_num)
      .eq('color_id', minRow.color_id),
    // Path B: Parts via minifigs → minifig inventories
    supabase
      .from('rb_minifig_parts')
      .select('fig_num')
      .eq('part_num', minRow.part_num)
      .eq('color_id', minRow.color_id),
  ]);

  // Resolve path A: inventory_ids → set_nums
  const directInvIds = [
    ...new Set((directResult.data ?? []).map(ip => ip.inventory_id)),
  ];

  // Resolve path B: fig_nums → inventory_minifigs → inventory_ids
  const figNums = [
    ...new Set((minifigPathResult.data ?? []).map(mp => mp.fig_num)),
  ];
  let minifigInvIds: number[] = [];
  if (figNums.length > 0) {
    const { data: invMinifigs } = await supabase
      .from('rb_inventory_minifigs')
      .select('inventory_id')
      .in('fig_num', figNums.slice(0, 200));
    minifigInvIds = [
      ...new Set((invMinifigs ?? []).map(im => im.inventory_id)),
    ];
  }

  const allInvIds = [...new Set([...directInvIds, ...minifigInvIds])];
  if (!allInvIds.length) return { count: minRow.set_count, sets: [] };

  const { data: inventories } = await supabase
    .from('rb_inventories')
    .select('set_num')
    .in('id', allInvIds.slice(0, 200))
    .not('set_num', 'like', 'fig-%');

  const setNums = [
    ...new Set(
      (inventories ?? [])
        .map(inv => inv.set_num)
        .filter(
          (s): s is string => typeof s === 'string' && !excludeSetNums.has(s)
        )
    ),
  ];

  if (!setNums.length) return { count: minRow.set_count, sets: [] };

  // 5. Get set details
  const { data: setDetails } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, image_url')
    .in('set_num', setNums.slice(0, 200));

  const sets: PartInSet[] = (setDetails ?? []).map(s => ({
    setNumber: s.set_num,
    name: s.name ?? s.set_num,
    year: s.year ?? 0,
    imageUrl: s.image_url ?? null,
    quantity: 1,
  }));

  // Sort by year descending
  sets.sort((a, b) => b.year - a.year);

  return { count: minRow.set_count, sets };
}
