import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { getBlMinifigImageUrl } from '@/app/lib/bricklink/minifigs';
import { normalizeText } from '@/app/lib/rebrickable';
import type { MinifigMatchSource, MinifigSortOption } from '@/app/types/search';

import {
  buildThemeMetaHelpers,
  getThemesLocal,
  type ThemeMeta,
} from './themes';

type BlMinifigRow = {
  minifig_no: string;
  name: string | null;
  image_url: string | null;
};

type BlCatalogRow = {
  item_id: string;
  name: string | null;
};

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
  'rebrickable-id': 3, // Legacy, not used in BL-only mode
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
 * Search minifigs using BrickLink data as the exclusive source.
 *
 * Sources:
 * - bricklink_minifigs: Full BL catalog
 * - bl_set_minifigs: Minifigs from synced sets (with images)
 *
 * Returns BL minifig IDs (e.g., sw0001, cty1234) - NO Rebrickable IDs.
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

  const supabase = getCatalogWriteClient();
  const themes = await getThemesLocal();
  const { getThemeMeta, matchesTheme } = buildThemeMetaHelpers(themes ?? []);

  const themeIds = looksLikeBricklinkId
    ? new Set<number>()
    : matchesTheme(normalizedQuery, compactQuery);

  // Search BL catalog and set minifigs
  const [catalogByName, catalogById, setMinifigsByName, setMinifigsById] =
    await Promise.all([
      // BL catalog by name
      supabase
        .from('bricklink_minifigs')
        .select('item_id, name')
        .ilike('name', `%${trimmed}%`)
        .limit(200),
      // BL catalog by ID
      supabase
        .from('bricklink_minifigs')
        .select('item_id, name')
        .ilike('item_id', `${trimmed}%`)
        .limit(100),
      // Set minifigs by name
      supabase
        .from('bl_set_minifigs')
        .select('minifig_no, name, image_url')
        .ilike('name', `%${trimmed}%`)
        .limit(200),
      // Set minifigs by ID
      supabase
        .from('bl_set_minifigs')
        .select('minifig_no, name, image_url')
        .ilike('minifig_no', `${trimmed}%`)
        .limit(100),
    ]);

  const seen = new Map<string, MinifigCatalogResult>();
  const candidateFigNums = new Set<string>();

  function addFig(
    blMinifigNo: string,
    name: string | null,
    imageUrl: string | null,
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
      imageUrl:
        imageUrl ?? existing?.imageUrl ?? getBlMinifigImageUrl(blMinifigNo),
      numParts: existing?.numParts ?? null,
      themeName: themeMeta?.themeName ?? existing?.themeName ?? null,
      themePath: themeMeta?.themePath ?? existing?.themePath ?? null,
    };
    if (preferredSource) {
      next.matchSource = preferredSource;
    }
    seen.set(blMinifigNo, next);
    candidateFigNums.add(blMinifigNo);
  }

  // Process catalog results
  if (catalogByName.error) {
    throw new Error(
      `Supabase BL catalog search by name failed: ${catalogByName.error.message}`
    );
  }
  if (catalogById.error) {
    throw new Error(
      `Supabase BL catalog search by id failed: ${catalogById.error.message}`
    );
  }
  for (const row of catalogByName.data ?? []) {
    const r = row as BlCatalogRow;
    addFig(r.item_id, r.name, null, undefined, { matchSource: 'name' });
  }
  for (const row of catalogById.data ?? []) {
    const r = row as BlCatalogRow;
    addFig(r.item_id, r.name, null, undefined, { matchSource: 'bricklink-id' });
  }

  // Process set minifig results
  if (setMinifigsByName.error) {
    throw new Error(
      `Supabase BL set minifigs search by name failed: ${setMinifigsByName.error.message}`
    );
  }
  if (setMinifigsById.error) {
    throw new Error(
      `Supabase BL set minifigs search by id failed: ${setMinifigsById.error.message}`
    );
  }
  for (const row of setMinifigsByName.data ?? []) {
    const r = row as BlMinifigRow;
    addFig(r.minifig_no, r.name, r.image_url, undefined, {
      matchSource: 'name',
    });
  }
  for (const row of setMinifigsById.data ?? []) {
    const r = row as BlMinifigRow;
    addFig(r.minifig_no, r.name, r.image_url, undefined, {
      matchSource: 'bricklink-id',
    });
  }

  // Direct ID resolution: try exact BL minifig_no
  async function addByExactMinifigNo(
    minifigNo: string,
    options?: { matchSource?: MinifigMatchSource }
  ) {
    if (!minifigNo) return;
    if (candidateFigNums.has(minifigNo)) return;

    // Try catalog first
    const { data: catalogData } = await supabase
      .from('bricklink_minifigs')
      .select('item_id, name')
      .eq('item_id', minifigNo)
      .limit(1)
      .maybeSingle();

    if (catalogData) {
      const r = catalogData as BlCatalogRow;
      addFig(r.item_id, r.name, null, undefined, options);
      return;
    }

    // Try set minifigs
    const { data: setData } = await supabase
      .from('bl_set_minifigs')
      .select('minifig_no, name, image_url')
      .eq('minifig_no', minifigNo)
      .limit(1)
      .maybeSingle();

    if (setData) {
      const r = setData as BlMinifigRow;
      addFig(r.minifig_no, r.name, r.image_url, undefined, options);
    }
  }

  await addByExactMinifigNo(trimmed, { matchSource: 'bricklink-id' });

  // Theme-based search (if query matches a theme)
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
      // Get minifigs from bl_set_minifigs for these sets
      const { data: setMinifigs, error: setMinifigsError } = await supabase
        .from('bl_set_minifigs')
        .select('set_num, minifig_no, name, image_url')
        .in('set_num', setNums)
        .limit(6000);
      if (setMinifigsError) {
        throw new Error(
          `Supabase BL set minifigs lookup failed: ${setMinifigsError.message}`
        );
      }
      for (const row of setMinifigs ?? []) {
        const themeId = themeBySet.get(row.set_num);
        if (themeId == null) continue;
        const current = figThemeIds.get(row.minifig_no) ?? new Set<number>();
        current.add(themeId);
        figThemeIds.set(row.minifig_no, current);

        // Add to results if not already present
        if (!candidateFigNums.has(row.minifig_no)) {
          const meta = getThemeMeta(themeId);
          addFig(row.minifig_no, row.name, row.image_url, meta, {
            matchSource: 'theme',
          });
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

  let items = Array.from(seen.values());

  // Fetch part counts from bl_minifig_parts
  if (items.length > 0) {
    const figNums = Array.from(new Set(items.map(item => item.figNum)));
    const { data: partCounts } = await supabase
      .from('bl_minifig_parts')
      .select('bl_minifig_no')
      .in('bl_minifig_no', figNums.slice(0, 4000));

    if (partCounts) {
      const countByFig = new Map<string, number>();
      for (const row of partCounts) {
        const current = countByFig.get(row.bl_minifig_no) ?? 0;
        countByFig.set(row.bl_minifig_no, current + 1);
      }
      items = items.map(item => ({
        ...item,
        numParts: countByFig.get(item.figNum) ?? item.numParts,
      }));
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
        score += 10; // Legacy, shouldn't happen in BL-only mode
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
 * Get minifigs for a set using BrickLink data.
 * Returns BL minifig IDs (e.g., sw0001).
 */
export async function getSetMinifigsLocal(
  setNumber: string
): Promise<LocalSetMinifig[]> {
  const trimmed = setNumber.trim();
  if (!trimmed) return [];

  const supabase = getCatalogWriteClient();

  const { data: setMinifigs, error } = await supabase
    .from('bl_set_minifigs')
    .select('minifig_no, quantity')
    .eq('set_num', trimmed);

  if (error) {
    throw new Error(
      `Supabase getSetMinifigsLocal bl_set_minifigs failed: ${error.message}`
    );
  }

  if (!setMinifigs || setMinifigs.length === 0) {
    return [];
  }

  // Aggregate by minifig_no (in case of duplicates)
  const byFig = new Map<string, number>();
  for (const row of setMinifigs) {
    if (!row.minifig_no) continue;
    const current = byFig.get(row.minifig_no) ?? 0;
    const q =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity)
        ? row.quantity
        : 0;
    byFig.set(row.minifig_no, current + q);
  }

  return Array.from(byFig.entries()).map(([figNum, quantity]) => ({
    figNum,
    quantity,
  }));
}
