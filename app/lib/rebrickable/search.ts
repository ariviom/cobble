import { LRUCache } from '@/app/lib/cache/lru';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { getThemes } from '@/app/lib/rebrickable/themes';
import { buildThemeHelpers } from '@/app/lib/themes';
import type {
    RebrickableSetSearchResult,
    SimpleSet,
} from '@/app/lib/rebrickable/types';
import { normalizeText } from '@/app/lib/rebrickable/utils';
import { filterExactMatches } from '@/app/lib/searchExactMatch';
import type { MatchType } from '@/app/types/search';

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

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX_ENTRIES = 100;
const SEARCH_AGG_PAGE_SIZE = 200;
const SEARCH_AGG_CAP = 1000;

/** LRU cache for aggregated search results with TTL and size limit */
const aggregatedSearchCache = new LRUCache<string, SimpleSet[]>(
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_TTL_MS
);

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
  const { getThemeMeta, themeById } = buildThemeHelpers(themes);
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
