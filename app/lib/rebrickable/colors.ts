import 'server-only';

import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type { RebrickableColor } from '@/app/lib/rebrickable/types';
import { logger } from '@/lib/metrics';

let colorsCache: { at: number; items: RebrickableColor[] } | null = null;
let colorsInflight: Promise<RebrickableColor[]> | null = null;

export async function getColors(): Promise<RebrickableColor[]> {
  const now = Date.now();
  if (colorsCache && now - colorsCache.at < 60 * 60 * 1000) {
    return colorsCache.items;
  }
  if (colorsInflight) return colorsInflight;

  colorsInflight = (async () => {
    try {
      const allColors: RebrickableColor[] = [];
      let nextUrl: string | null = null;
      let firstPage = true;

      while (firstPage || nextUrl) {
        const page: { results: RebrickableColor[]; next: string | null } =
          firstPage
            ? await rbFetch<{
                results: RebrickableColor[];
                next: string | null;
              }>('/lego/colors/', { page_size: 1000 })
            : await rbFetchAbsolute<{
                results: RebrickableColor[];
                next: string | null;
              }>(nextUrl!);
        allColors.push(...page.results);
        nextUrl = page.next;
        firstPage = false;
      }

      colorsCache = { at: Date.now(), items: allColors };
      return allColors;
    } catch (err) {
      if (colorsCache) {
        logger.warn('cache.stale_fallback', {
          context: 'rb_colors',
          error: String(err),
        });
        return colorsCache.items;
      }
      throw err;
    } finally {
      colorsInflight = null;
    }
  })();

  return colorsInflight;
}
