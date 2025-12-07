import { logger } from '@/lib/metrics';
import 'server-only';

import { LRUCache } from '@/app/lib/cache/lru';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { filterExactMatches } from '@/app/lib/searchExactMatch';
import type { MatchType } from '@/app/types/search';

type RebrickableSetSearchResult = {
  set_num: string;
  name: string;
  year: number;
  num_parts: number;
  set_img_url: string | null;
  theme_id?: number;
};

type RebrickableSetInventoryItem = {
  color: { id: number; name: string };
  part: {
    part_num: string;
    name: string;
    part_img_url: string | null;
    part_cat_id?: number; // Not always present in parts listing; may require extra fetch if missing
    external_ids?: Record<string, unknown> | null;
  };
  /**
   * LEGO element ID for this part/color combination when provided by
   * Rebrickable's `/lego/sets/{set_num}/parts/` endpoint.
   *
   * We keep this optional because older API responses or non-standard
   * rows may omit it. When present, it feeds Pick-a-Brick CSV export.
   */
  element_id?: string | null;
  quantity: number;
  is_spare: boolean;
};

// The set minifigs endpoint shape can vary; capture common fields defensively
type RebrickableSetMinifigItem = {
  fig_num?: string;
  set_num?: string;
  set_name?: string;
  name?: string;
  quantity: number;
  set_img_url?: string | null;
  minifig?: {
    fig_num?: string;
    set_num?: string;
    name?: string;
    set_img_url?: string | null;
  };
};

type RebrickableMinifigComponent = {
  part: {
    part_num: string;
    name?: string;
    part_img_url?: string | null;
    part_cat_id?: number;
    external_ids?: Record<string, unknown> | null;
  };
  color?: {
    id: number;
    name: string;
  };
  quantity: number;
};

export type InventoryRow = {
  setNumber: string;
  partId: string;
  partName: string;
  colorId: number;
  colorName: string;
  quantityRequired: number;
  imageUrl: string | null;
  elementId?: string | null;
  partCategoryId?: number;
  partCategoryName?: string;
  parentCategory?:
    | 'Brick'
    | 'Plate'
    | 'Tile'
    | 'Slope'
    | 'Clip'
    | 'Hinge'
    | 'Bar'
    | 'Minifigure'
    | 'Technic'
    | 'Wheels'
    | 'Misc';
  inventoryKey: string;
  parentRelations?: Array<{ parentKey: string; quantity: number }>;
  componentRelations?: Array<{ key: string; quantity: number }>;
};

export async function searchSets(
  query: string,
  sort: string = 'relevance',
  page: number = 1,
  pageSize: number = 20
): Promise<{
  results: Array<{
    setNumber: string;
    name: string;
    year: number;
    numParts: number;
    imageUrl: string | null;
    themeId?: number | null;
  }>;
  nextPage: number | null;
}> {
  if (!query?.trim()) return { results: [], nextPage: null };

  const data = await rbFetch<{
    results: RebrickableSetSearchResult[];
    next: string | null;
  }>('/lego/sets/', { search: query, page_size: pageSize, page });

  let allResults = data.results
    .filter(r => r.num_parts > 0) // Exclude sets with 0 parts
    .map(r => ({
      setNumber: r.set_num,
      name: r.name,
      year: r.year,
      numParts: r.num_parts,
      imageUrl: r.set_img_url,
      themeId:
        typeof r.theme_id === 'number' && Number.isFinite(r.theme_id)
          ? r.theme_id
          : null,
    }));

  // Reorder slightly for set-number-like queries: prefix matches first, keep others
  const isSetNumberQuery = /^[0-9a-zA-Z-]+$/.test(query.trim());
  if (isSetNumberQuery) {
    const lower = query.toLowerCase();
    const prefix = allResults.filter(r =>
      r.setNumber.toLowerCase().startsWith(lower)
    );
    const rest = allResults.filter(
      r => !r.setNumber.toLowerCase().startsWith(lower)
    );
    allResults = [...prefix, ...rest];
  }

  // Sort function based on sort parameter (applies within this page)
  function sortResults(results: typeof allResults) {
    switch (sort) {
      case 'pieces-asc':
        return [...results].sort((a, b) => a.numParts - b.numParts);
      case 'pieces-desc':
        return [...results].sort((a, b) => b.numParts - a.numParts);
      case 'year-asc':
        return [...results].sort((a, b) => a.year - b.year);
      case 'year-desc':
        return [...results].sort((a, b) => b.year - a.year);
      default: // 'relevance'
        return results; // Keep API order
    }
  }

  const sorted = sortResults(allResults);
  const nextPage = data.next ? page + 1 : null;

  return { results: sorted, nextPage };
}

// ---- Aggregated search (server-side pagination & stable sorting) ----

export type SimpleSet = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId?: number | null;
  /**
   * Human-readable theme for this set, when available. Derived from theme_id.
   */
  themeName?: string | null;
  /**
   * Full theme path including parents, e.g. "Star Wars / Episode IV-VI".
   * Used for matching theme + subtheme keywords in search.
   */
  themePath?: string | null;
  /**
   * Whether the result matched directly on set metadata or via a theme match.
   */
  matchType?: MatchType;
};

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 100;
const SEARCH_AGG_PAGE_SIZE = 200;
const SEARCH_AGG_CAP = 1000;

/** LRU cache for aggregated search results with TTL and size limit */
const aggregatedSearchCache = new LRUCache<string, SimpleSet[]>(
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_TTL_MS
);

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function sortAggregatedResults(
  items: SimpleSet[],
  sort: string,
  query: string
): SimpleSet[] {
  if (sort === 'pieces-asc') {
    return [...items].sort((a, b) => a.numParts - b.numParts);
  }
  if (sort === 'pieces-desc') {
    return [...items].sort((a, b) => b.numParts - a.numParts);
  }
  if (sort === 'year-asc') {
    return [...items].sort((a, b) => a.year - b.year);
  }
  if (sort === 'year-desc') {
    return [...items].sort((a, b) => b.year - a.year);
  }
  // 'relevance' (stable): boost setNumber prefix, then name/setNumber contains, else keep API order
  const qn = normalizeText(query);
  return [...items]
    .map((it, idx) => {
      const num = it.setNumber.toLowerCase();
      const nameN = normalizeText(it.name);
      const numN = normalizeText(it.setNumber);
      const themeNameN =
        typeof it.themeName === 'string' && it.themeName
          ? normalizeText(it.themeName)
          : '';
      const themePathN =
        typeof it.themePath === 'string' && it.themePath
          ? normalizeText(it.themePath)
          : '';
      let score = 0;
      if (num.startsWith(query.toLowerCase())) score += 3;
      if (nameN.includes(qn)) score += 2;
      if (numN.includes(qn)) score += 1;
      // Theme-based relevance boosts: allow theme + subtheme keywords to surface sets.
      if (themeNameN && themeNameN.includes(qn)) score += 2;
      if (themePathN && themePathN.includes(qn)) score += 2;
      return { it, idx, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.idx - b.idx; // stable
    })
    .map(x => x.it);
}

export async function getAggregatedSearchResults(
  query: string,
  sort: string,
  options?: { exactMatch?: boolean }
): Promise<SimpleSet[]> {
  const normalizedQuery = query.trim();
  const exactMatch = options?.exactMatch ?? false;
  const normalizedQueryText = normalizeText(normalizedQuery);
  const compactQueryText = normalizedQueryText.replace(/\s+/g, '');
  const cacheKey = `${sort}::${normalizedQuery.toLowerCase()}::${
    exactMatch ? 'exact' : 'loose'
  }`;
  // Cache disabled by default to avoid stale prod responses; allow opt-in via env.
  const useCache = process.env.SEARCH_CACHE_ENABLED === 'true';
  const cached = useCache ? aggregatedSearchCache.get(cacheKey) : null;
  if (cached) {
    return cached;
  }

  if (!normalizedQuery) return [];

  // Fetch pages from Rebrickable up to cap
  let first = true;
  let nextUrl: string | null = null;
  const collected: RebrickableSetSearchResult[] = [];
  const matchTypeBySet = new Map<string, MatchType>();
  const MATCH_PRIORITY: Record<MatchType, number> = {
    set: 3,
    subtheme: 2,
    theme: 1,
  };

  function setMatchType(key: string, matchType: MatchType) {
    const existing = matchTypeBySet.get(key);
    if (!existing || MATCH_PRIORITY[matchType] > MATCH_PRIORITY[existing]) {
      matchTypeBySet.set(key, matchType);
    }
  }

  try {
    while (first || nextUrl) {
      const page: {
        results: RebrickableSetSearchResult[];
        next: string | null;
      } = first
        ? await rbFetch<{
            results: RebrickableSetSearchResult[];
            next: string | null;
          }>('/lego/sets/', {
            search: normalizedQuery,
            page_size: SEARCH_AGG_PAGE_SIZE,
          })
        : await rbFetchAbsolute<{
            results: RebrickableSetSearchResult[];
            next: string | null;
          }>(nextUrl!);
      collected.push(...page.results);
      for (const result of page.results) {
        const key = result.set_num.toLowerCase();
        setMatchType(key, 'set');
      }
      nextUrl = page.next;
      first = false;
      if (collected.length >= SEARCH_AGG_CAP) break;
    }
  } catch (err) {
    if (
      err instanceof Error &&
      err.message?.includes('403') &&
      /\s/.test(normalizedQuery)
    ) {
      const tokens = normalizedQuery
        .split(/\s+/)
        .map(tok => tok.trim().toLowerCase())
        .filter(Boolean);
      if (tokens.length === 0) return [];
      const union = new Map<string, SimpleSet>();
      for (const token of tokens) {
        try {
          const page = await searchSets(token, sort, 1, 40);
          for (const result of page.results) {
            if (!union.has(result.setNumber)) {
              const themeId =
                typeof result.themeId === 'number' &&
                Number.isFinite(result.themeId)
                  ? result.themeId
                  : null;
              union.set(result.setNumber, {
                setNumber: result.setNumber,
                name: result.name,
                year: result.year,
                numParts: result.numParts,
                imageUrl: result.imageUrl,
                themeId,
                matchType: 'set',
              });
            }
          }
        } catch (innerErr) {
          console.error('Tokenized search failed', {
            token,
            error: innerErr instanceof Error ? innerErr.message : innerErr,
          });
        }
      }
      let filtered = [...union.values()].filter(set =>
        tokens.every(tok => set.name.toLowerCase().includes(tok))
      );
      if (exactMatch) {
        filtered = filterExactMatches(filtered, normalizedQuery);
      }
      if (useCache) {
        aggregatedSearchCache.set(cacheKey, filtered);
      }
      return filtered;
    }
    throw err;
  }

  // Load themes to (a) support theme-based keyword matching and (b) exclude
  // non-set categories like Books and Gear.
  const themes = await getThemes();
  const themeById = new Map<number, RebrickableTheme>(
    themes.map(t => [t.id, t])
  );
  const themePathCache = new Map<number, string>();
  const EXCLUDED_THEME_KEYWORDS = [
    'book',
    'books',
    'gear',
    'supplemental',
    'service pack',
    'service packs',
    'packaging',
    'key chain',
    'key chains',
    'magnet',
    'magnets',
    'storage',
    'watch',
    'clock',
    'poster',
    'sticker',
    'game',
    'games',
  ];

  // Expand results for pure theme- and subtheme-style queries by matching the
  // query against the full theme path (e.g., "Star Wars / Episode IV-VI") and
  // then loading sets for those themes directly. This is especially important
  // for themes like "Aquazone" where the theme name may not appear in set
  // names, so Rebrickable's built-in search returns no results.
  // Helper to resolve theme name and full path for a given theme ID.
  // Defined at function scope so it can be used throughout the function.
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
      let current: RebrickableTheme | null | undefined = theme;
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

  function getMatchTypeForThemeId(
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

  if (compactQueryText.length >= 3) {
    const matchingThemeIds = new Set<number>();

    for (const t of themes) {
      const { themeName, themePath } = getThemeMeta(t.id);
      const raw = themePath ?? themeName ?? '';
      if (!raw) continue;
      const norm = normalizeText(raw);
      const compact = norm.replace(/\s+/g, '');
      if (
        norm.includes(normalizedQueryText) ||
        compact.includes(compactQueryText)
      ) {
        matchingThemeIds.add(t.id);
      }
    }

    if (matchingThemeIds.size > 0) {
      const seenSetNums = new Set<string>(
        collected.map(r => r.set_num.toLowerCase())
      );
      for (const themeId of matchingThemeIds) {
        try {
          let firstTheme = true;
          let nextThemeUrl: string | null = null;
          while (firstTheme || nextThemeUrl) {
            const page:
              | {
                  results: RebrickableSetSearchResult[];
                  next: string | null;
                }
              | undefined = firstTheme
              ? await rbFetch<{
                  results: RebrickableSetSearchResult[];
                  next: string | null;
                }>('/lego/sets/', {
                  theme_id: themeId,
                  page_size: SEARCH_AGG_PAGE_SIZE,
                })
              : await rbFetchAbsolute<{
                  results: RebrickableSetSearchResult[];
                  next: string | null;
                }>(nextThemeUrl!);

            if (!page) break;
            for (const r of page.results) {
              const key = r.set_num.toLowerCase();
              if (!seenSetNums.has(key)) {
                collected.push(r);
                seenSetNums.add(key);
              }
              setMatchType(key, getMatchTypeForThemeId(themeId));
              if (collected.length >= SEARCH_AGG_CAP) break;
            }
            if (collected.length >= SEARCH_AGG_CAP || !page.next) break;
            nextThemeUrl = page.next;
            firstTheme = false;
          }
        } catch (err) {
          // Theme-based expansion is best-effort; log and continue on failure.
          if (process.env.NODE_ENV !== 'production') {
            try {
              console.error('Theme-based set fetch failed', {
                themeId,
                error: err instanceof Error ? err.message : String(err),
              });
            } catch {
              // ignore logging failures
            }
          }
        }
        if (collected.length >= SEARCH_AGG_CAP) break;
      }
    }
  }

  let mapped: SimpleSet[] = collected
    .filter(r => r.num_parts > 0)
    .filter(r => {
      const themeId =
        typeof r.theme_id === 'number' && Number.isFinite(r.theme_id)
          ? r.theme_id
          : null;
      const { themeName, themePath } = getThemeMeta(themeId);
      const haystack = (themePath ?? themeName ?? '').toLowerCase();
      if (!haystack) return true;
      const tn = haystack;
      return !EXCLUDED_THEME_KEYWORDS.some(k => tn.includes(k));
    })
    .slice(0, SEARCH_AGG_CAP)
    .map(r => {
      const themeId =
        typeof r.theme_id === 'number' && Number.isFinite(r.theme_id)
          ? r.theme_id
          : null;
      const { themeName, themePath } = getThemeMeta(themeId);
      const key = r.set_num.toLowerCase();
      return {
        setNumber: r.set_num,
        name: r.name,
        year: r.year,
        numParts: r.num_parts,
        imageUrl: r.set_img_url,
        themeId,
        themeName,
        themePath,
        matchType: matchTypeBySet.get(key) ?? 'set',
      };
    });

  if (exactMatch) {
    mapped = filterExactMatches(mapped, normalizedQuery);
  }
  if (mapped.length === 0) {
    if (useCache) {
      aggregatedSearchCache.set(cacheKey, []);
    }
    return [];
  }
  const sorted = sortAggregatedResults(mapped, sort, normalizedQuery);
  if (useCache) {
    aggregatedSearchCache.set(cacheKey, sorted);
  }
  return sorted;
}

// Helper to extract BrickLink part ID from external_ids
function extractBricklinkPartId(
  externalIds: Record<string, unknown> | null | undefined
): string | null {
  if (!externalIds) return null;
  const blIds = externalIds.BrickLink;
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

export async function getSetInventory(
  setNumber: string
): Promise<InventoryRow[]> {
  type Page = { results: RebrickableSetInventoryItem[]; next: string | null };

  // Fetch all pages of parts for the set with external_ids included
  const firstPage = await rbFetch<Page>(
    `/lego/sets/${encodeURIComponent(setNumber)}/parts/`,
    { page_size: 1000, inc_part_details: 1 }
  );
  const allItems: RebrickableSetInventoryItem[] = [...firstPage.results];
  let nextUrl: string | null = firstPage.next;
  while (nextUrl) {
    const page = await rbFetchAbsolute<Page>(nextUrl);
    allItems.push(...page.results);
    nextUrl = page.next;
  }

  const cats = await getPartCategories();
  const idToName = new Map<number, string>(cats.map(c => [c.id, c.name]));

  const partRows = allItems
    .filter(i => !i.is_spare)
    .map(i => {
      const catId = i.part.part_cat_id;
      const catName = catId != null ? idToName.get(catId) : undefined;
      const parentCategory =
        catName != null ? mapCategoryNameToParent(catName) : undefined;
      const inventoryKey = `${i.part.part_num}:${i.color.id}`;
      const bricklinkPartId = extractBricklinkPartId(i.part.external_ids);
      return {
        setNumber,
        partId: i.part.part_num,
        partName: i.part.name,
        colorId: i.color.id,
        colorName: i.color.name,
        quantityRequired: i.quantity,
        imageUrl: i.part.part_img_url,
        elementId: i.element_id ?? null,
        ...(catId != null && { partCategoryId: catId }),
        ...(catName && { partCategoryName: catName }),
        ...(parentCategory && { parentCategory }),
        inventoryKey,
        // Only include bricklinkPartId if different from partId
        ...(bricklinkPartId && bricklinkPartId !== i.part.part_num && {
          bricklinkPartId,
        }),
      } satisfies InventoryRow;
    });

  const partRowMap = new Map<string, InventoryRow>();
  const regularInventoryKeys = new Set<string>();
  partRows.forEach(row => {
    partRowMap.set(row.inventoryKey, row);
    regularInventoryKeys.add(row.inventoryKey);
  });

  // Fetch all minifigs for the set (separate endpoint) and map them into rows
  type MinifigPage = {
    results: RebrickableSetMinifigItem[];
    next: string | null;
  };
  const firstMinifigs = await rbFetch<MinifigPage>(
    `/lego/sets/${encodeURIComponent(setNumber)}/minifigs/`,
    { page_size: 1000 }
  );
  const allMinifigs: RebrickableSetMinifigItem[] = [...firstMinifigs.results];
  let nextMinUrl: string | null = firstMinifigs.next;
  while (nextMinUrl) {
    const pg = await rbFetchAbsolute<MinifigPage>(nextMinUrl);
    allMinifigs.push(...pg.results);
    nextMinUrl = pg.next;
  }

  const minifigParents: InventoryRow[] = [];
  const orphanComponents: InventoryRow[] = [];
  const addedComponentKeys = new Set<string>();

  for (let idx = 0; idx < allMinifigs.length; idx++) {
    const entry = allMinifigs[idx]!;
    const rawId =
      entry.fig_num ??
      entry.set_num ??
      entry.minifig?.fig_num ??
      entry.minifig?.set_num ??
      '';
    const figNum = rawId && rawId.trim() ? rawId.trim() : `unknown-${idx + 1}`;
    const parentKey = `fig:${figNum}`;
    const figName =
      entry.name ?? entry.set_name ?? entry.minifig?.name ?? 'Minifigure';
    const imgUrl = entry.set_img_url ?? entry.minifig?.set_img_url ?? null;
    const parentQuantity = entry.quantity ?? 1;
    const parentRow: InventoryRow = {
      setNumber,
      partId: parentKey,
      partName: figName,
      colorId: 0,
      colorName: '—',
      quantityRequired: parentQuantity,
      imageUrl: imgUrl,
      partCategoryName: 'Minifig',
      parentCategory: 'Minifigure',
      inventoryKey: parentKey,
      componentRelations: [],
    };

    if (figNum && !figNum.startsWith('unknown')) {
      try {
        const components = await getMinifigPartsCached(figNum);
        for (const component of components) {
          if (!component?.part?.part_num) continue;
          const perParentQty = Math.max(1, Math.floor(component.quantity ?? 1));
          const colorId =
            component.color && typeof component.color.id === 'number'
              ? component.color.id
              : 0;
          const colorName =
            component.color && typeof component.color.name === 'string'
              ? component.color.name
              : '—';
          const baseKey = `${component.part.part_num}:${colorId}`;
          const existingRow = partRowMap.get(baseKey);
          if (existingRow) {
            // Part already exists. Check if it came from regular inventory or another minifigure.
            const isFromRegularInventory = regularInventoryKeys.has(baseKey);
            if (!isFromRegularInventory) {
              // Part came from another minifigure, so aggregate quantities across minifigures
              // Don't multiply by parentQuantity - aggregate per minifigure instance
              existingRow.quantityRequired += perParentQty;
            }
            // Always track parentRelation for minifigure completion logic
            if (!existingRow.parentRelations) {
              existingRow.parentRelations = [];
            }
            existingRow.parentRelations.push({ parentKey, quantity: perParentQty });
            parentRow.componentRelations!.push({
              key: existingRow.inventoryKey,
              quantity: perParentQty,
            });
          } else {
            // Create new row using baseKey (same format as regular parts) to avoid duplicates
            const inventoryKey = baseKey;
            const catId = component.part.part_cat_id;
            const resolvedCategoryName =
              catId != null
                ? (idToName.get(catId) ?? 'Minifig Component')
                : 'Minifig Component';
            const bricklinkPartId = extractBricklinkPartId(component.part.external_ids);

            const childRow: InventoryRow = {
              setNumber,
              partId: component.part.part_num,
              partName: component.part.name ?? component.part.part_num,
              colorId,
              colorName,
              // Don't multiply by parentQuantity - use per minifigure instance quantity
              quantityRequired: perParentQty,
              imageUrl: component.part.part_img_url ?? null,
              ...(catId != null && { partCategoryId: catId }),
              partCategoryName: resolvedCategoryName,
              parentCategory: 'Minifigure',
              inventoryKey,
              parentRelations: [{ parentKey, quantity: perParentQty }],
              // Only include bricklinkPartId if different from partId
              ...(bricklinkPartId && bricklinkPartId !== component.part.part_num && {
                bricklinkPartId,
              }),
            };
            parentRow.componentRelations!.push({
              key: inventoryKey,
              quantity: perParentQty,
            });
            partRowMap.set(inventoryKey, childRow);
            // Only add to orphanComponents if we haven't added this key yet
            if (!addedComponentKeys.has(inventoryKey)) {
              orphanComponents.push(childRow);
              addedComponentKeys.add(inventoryKey);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch minifig parts', {
          figNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    minifigParents.push(parentRow);
  }

  return [...partRows, ...orphanComponents, ...minifigParents];
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const MINIFIG_CACHE_MAX_ENTRIES = 500;

/** LRU cache for minifig parts with 1 hour TTL and size limit */
const minifigPartsCache = new LRUCache<string, RebrickableMinifigComponent[]>(
  MINIFIG_CACHE_MAX_ENTRIES,
  ONE_HOUR_MS
);

let setSummaryCache: {
  at: number;
  items: Map<
    string,
    {
      setNumber: string;
      name: string;
      year: number;
      numParts: number;
      imageUrl: string | null;
      themeId: number | null;
      themeName: string | null;
    }
  >;
} | null = null;

export async function getSetSummary(setNumber: string): Promise<{
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
}> {
  const now = Date.now();
  const ttl = 60 * 60 * 1000; // 1h
  if (setSummaryCache && now - setSummaryCache.at < ttl) {
    const cached = setSummaryCache.items.get(setNumber.toLowerCase());
    if (cached) return cached;
  }
  const d = await rbFetch<RebrickableSetSearchResult>(
    `/lego/sets/${encodeURIComponent(setNumber)}/`
  );

  // Normalize theme id first.
  const rawThemeId =
    typeof d.theme_id === 'number' && Number.isFinite(d.theme_id)
      ? d.theme_id
      : null;

  // Resolve root theme name using cached Rebrickable themes when available.
  let themeName: string | null = null;
  if (rawThemeId != null) {
    try {
      const themes = await getThemes();
      const themeById = new Map<number, RebrickableTheme>(
        themes.map(t => [t.id, t])
      );
      let current: RebrickableTheme | null | undefined =
        themeById.get(rawThemeId) ?? null;
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
      // If theme lookup fails, keep themeName as null.
      themeName = null;
    }
  }

  const result = {
    setNumber: d.set_num,
    name: d.name,
    year: d.year,
    numParts: d.num_parts,
    imageUrl: d.set_img_url,
    themeId: rawThemeId,
    themeName,
  };
  if (!setSummaryCache || now - setSummaryCache.at >= ttl) {
    setSummaryCache = { at: now, items: new Map() };
  }
  setSummaryCache.items.set(setNumber.toLowerCase(), result);
  return result;
}

type RebrickableCategory = { id: number; name: string };

let categoriesCache: { at: number; items: RebrickableCategory[] } | null = null;

export async function getPartCategories(): Promise<RebrickableCategory[]> {
  const now = Date.now();
  if (categoriesCache && now - categoriesCache.at < 60 * 60 * 1000) {
    return categoriesCache.items;
  }
  const data = await rbFetch<{ results: RebrickableCategory[] }>(
    '/lego/part_categories/',
    { page_size: 1000 }
  );
  categoriesCache = { at: now, items: data.results };
  return data.results;
}

export type RebrickablePart = {
  part_num: string;
  name: string;
  part_cat_id?: number;
  part_img_url: string | null;
  print_of?: string | null;
  external_ids?: Record<string, unknown>;
};

export async function getPart(partNum: string): Promise<RebrickablePart> {
  return rbFetch<RebrickablePart>(
    `/lego/parts/${encodeURIComponent(partNum)}/`,
    { inc_part_details: 1 }
  );
}

type RebrickablePartListItem = {
  part_num: string;
  name: string;
  part_img_url: string | null;
};

export async function searchParts(
  query: string,
  pageSize: number = 25
): Promise<RebrickablePartListItem[]> {
  if (!query.trim()) return [];
  const data = await rbFetch<{ results: RebrickablePartListItem[] }>(
    `/lego/parts/`,
    {
      search: query,
      page_size: Math.max(1, Math.min(100, pageSize)),
    }
  );
  return data.results ?? [];
}

type RebrickableMinifigSearchResult = {
  fig_num?: string;
  set_num?: string;
  name: string;
  num_parts?: number;
  set_img_url?: string | null;
};

export async function searchMinifigs(
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<{
  results: {
    figNum: string;
    name: string;
    imageUrl: string | null;
    numParts: number | null;
  }[];
  nextPage: number | null;
}> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { results: [], nextPage: null };
  }
  const data = await rbFetch<{
    results: RebrickableMinifigSearchResult[];
    next: string | null;
  }>('/lego/minifigs/', {
    search: trimmed,
    page_size: Math.max(1, Math.min(100, pageSize)),
    page,
  });

  const mapped =
    data.results?.map(result => {
      const rawId =
        (typeof result.fig_num === 'string' && result.fig_num.trim()) ||
        (typeof result.set_num === 'string' && result.set_num.trim()) ||
        '';
      const figNum = rawId || '';
      const name = result.name || figNum || trimmed;
      const numParts =
        typeof result.num_parts === 'number' && Number.isFinite(result.num_parts)
          ? result.num_parts
          : null;
      const imageUrl =
        typeof result.set_img_url === 'string' ? result.set_img_url : null;
      return {
        figNum,
        name,
        imageUrl,
        numParts,
      };
    }) ?? [];

  const results = mapped.filter(r => r.figNum);
  const nextPage = data.next ? page + 1 : null;
  return { results, nextPage };
}

export type ResolvedPart = {
  partNum: string;
  name: string;
  imageUrl: string | null;
};

const RESOLVED_PART_CACHE_MAX_ENTRIES = 1000;
const RESOLVED_PART_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** LRU cache for resolved part lookups with 24 hour TTL and size limit */
const resolvedPartCache = new LRUCache<string, ResolvedPart | null>(
  RESOLVED_PART_CACHE_MAX_ENTRIES,
  RESOLVED_PART_CACHE_TTL_MS
);

/**
 * Resolve arbitrary part identifier (e.g., BrickLink-style id like "2336p68")
 * to a Rebrickable part using direct fetch, then Rebrickable search fallback.
 * Results are cached in-memory for 24 hours.
 */
export async function resolvePartIdToRebrickable(
  partId: string,
  hints?: { bricklinkId?: string }
): Promise<ResolvedPart | null> {
  const key = partId.trim().toLowerCase();
  // Check cache first - LRU cache handles TTL internally
  if (resolvedPartCache.has(key)) {
    return resolvedPartCache.get(key) ?? null;
  }
  // 0) External ID (BrickLink) hint FIRST when available
  if (hints?.bricklinkId) {
    try {
      const alt = await rbFetch<{ results: RebrickablePart[] }>(
        `/lego/parts/`,
        {
          bricklink_id: hints.bricklinkId,
          page_size: 5,
          inc_part_details: 1,
        }
      );
      if (Array.isArray(alt.results) && alt.results.length > 0) {
        const p = alt.results[0]!;
        const result: ResolvedPart = {
          partNum: p.part_num,
          name: p.name,
          imageUrl: p.part_img_url,
        };
        resolvedPartCache.set(key, result);
        return result;
      }
    } catch {
      // ignore and try other methods
    }
  }
  // 1) Direct fetch
  try {
    const part = await getPart(partId);
    const result: ResolvedPart = {
      partNum: part.part_num,
      name: part.name,
      imageUrl: part.part_img_url,
    };
    resolvedPartCache.set(key, result);
    return result;
  } catch {
    // fall through to search
  }
  // 2) Search fallback
  try {
    const list = await searchParts(partId, 25);
    if (list.length > 0) {
      // Prefer exact case-insensitive part_num match
      const exact =
        list.find(p => p.part_num.toLowerCase() === key) ??
        // Then startsWith to catch extended variants
        list.find(p => p.part_num.toLowerCase().startsWith(key)) ??
        // Otherwise take the first returned item
        list[0];
      const result: ResolvedPart = {
        partNum: exact.part_num,
        name: exact.name,
        imageUrl: exact.part_img_url,
      };
      resolvedPartCache.set(key, result);
      return result;
    }
  } catch {
    // continue to external-id path
  }
  resolvedPartCache.set(key, null);
  return null;
}

export type PartInSet = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  /**
   * Count of this part in the set.
   */
  quantity: number;
  /**
   * Total part count for the set (parity with search cards). Optional because
   * the Rebrickable part-sets endpoints do not include it.
   */
  numParts?: number | null;
  themeId?: number | null;
  themeName?: string | null;
};

export async function getSetsForPart(
  partNum: string,
  colorId?: number
): Promise<PartInSet[]> {
  // 1h TTL cache with brief negative TTL to reduce thrash on empty results
  const SETS_TTL_MS = 60 * 60 * 1000;
  const NEGATIVE_TTL_MS = 10 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 500;
  type SetsCacheEntry = { at: number; items: PartInSet[] };
  const globalAny = globalThis as unknown as {
    __RB_SETS_CACHE__?: Map<string, SetsCacheEntry>;
    __RB_SETS_NEG_CACHE__?: Map<string, { at: number }>;
  };
  if (!globalAny.__RB_SETS_CACHE__) globalAny.__RB_SETS_CACHE__ = new Map();
  if (!globalAny.__RB_SETS_NEG_CACHE__)
    globalAny.__RB_SETS_NEG_CACHE__ = new Map();
  const posCache = globalAny.__RB_SETS_CACHE__!;
  const negCache = globalAny.__RB_SETS_NEG_CACHE__!;
  const cacheKey = `${partNum.trim().toLowerCase()}::${typeof colorId === 'number' ? colorId : ''}`;
  const now = Date.now();
  const hit = posCache.get(cacheKey);
  if (hit && now - hit.at < SETS_TTL_MS) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('rebrickable.sets.cache_hit', {
        partNum,
        colorId,
        count: hit.items.length,
      });
    }
    return hit.items;
  }
  const negHit = negCache.get(cacheKey);
  if (negHit && now - negHit.at < NEGATIVE_TTL_MS) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('rebrickable.sets.negative_cache_hit', { partNum, colorId });
    }
    return [];
  }
  // Rebrickable returns slightly different shapes between the uncolored and color-scoped endpoints.
  // - Uncolored (/parts/{part_num}/sets/): results[].set{ set_num, name, year, set_img_url }, quantity
  // - Color-scoped (/parts/{part_num}/colors/{color_id}/sets/): results[] has set fields at top-level (no nested "set"), no quantity
  type Page = {
    results: Array<
      | {
          set: {
            set_num: string;
            name: string;
            year: number;
            set_img_url: string | null;
          };
          quantity?: number;
        }
      | {
          set_num: string;
          name: string;
          year: number;
          set_img_url: string | null;
          quantity?: number;
        }
    >;
    next: string | null;
  };
  async function fetchAll(pn: string, color?: number): Promise<PartInSet[]> {
    const params: Record<string, string | number> = { page_size: 1000 };
    const path =
      typeof color === 'number'
        ? `/lego/parts/${encodeURIComponent(pn)}/colors/${color}/sets/`
        : `/lego/parts/${encodeURIComponent(pn)}/sets/`;
    const first = await rbFetch<Page>(path, params);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('rebrickable.sets.first_page', {
        pn,
        color,
        path,
        count: Array.isArray(first?.results) ? first.results.length : undefined,
        next: first?.next ?? null,
        sample: Array.isArray(first?.results) ? first.results[0] : undefined,
      });
    }
    const all: Page['results'] = [...first.results];
    let nextUrl: string | null = first.next;
    while (nextUrl) {
      const page = await rbFetchAbsolute<Page>(nextUrl);
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('rebrickable.sets.next_page', {
          pn,
          color,
          nextUrl,
          count: Array.isArray(page?.results) ? page.results.length : undefined,
          next: page?.next ?? null,
        });
      }
      all.push(...page.results);
      nextUrl = page.next;
    }
    return all.map(r => {
      if ('set' in r && r.set) {
        return {
          setNumber: r.set.set_num,
          name: r.set.name,
          year: r.set.year,
          imageUrl: r.set.set_img_url,
          // Rebrickable sometimes omits quantity on these endpoints; treat missing as at least 1.
          quantity: typeof r.quantity === 'number' ? r.quantity : 1,
          numParts: null,
          themeId: null,
          themeName: null,
        };
      }
      // Color-scoped shape (top-level fields)
      const top = r as {
        set_num: string;
        name: string;
        year: number;
        set_img_url: string | null;
        quantity?: number;
      };
      return {
        setNumber: top.set_num,
        name: top.name,
        year: top.year,
        imageUrl: top.set_img_url,
        // Color-scoped endpoint usually omits quantity; default to 1 so "qty in set" is never 0.
        quantity: typeof top.quantity === 'number' ? top.quantity : 1,
        numParts: null,
        themeId: null,
        themeName: null,
      };
    });
  }

  // Try exact part with color (if provided), then without color
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('rebrickable.sets.get_sets_attempt', { partNum, colorId });
  }
  let sets = await fetchAll(partNum, colorId);
  if (!sets.length && typeof colorId === 'number') {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('rebrickable.sets.retry_without_color', { partNum, colorId });
    }
    sets = await fetchAll(partNum, undefined);
  }
  // If still empty, and the part has exactly one valid color in RB, try that color explicitly
  if (!sets.length) {
    try {
      const colors = await getPartColorsForPart(partNum);
      if (colors.length === 1) {
        const only = colors[0]!;
        if (only.id !== (colorId ?? -1)) {
          if (process.env.NODE_ENV !== 'production') {
            logger.debug('rebrickable.sets.retry_sole_color', {
              partNum,
              colorTried: only.id,
            });
          }
          const viaOnly = await fetchAll(partNum, only.id);
          if (viaOnly.length) return viaOnly;
        }
      }
    } catch {
      // ignore
    }
  }
  if (sets.length) return sets;

  // If printed variant, attempt base mold via print_of
  try {
    const meta = await getPart(partNum);
    const base = meta.print_of?.trim();
    if (base && base !== partNum) {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('rebrickable.sets.try_base_print_of', {
          partNum,
          base,
          colorId,
        });
      }
      let baseSets = await fetchAll(base, colorId);
      if (!baseSets.length && typeof colorId === 'number') {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug('rebrickable.sets.base_retry_without_color', {
            base,
            colorId,
          });
        }
        baseSets = await fetchAll(base, undefined);
      }
      if (!baseSets.length) {
        try {
          const colors = await getPartColorsForPart(base);
          if (colors.length === 1) {
            const only = colors[0]!;
            if (process.env.NODE_ENV !== 'production') {
              logger.debug('rebrickable.sets.retry_with_sole_color', {
                base,
                colorTried: only.id,
              });
            }
            const viaOnly = await fetchAll(base, only.id);
            if (viaOnly.length) return viaOnly;
          }
        } catch {
          // ignore
        }
      }
      return baseSets;
    }
  } catch {
    // ignore, return empty
  }
  // Cache results
  if (sets.length > 0) {
    posCache.set(cacheKey, { at: now, items: sets });
    if (posCache.size > MAX_CACHE_ENTRIES) {
      // naive eviction of oldest
      let oldestKey: string | null = null;
      let oldestAt = Number.MAX_SAFE_INTEGER;
      for (const [k, v] of posCache.entries()) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey) posCache.delete(oldestKey);
    }
  } else {
    negCache.set(cacheKey, { at: now });
    if (negCache.size > MAX_CACHE_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestAt = Number.MAX_SAFE_INTEGER;
      for (const [k, v] of negCache.entries()) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey) negCache.delete(oldestKey);
    }
  }
  return sets;
}

export async function getSetsForMinifig(
  figNum: string
): Promise<PartInSet[]> {
  const SETS_TTL_MS = 60 * 60 * 1000;
  const NEGATIVE_TTL_MS = 10 * 60 * 1000;
  const MAX_CACHE_ENTRIES = 500;
  type SetsCacheEntry = { at: number; items: PartInSet[] };
  const globalAny = globalThis as unknown as {
    __RB_MINIFIG_SETS_CACHE__?: Map<string, SetsCacheEntry>;
    __RB_MINIFIG_SETS_NEG_CACHE__?: Map<string, { at: number }>;
  };
  if (!globalAny.__RB_MINIFIG_SETS_CACHE__) {
    globalAny.__RB_MINIFIG_SETS_CACHE__ = new Map();
  }
  if (!globalAny.__RB_MINIFIG_SETS_NEG_CACHE__) {
    globalAny.__RB_MINIFIG_SETS_NEG_CACHE__ = new Map();
  }
  const posCache = globalAny.__RB_MINIFIG_SETS_CACHE__!;
  const negCache = globalAny.__RB_MINIFIG_SETS_NEG_CACHE__!;
  const cacheKey = figNum.trim().toLowerCase();
  const now = Date.now();
  const hit = posCache.get(cacheKey);
  if (hit && now - hit.at < SETS_TTL_MS) {
    return hit.items;
  }
  const negHit = negCache.get(cacheKey);
  if (negHit && now - negHit.at < NEGATIVE_TTL_MS) {
    return [];
  }

  type Page = {
    results: Array<{
      set?: {
        set_num: string;
        name: string;
        year: number;
        set_img_url: string | null;
      };
      set_num?: string;
      set_name?: string;
      year?: number;
      set_img_url?: string | null;
      quantity?: number;
    }>;
    next: string | null;
  };

  async function fetchAll(minifigId: string): Promise<PartInSet[]> {
    const first = await rbFetch<Page>(
      `/lego/minifigs/${encodeURIComponent(minifigId)}/sets/`,
      { page_size: 1000 }
    );
    const all: Page['results'] = [...first.results];
    let nextUrl: string | null = first.next;
    while (nextUrl) {
      const page = await rbFetchAbsolute<Page>(nextUrl);
      all.push(...page.results);
      nextUrl = page.next;
    }
    return all
      .map(r => {
        if (r.set) {
          return {
            setNumber: r.set.set_num,
            name: r.set.name,
            year:
              typeof r.set.year === 'number' && Number.isFinite(r.set.year)
                ? r.set.year
                : 0,
            imageUrl: r.set.set_img_url,
            quantity: typeof r.quantity === 'number' ? r.quantity : 1,
          };
        }
        const setNum = (r.set_num ?? '').trim();
        if (!setNum) {
          return null;
        }
        return {
          setNumber: setNum,
          name: r.set_name ?? '',
          year:
            typeof r.year === 'number' && Number.isFinite(r.year) ? r.year : 0,
          imageUrl:
            typeof r.set_img_url === 'string' ? r.set_img_url : null,
          quantity: typeof r.quantity === 'number' ? r.quantity : 1,
        };
      })
      .filter((s): s is PartInSet => Boolean(s));
  }

  let sets: PartInSet[] = [];
  try {
    sets = await fetchAll(figNum);
  } catch {
    sets = [];
  }

  if (sets.length) {
    // Sort minifig sets similarly: most quantity, then newest year first
    sets = [...sets].sort((a, b) => {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return b.year - a.year;
    });
    posCache.set(cacheKey, { at: now, items: sets });
    if (posCache.size > MAX_CACHE_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestAt = Number.MAX_SAFE_INTEGER;
      for (const [k, v] of posCache.entries()) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey) posCache.delete(oldestKey);
    }
  } else {
    negCache.set(cacheKey, { at: now });
    if (negCache.size > MAX_CACHE_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestAt = Number.MAX_SAFE_INTEGER;
      for (const [k, v] of negCache.entries()) {
        if (v.at < oldestAt) {
          oldestAt = v.at;
          oldestKey = k;
        }
      }
      if (oldestKey) negCache.delete(oldestKey);
    }
  }

  return sets;
}

export function mapCategoryNameToParent(
  name: string
):
  | 'Brick'
  | 'Plate'
  | 'Tile'
  | 'Slope'
  | 'Clip'
  | 'Hinge'
  | 'Bar'
  | 'Minifigure'
  | 'Technic'
  | 'Wheels'
  | 'Misc' {
  const n = name.toLowerCase();
  // Precedence: Technic first
  if (
    n.startsWith('technic') ||
    n.includes('pneumatic') ||
    n.includes('power functions') ||
    n.includes('electronics')
  )
    return 'Technic';
  if (
    n.includes('wheel') ||
    n.includes('tyre') ||
    n.includes('tire') ||
    n.includes('rim')
  )
    return 'Wheels';
  if (n.startsWith('minifig')) return 'Minifigure';
  if (n.startsWith('clip') || n.includes('clip')) return 'Clip';
  if (n.startsWith('bar') || n.includes('lightsaber')) return 'Bar';
  if (n.startsWith('hinge') || n.includes('turntable')) return 'Hinge';
  if (n.startsWith('slope') || n.includes('roof tile')) return 'Slope';
  if (n.startsWith('tile')) return 'Tile';
  if (n.startsWith('plate') || n.includes('wedge')) return 'Plate';
  if (n.startsWith('brick') || n.includes('bracket') || n.includes('arch'))
    return 'Brick';
  return 'Misc';
}

async function getMinifigPartsCached(
  figNum: string
): Promise<RebrickableMinifigComponent[]> {
  const cached = minifigPartsCache.get(figNum);
  if (cached) return cached;

  const parts: RebrickableMinifigComponent[] = [];
  let nextUrl: string | null = null;
  let firstPage = true;
  while (firstPage || nextUrl) {
    let response:
      | {
          results: RebrickableMinifigComponent[];
          next: string | null;
        }
      | undefined;
    if (firstPage) {
      response = await rbFetch<{
        results: RebrickableMinifigComponent[];
        next: string | null;
      }>(`/lego/minifigs/${encodeURIComponent(figNum)}/parts/`, {
        page_size: 1000,
        inc_part_details: 1,
      });
    } else if (nextUrl) {
      response = await rbFetchAbsolute<{
        results: RebrickableMinifigComponent[];
        next: string | null;
      }>(nextUrl);
    }
    if (!response) break;
    parts.push(...response.results);
    nextUrl = response.next;
    firstPage = false;
  }

  minifigPartsCache.set(figNum, parts);
  return parts;
}

export type RebrickableColor = {
  id: number;
  name: string;
  rgb: string | null;
  is_trans: boolean;
  external_ids?: {
    BrickLink?: {
      ext_ids: number[];
      ext_descrs: string[][];
    };
    [key: string]: unknown;
  };
};

let colorsCache: { at: number; items: RebrickableColor[] } | null = null;

export async function getColors(): Promise<RebrickableColor[]> {
  const now = Date.now();
  if (colorsCache && now - colorsCache.at < 60 * 60 * 1000) {
    return colorsCache.items;
  }
  const allColors: RebrickableColor[] = [];
  let nextUrl: string | null = null;
  let firstPage = true;

  while (firstPage || nextUrl) {
    const page: { results: RebrickableColor[]; next: string | null } = firstPage
      ? await rbFetch<{ results: RebrickableColor[]; next: string | null }>(
          '/lego/colors/',
          { page_size: 1000 }
        )
      : await rbFetchAbsolute<{
          results: RebrickableColor[];
          next: string | null;
        }>(nextUrl!);
    allColors.push(...page.results);
    nextUrl = page.next;
    firstPage = false;
  }

  colorsCache = { at: now, items: allColors };
  return allColors;
}

/**
 * Map a BrickLink color id to a Rebrickable color id, using external_ids mapping.
 * Returns null if no mapping found.
 */
export async function mapBrickLinkColorIdToRebrickableColorId(
  blColorId: number
): Promise<number | null> {
  const all = await getColors();
  for (const c of all) {
    const bl = (
      c.external_ids as { BrickLink?: { ext_ids?: number[] } } | undefined
    )?.BrickLink;
    const ids: number[] | undefined = Array.isArray(bl?.ext_ids)
      ? bl.ext_ids
      : undefined;
    if (ids && ids.includes(blColorId)) return c.id;
  }
  return null;
}

export type PartAvailableColor = {
  id: number;
  name: string;
  rgb: string | null;
  isTrans: boolean;
  numSets: number;
  numSetParts: number;
};

/**
 * List only the colors in which this part appears.
 */
export async function getPartColorsForPart(
  partNum: string
): Promise<PartAvailableColor[]> {
  type Page = {
    results: Array<
      | {
          color: RebrickableColor;
          num_sets?: number;
          num_set_parts?: number;
        }
      | {
          color_id: number;
          color_name: string;
          is_trans?: boolean;
          rgb?: string | null;
          num_sets?: number;
          num_set_parts?: number;
        }
    >;
    next: string | null;
  };
  const results: Page['results'] = [];
  let first = true;
  let nextUrl: string | null = null;
  while (first || nextUrl) {
    const page: Page = first
      ? await rbFetch<Page>(
          `/lego/parts/${encodeURIComponent(partNum)}/colors/`,
          {
            page_size: 1000,
          }
        )
      : await rbFetchAbsolute<Page>(nextUrl!);
    results.push(...page.results);
    nextUrl = page.next;
    first = false;
  }
  if (process.env.NODE_ENV !== 'production') {
    logger.debug('rebrickable.part_colors', {
      partNum,
      count: results.length,
      sample: results[0],
    });
  }
  return results.map(r => {
    if ('color' in r) {
      return {
        id: r.color.id,
        name: r.color.name,
        rgb: r.color.rgb ?? null,
        isTrans: r.color.is_trans,
        numSets: typeof r.num_sets === 'number' ? r.num_sets : 0,
        numSetParts: typeof r.num_set_parts === 'number' ? r.num_set_parts : 0,
      };
    }
    const top = r as {
      color_id: number;
      color_name: string;
      is_trans?: boolean;
      rgb?: string | null;
      num_sets?: number;
      num_set_parts?: number;
    };
    return {
      id: top.color_id,
      name: top.color_name,
      rgb: typeof top.rgb === 'string' ? top.rgb : null,
      isTrans: !!top.is_trans,
      numSets: typeof top.num_sets === 'number' ? top.num_sets : 0,
      numSetParts:
        typeof top.num_set_parts === 'number' ? top.num_set_parts : 0,
    };
  });
}

// Themes
type RebrickableTheme = { id: number; parent_id: number | null; name: string };
let themesCache: { at: number; items: RebrickableTheme[] } | null = null;

export async function getThemes(): Promise<RebrickableTheme[]> {
  const now = Date.now();
  if (themesCache && now - themesCache.at < 60 * 60 * 1000) {
    return themesCache.items;
  }
  const all: RebrickableTheme[] = [];
  let first = true;
  let nextUrl: string | null = null;
  while (first || nextUrl) {
    const page: { results: RebrickableTheme[]; next: string | null } = first
      ? await rbFetch<{ results: RebrickableTheme[]; next: string | null }>(
          '/lego/themes/',
          { page_size: 1000 }
        )
      : await rbFetchAbsolute<{
          results: RebrickableTheme[];
          next: string | null;
        }>(nextUrl!);
    all.push(...page.results);
    nextUrl = page.next;
    first = false;
  }
  themesCache = { at: now, items: all };
  return all;
}
