import { LRUCache } from '@/app/lib/cache/lru';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type {
    PartAvailableColor,
    PartInSet,
    RebrickableCategory,
    RebrickablePart,
} from '@/app/lib/rebrickable/types';
import { dedup } from '@/app/lib/utils/dedup';
import { logger } from '@/lib/metrics';

export async function getPart(partNum: string): Promise<RebrickablePart> {
  const trimmed = partNum.trim();
  if (!trimmed) {
    throw new Error('part number is required');
  }
  const key = `getPart:${trimmed.toLowerCase()}`;
  return dedup(key, () =>
    rbFetch<RebrickablePart>(
      `/lego/parts/${encodeURIComponent(trimmed)}/`,
      { inc_part_details: 1 }
    )
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

/**
 * List only the colors in which this part appears.
 */
export async function getPartColorsForPart(
  partNum: string
): Promise<PartAvailableColor[]> {
  type Page = {
    results: Array<
      | {
          color: import('@/app/lib/rebrickable/types').RebrickableColor;
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
      logger.debug('rebrickable.parts.sets_cache_hit', {
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
      logger.debug('rebrickable.parts.sets_negative_cache_hit', {
        partNum,
        colorId,
      });
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
      logger.debug('rebrickable.parts.sets_first_page', {
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
        logger.debug('rebrickable.parts.sets_next_page', {
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
    logger.debug('rebrickable.parts.get_sets_attempt', { partNum, colorId });
  }
  let sets = await fetchAll(partNum, colorId);
  if (!sets.length && typeof colorId === 'number') {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('rebrickable.parts.get_sets_retry_no_color', {
        partNum,
        colorId,
      });
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
            logger.debug('rebrickable.parts.get_sets_retry_sole_color', {
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
        logger.debug('rebrickable.parts.get_sets_try_base_print_of', {
          partNum,
          base,
          colorId,
        });
      }
      let baseSets = await fetchAll(base, colorId);
      if (!baseSets.length && typeof colorId === 'number') {
        if (process.env.NODE_ENV !== 'production') {
          logger.debug('rebrickable.parts.get_sets_base_retry_no_color', {
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
              logger.debug('rebrickable.parts.get_sets_base_retry_sole_color', {
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
