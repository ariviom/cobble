import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import {
  getCatalogReadClient,
  getCatalogWriteClient,
} from '@/app/lib/db/catalogAccess';
import type { PartInSet, SimpleSet } from '@/app/lib/rebrickable';
import {
  mapCategoryNameToParent,
  normalizeText,
  sortAggregatedResults,
} from '@/app/lib/rebrickable';
import { filterExactMatches } from '@/app/lib/searchExactMatch';
import type {
  MatchType,
  MinifigMatchSource,
  MinifigSortOption,
} from '@/app/types/search';
import type { Json } from '@/supabase/types';

type LocalTheme = {
  id: number;
  parent_id: number | null;
  name: string;
};

let localThemesCache:
  | {
      at: number;
      items: LocalTheme[];
    }
  | null = null;

const LOCAL_THEMES_TTL_MS = 60 * 60 * 1000;

export async function getThemesLocal(): Promise<LocalTheme[]> {
  const now = Date.now();
  if (localThemesCache && now - localThemesCache.at < LOCAL_THEMES_TTL_MS) {
    return localThemesCache.items;
  }

  // rb_themes is publicly readable (anon SELECT policy)
  const supabase = getCatalogReadClient();
  const { data, error } = await supabase
    .from('rb_themes')
    .select('id, parent_id, name')
    .limit(2000);

  if (error) {
    throw new Error(
      `Supabase getThemesLocal rb_themes failed: ${error.message}`
    );
  }

  const items = data ?? [];
  localThemesCache = { at: now, items };
  return items;
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

  // We fetch by set number prefix and by name contains, and merge with theme-
  // based matches, then sort in-memory for relevance and other sort modes.
  const [bySetNum, byName, themes] = await Promise.all([
    supabase
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .ilike('set_num', `${trimmed}%`)
      .limit(250),
    supabase
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .ilike('name', `%${trimmed}%`)
      .limit(250),
    getThemesLocal(),
  ]);

  if (bySetNum.error && !bySetNum.data && byName.error && !byName.data) {
    throw new Error(
      `Supabase searchSetsLocal failed: ${bySetNum.error?.message ?? ''} ${byName.error?.message ?? ''}`.trim()
    );
  }

  const themeById = new Map<number, LocalTheme>(
    (themes ?? []).map(t => [t.id, t])
  );
  const themePathCache = new Map<number, string>();

  function getThemeMeta(
    themeId: number | null | undefined
  ): { themeName: string | null; themePath: string | null } {
    if (themeId == null || !Number.isFinite(themeId)) {
      return { themeName: null, themePath: null };
    }
    const id = themeId as number;
    const theme = themeById.get(id);
    const themeName = theme?.name ?? null;

    let path: string | null = null;
    if (themePathCache.has(id)) {
      path = themePathCache.get(id) ?? null;
    } else if (theme) {
      const names: string[] = [];
      const visited = new Set<number>();
      let current: LocalTheme | null | undefined = theme;
      while (current && !visited.has(current.id)) {
        names.unshift(current.name);
        visited.add(current.id);
        if (current.parent_id != null) {
          current = themeById.get(current.parent_id) ?? null;
        } else {
          current = null;
        }
      }
      path = names.length > 0 ? names.join(' / ') : null;
      if (path != null) {
        themePathCache.set(id, path);
      }
    }

    return { themeName, themePath: path };
  }

  function getMatchTypeForTheme(
    themeId: number | null | undefined
  ): MatchType {
    if (themeId == null || !Number.isFinite(themeId)) {
      return 'theme';
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
      const existingType = existing.matchType ?? 'theme';
      if (MATCH_PRIORITY[matchType] > MATCH_PRIORITY[existingType]) {
        seen.set(key, { ...existing, matchType });
      }
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
    const matchingThemeIds = new Set<number>();

    for (const theme of themeById.values()) {
      const id = theme.id;
      const existingPath = themePathCache.get(id);
      const path =
        existingPath ??
        getThemeMeta(id).themePath ??
        null;
      if (!path) continue;
      const normalizedPath = normalizeText(path);
      const compactPath = normalizedPath.replace(/\s+/g, '');
      if (
        normalizedPath.includes(normalizedQuery) ||
        (compactQuery.length >= 3 && compactPath.includes(compactQuery))
      ) {
        matchingThemeIds.add(id);
      }
    }

    if (matchingThemeIds.size > 0) {
      const { data: byTheme, error: byThemeError } = await supabase
        .from('rb_sets')
        .select('set_num, name, year, num_parts, image_url, theme_id')
        .in('theme_id', Array.from(matchingThemeIds))
        .limit(500);

      if (byThemeError) {
        console.error(
          'Supabase searchSetsLocal theme search failed',
          byThemeError.message
        );
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

type MinifigRow = {
  fig_num: string;
  name: string;
  num_parts: number | null;
};

type ThemeMeta = { themeName: string | null; themePath: string | null };

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

function buildThemeMetaHelpers(themes: LocalTheme[]) {
  const themeById = new Map<number, LocalTheme>(themes.map(t => [t.id, t]));
  const themePathCache = new Map<number, string>();

  function getThemeMeta(
    themeId: number | null | undefined
  ): ThemeMeta {
    if (themeId == null || !Number.isFinite(themeId)) {
      return { themeName: null, themePath: null };
    }
    const id = themeId as number;
    const theme = themeById.get(id);
    const themeName = theme?.name ?? null;

    let path: string | null = null;
    if (themePathCache.has(id)) {
      path = themePathCache.get(id) ?? null;
    } else if (theme) {
      const names: string[] = [];
      const visited = new Set<number>();
      let current: LocalTheme | null | undefined = theme;
      while (current && !visited.has(current.id)) {
        names.unshift(current.name);
        visited.add(current.id);
        if (current.parent_id != null) {
          current = themeById.get(current.parent_id) ?? null;
        } else {
          current = null;
        }
      }
      path = names.length > 0 ? names.join(' / ') : null;
      if (path != null) {
        themePathCache.set(id, path);
      }
    }

    return { themeName, themePath: path };
  }

  function matchesTheme(queryNorm: string, compactQuery: string): Set<number> {
    const matching = new Set<number>();
    for (const theme of themes) {
      const { themeName, themePath } = getThemeMeta(theme.id);
      const raw = themePath ?? themeName ?? '';
      if (!raw) continue;
      const norm = normalizeText(raw);
      const compact = norm.replace(/\s+/g, '');
      if (
        norm.includes(queryNorm) ||
        (compactQuery.length >= 3 && compact.includes(compactQuery))
      ) {
        matching.add(theme.id);
      }
    }
    return matching;
  }

  return { getThemeMeta, matchesTheme };
}

export type MinifigCatalogResult = {
  figNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number | null;
  themeName?: string | null;
  themePath?: string | null;
  matchSource?: MinifigMatchSource;
};

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

  // Relevance: name contains query, figNum prefix, theme path contains query.
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
      if (compactQuery.length >= 2 && nameNorm.replace(/\s+/g, '').includes(compactQuery)) score += 1;
      if (themeNorm.includes(normalizedQuery)) score += 2;
      return { item, idx, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx;
    })
    .map(x => x.item);
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
  const pageSize = Math.max(
    1,
    Math.min(100, options?.pageSize ?? 20)
  );
  const sort = options?.sort ?? 'relevance';

  const normalizedQuery = normalizeText(trimmed);
  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const looksLikeBricklinkId = isLikelyBricklinkFigId(trimmed);

  const supabase = getCatalogWriteClient();
  const themes = await getThemesLocal();
  const { getThemeMeta, matchesTheme } = buildThemeMetaHelpers(themes);
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
      matchSource: preferredSource,
    };
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

  let figThemeIds = new Map<string, Set<number>>();

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
      if (
        typeof row.set_num === 'string' &&
        typeof row.theme_id === 'number'
      ) {
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

export async function getSetInventoryLocal(
  setNumber: string
): Promise<InventoryRow[]> {
  const trimmedSet = setNumber.trim();
  if (!trimmedSet) return [];

  // rb_set_parts, rb_parts, rb_colors, rb_part_categories are publicly readable
  const supabase = getCatalogReadClient();

  const { data: setParts, error: setPartsError } = await supabase
    .from('rb_set_parts')
    .select('part_num, color_id, quantity, is_spare')
    .eq('set_num', trimmedSet);

  if (setPartsError) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_set_parts failed: ${setPartsError.message}`
    );
  }

  const mainParts =
    setParts?.filter(row => row && row.is_spare === false) ?? [];
  if (mainParts.length === 0) return [];

  const partNums = Array.from(
    new Set(mainParts.map(row => row.part_num).filter(Boolean))
  );
  const colorIds = Array.from(
    new Set(mainParts.map(row => row.color_id).filter(id => id != null))
  );

  const [partsRes, colorsRes] = await Promise.all([
    partNums.length
      ? supabase
          .from('rb_parts')
          .select('part_num, name, part_cat_id, image_url, external_ids')
          .in('part_num', partNums)
      : Promise.resolve({ data: [], error: null } as {
          data: {
            part_num: string;
            name: string;
            part_cat_id: number | null;
            image_url: string | null;
            external_ids: Json;
          }[];
          error: null;
        }),
    colorIds.length
      ? supabase
          .from('rb_colors')
          .select('id, name')
          .in('id', colorIds)
      : Promise.resolve({ data: [], error: null } as {
          data: { id: number; name: string }[];
          error: null;
        }),
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
      external_ids: Json;
    }
  >();
  for (const part of parts) {
    partMap.set(part.part_num, part);
  }

  // Helper to extract BrickLink part ID from external_ids
  function extractBricklinkPartId(
    externalIds: Json | null | undefined
  ): string | null {
    if (!externalIds || typeof externalIds !== 'object') return null;
    const record = externalIds as Record<string, unknown>;
    const blIds = record.BrickLink as unknown;
    // BrickLink IDs can be an array ["3024"] or object {ext_ids: [...]}
    if (Array.isArray(blIds) && blIds.length > 0) {
      const first = blIds[0];
      return typeof first === 'string' || typeof first === 'number'
        ? String(first)
        : null;
    }
    if (blIds && typeof blIds === 'object' && 'ext_ids' in blIds) {
      const extIds = (blIds as { ext_ids?: unknown }).ext_ids;
      if (Array.isArray(extIds) && extIds.length > 0) {
        const first = extIds[0];
        return typeof first === 'string' || typeof first === 'number'
          ? String(first)
          : null;
      }
    }
    return null;
  }

  const colorMap = new Map<number, { id: number; name: string }>();
  for (const color of colors) {
    colorMap.set(color.id, color);
  }

  const categoryIds = Array.from(
    new Set(
      parts
        .map(p => p.part_cat_id)
        .filter((id): id is number => typeof id === 'number')
    )
  );

  const categoryMap = new Map<number, { id: number; name: string }>();
  if (categoryIds.length > 0) {
    const { data: categories, error: categoriesError } = await supabase
      .from('rb_part_categories')
      .select('id, name')
      .in('id', categoryIds);

    if (categoriesError) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_part_categories failed: ${categoriesError.message}`
      );
    }

    for (const cat of categories ?? []) {
      categoryMap.set(cat.id, cat);
    }
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
    const bricklinkPartId = extractBricklinkPartId(part?.external_ids);

    return {
      setNumber: trimmedSet,
      partId: row.part_num,
      partName: part?.name ?? row.part_num,
      colorId: row.color_id,
      colorName: color?.name ?? `Color ${row.color_id}`,
      quantityRequired: row.quantity,
      imageUrl: part?.image_url ?? null,
      elementId: null,
      ...(typeof catId === 'number' && { partCategoryId: catId }),
      ...(catName && { partCategoryName: catName }),
      ...(parentCategory && { parentCategory }),
      inventoryKey: `${row.part_num}:${row.color_id}`,
      // Only include bricklinkPartId if different from partId
      ...(bricklinkPartId && bricklinkPartId !== row.part_num && {
        bricklinkPartId,
      }),
    };
  });

  return rows;
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

function deriveRootThemeName(
  themeById: Map<number, LocalTheme>,
  themeId: number | null
): string | null {
  if (themeId == null || !Number.isFinite(themeId)) return null;
  const visited = new Set<number>();
  let current: LocalTheme | null | undefined = themeById.get(themeId) ?? null;
  let rootName: string | null = current?.name ?? null;
  while (current && current.parent_id != null && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = themeById.get(current.parent_id);
    if (!parent) break;
    rootName = parent.name ?? rootName;
    current = parent;
  }
  return rootName;
}

export async function getSetsForPartLocal(
  partNum: string,
  colorId?: number | null
): Promise<PartInSet[]> {
  const trimmed = partNum.trim();
  if (!trimmed) return [];

  const supabase = getCatalogReadClient();
  const query = supabase
    .from('rb_set_parts')
    .select(
      `
        set_num,
        quantity,
        color_id,
        rb_sets!inner (
          set_num,
          name,
          year,
          num_parts,
          image_url,
          theme_id
        )
      `
    )
    .eq('part_num', trimmed)
    .eq('is_spare', false)
    .limit(1000);

  if (typeof colorId === 'number') {
    query.eq('color_id', colorId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Supabase getSetsForPartLocal failed: ${error.message}`
    );
  }

  if (!data || data.length === 0) return [];

  const themes = await getThemesLocal();
  const themeById = new Map<number, LocalTheme>(
    (themes ?? []).map(t => [t.id, t])
  );

  const bySet = new Map<string, PartInSet>();

  for (const row of data) {
    const set = (row as unknown as { rb_sets?: Record<string, unknown> }).rb_sets;
    if (!set) continue;

    const setNum = String((set as { set_num?: unknown }).set_num ?? row.set_num ?? '').trim();
    if (!setNum) continue;

    const key = setNum.toLowerCase();
    const quantity =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity)
        ? row.quantity
        : 1;

    const rawThemeId =
      typeof (set as { theme_id?: unknown }).theme_id === 'number' &&
      Number.isFinite((set as { theme_id?: number }).theme_id)
        ? (set as { theme_id: number }).theme_id
        : null;
    const themeName = deriveRootThemeName(themeById, rawThemeId);

    const base: PartInSet = {
      setNumber: setNum,
      name: String((set as { name?: unknown }).name ?? setNum),
      year:
        typeof (set as { year?: unknown }).year === 'number' &&
        Number.isFinite((set as { year: number }).year)
          ? (set as { year: number }).year
          : 0,
      imageUrl:
        typeof (set as { image_url?: unknown }).image_url === 'string'
          ? ((set as { image_url: string }).image_url ?? null)
          : null,
      quantity,
      numParts:
        typeof (set as { num_parts?: unknown }).num_parts === 'number' &&
        Number.isFinite((set as { num_parts: number }).num_parts)
          ? (set as { num_parts: number }).num_parts
          : null,
      themeId: rawThemeId,
      themeName: themeName ?? null,
    };

    const existing = bySet.get(key);
    if (!existing) {
      bySet.set(key, base);
    } else {
      existing.quantity += base.quantity;
      if (existing.year === 0 && base.year !== 0) existing.year = base.year;
      if (existing.numParts == null && base.numParts != null) {
        existing.numParts = base.numParts;
      }
      if (!existing.themeId && base.themeId) existing.themeId = base.themeId;
      if (!existing.themeName && base.themeName) {
        existing.themeName = base.themeName;
      }
      if (!existing.imageUrl && base.imageUrl) existing.imageUrl = base.imageUrl;
      if (!existing.name && base.name) existing.name = base.name;
    }
  }

  return Array.from(bySet.values());
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



