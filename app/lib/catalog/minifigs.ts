import 'server-only';

import { getCatalogWriteClient } from '@/app/lib/db/catalogAccess';
import { normalizeText } from '@/app/lib/rebrickable';
import type { MinifigMatchSource, MinifigSortOption } from '@/app/types/search';

import {
  buildThemeMetaHelpers,
  getThemesLocal,
  type ThemeMeta,
} from './themes';

type MinifigRow = {
  fig_num: string;
  name: string;
  num_parts: number | null;
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

  const [byName, byId] = await Promise.all([
    supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts')
      .ilike('name', `%${trimmed}%`)
      .limit(300),
    supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts')
      .ilike('fig_num', `${trimmed}%`)
      .limit(150),
  ]);

  const seen = new Map<string, MinifigCatalogResult>();
  const candidateFigNums = new Set<string>();

  function addFig(
    row: MinifigRow,
    themeMeta?: ThemeMeta,
    options?: { matchSource?: MinifigMatchSource }
  ) {
    const numParts =
      typeof row.num_parts === 'number' && Number.isFinite(row.num_parts)
        ? row.num_parts
        : null;
    const existing = seen.get(row.fig_num);
    const preferredSource = chooseMatchSource(
      existing?.matchSource,
      options?.matchSource
    );
    const next: MinifigCatalogResult = {
      figNum: row.fig_num,
      name: row.name || row.fig_num,
      imageUrl: existing?.imageUrl ?? null,
      numParts,
      themeName: themeMeta?.themeName ?? existing?.themeName ?? null,
      themePath: themeMeta?.themePath ?? existing?.themePath ?? null,
    };
    if (preferredSource) {
      next.matchSource = preferredSource;
    }
    seen.set(row.fig_num, next);
    candidateFigNums.add(row.fig_num);
  }

  if (byName.error) {
    throw new Error(
      `Supabase minifig search by name failed: ${byName.error.message}`
    );
  }
  if (byId.error) {
    throw new Error(
      `Supabase minifig search by id failed: ${byId.error.message}`
    );
  }
  for (const row of byName.data ?? []) {
    addFig(row as MinifigRow, undefined, { matchSource: 'name' });
  }
  for (const row of byId.data ?? []) {
    addFig(row as MinifigRow, undefined, { matchSource: 'rebrickable-id' });
  }

  // Direct ID resolution: try exact RB fig_num, then BrickLink -> RB mapping.
  async function addByExactFigNum(
    figNum: string,
    options?: { matchSource?: MinifigMatchSource }
  ) {
    if (!figNum) return;
    if (candidateFigNums.has(figNum)) return;
    const { data, error } = await supabase
      .from('rb_minifigs')
      .select('fig_num, name, num_parts')
      .eq('fig_num', figNum)
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      addFig(data as MinifigRow, undefined, options);
    }
  }

  const trimmedLower = trimmed.toLowerCase();
  await addByExactFigNum(trimmed, { matchSource: 'rebrickable-id' });

  try {
    const { data: blMappings } = await supabase
      .from('bricklink_minifig_mappings')
      .select('rb_fig_id')
      .ilike('bl_item_id', `%${trimmedLower}%`)
      .limit(100);
    if (Array.isArray(blMappings)) {
      for (const row of blMappings) {
        if (row?.rb_fig_id) {
          await addByExactFigNum(row.rb_fig_id, {
            matchSource: 'bricklink-id',
          });
        }
      }
    }
  } catch {
    // ignore mapping errors
  }

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
      const { data: inventories, error: inventoriesError } = await supabase
        .from('rb_inventories')
        .select('id, set_num')
        .in('set_num', setNums)
        .limit(4000);
      if (inventoriesError) {
        throw new Error(
          `Supabase inventories lookup failed: ${inventoriesError.message}`
        );
      }
      const invToSet = new Map<number, string>();
      for (const inv of inventories ?? []) {
        if (typeof inv.id === 'number' && typeof inv.set_num === 'string') {
          invToSet.set(inv.id, inv.set_num);
        }
      }

      const inventoryIds = Array.from(invToSet.keys());
      if (inventoryIds.length > 0) {
        const { data: setMinifigs, error: setMinifigsError } = await supabase
          .from('rb_inventory_minifigs')
          .select('inventory_id, fig_num')
          .in('inventory_id', inventoryIds)
          .limit(6000);
        if (setMinifigsError) {
          throw new Error(
            `Supabase minifig inventory lookup failed: ${setMinifigsError.message}`
          );
        }
        for (const row of setMinifigs ?? []) {
          const setNum = invToSet.get(row.inventory_id);
          const themeId = setNum ? themeBySet.get(setNum) : undefined;
          if (themeId == null) continue;
          const current = figThemeIds.get(row.fig_num) ?? new Set<number>();
          current.add(themeId);
          figThemeIds.set(row.fig_num, current);
        }
      }
    }

    const figNumsFromThemes = Array.from(figThemeIds.keys());
    const missingFigNums = figNumsFromThemes.filter(
      fig => !candidateFigNums.has(fig)
    );
    if (missingFigNums.length > 0) {
      const { data: missingFigs, error: missingFigsError } = await supabase
        .from('rb_minifigs')
        .select('fig_num, name, num_parts')
        .in('fig_num', missingFigNums)
        .limit(2000);
      if (missingFigsError) {
        throw new Error(
          `Supabase minifig details lookup failed: ${missingFigsError.message}`
        );
      }
      for (const row of missingFigs ?? []) {
        const themeSet = figThemeIds.get(row.fig_num) ?? new Set<number>();
        const firstThemeId = Array.from(themeSet)[0];
        const meta =
          firstThemeId != null ? getThemeMeta(firstThemeId) : undefined;
        addFig(row as MinifigRow, meta, { matchSource: 'theme' });
      }
    }
  }

  // Enrich all entries with theme meta when available.
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
  if (items.length > 0) {
    const figNumsForImages = Array.from(
      new Set(items.map(item => item.figNum))
    );
    const { data: images, error: imageError } = await supabase
      .from('rb_minifig_images')
      .select('fig_num, image_url')
      .in('fig_num', figNumsForImages.slice(0, 4000));
    if (!imageError && images) {
      const imageByFig = new Map<string, string | null>(
        images.map(img => [img.fig_num, img.image_url ?? null])
      );
      items = items.map(item => ({
        ...item,
        imageUrl: item.imageUrl ?? imageByFig.get(item.figNum) ?? null,
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

export async function getSetMinifigsLocal(
  setNumber: string
): Promise<LocalSetMinifig[]> {
  const trimmed = setNumber.trim();
  if (!trimmed) return [];

  // rb_inventories / rb_inventory_minifigs are internal catalog tables
  // (RLS enabled, no anon/auth read policies) → requires service role
  const supabase = getCatalogWriteClient();

  const { data: inventories, error: invError } = await supabase
    .from('rb_inventories')
    .select('id')
    .eq('set_num', trimmed);

  if (invError) {
    throw new Error(
      `Supabase getSetMinifigsLocal rb_inventories failed: ${invError.message}`
    );
  }

  const inventoryIds = (inventories ?? []).map(row => row.id);
  if (!inventoryIds.length) {
    return [];
  }

  const { data: invMinifigs, error: figsError } = await supabase
    .from('rb_inventory_minifigs')
    .select('inventory_id,fig_num,quantity')
    .in('inventory_id', inventoryIds);

  if (figsError) {
    throw new Error(
      `Supabase getSetMinifigsLocal rb_inventory_minifigs failed: ${figsError.message}`
    );
  }

  if (!invMinifigs || invMinifigs.length === 0) {
    return [];
  }

  const byFig = new Map<string, number>();
  for (const row of invMinifigs) {
    if (!row.fig_num) continue;
    const current = byFig.get(row.fig_num) ?? 0;
    const q =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity)
        ? row.quantity
        : 0;
    byFig.set(row.fig_num, current + q);
  }

  return Array.from(byFig.entries()).map(([figNum, quantity]) => ({
    figNum,
    quantity,
  }));
}
