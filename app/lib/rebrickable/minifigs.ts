import { LRUCache } from '@/app/lib/cache/lru';
import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type { RebrickableMinifigComponent } from '@/app/lib/rebrickable/types';

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
        typeof result.num_parts === 'number' &&
        Number.isFinite(result.num_parts)
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
