import { LRUCache } from '@/app/lib/cache/lru';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type {
    PartInSet,
    RebrickableMinifigComponent
} from '@/app/lib/rebrickable/types';

type RebrickableMinifigSearchResult = {
  fig_num?: string;
  set_num?: string;
  name: string;
  num_parts?: number;
  set_img_url?: string | null;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const MINIFIG_CACHE_MAX_ENTRIES = 500;

/** LRU cache for minifig parts with 1 hour TTL and size limit */
const minifigPartsCache = new LRUCache<string, RebrickableMinifigComponent[]>(
  MINIFIG_CACHE_MAX_ENTRIES,
  ONE_HOUR_MS
);

export async function getMinifigPartsCached(
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
