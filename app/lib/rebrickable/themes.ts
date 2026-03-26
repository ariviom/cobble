import 'server-only';

import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type { RebrickableTheme } from '@/app/lib/rebrickable/types';
import { logger } from '@/lib/metrics';

let themesCache: { at: number; items: RebrickableTheme[] } | null = null;
let themesInflight: Promise<RebrickableTheme[]> | null = null;

export async function getThemes(): Promise<RebrickableTheme[]> {
  const now = Date.now();
  if (themesCache && now - themesCache.at < 60 * 60 * 1000) {
    return themesCache.items;
  }
  if (themesInflight) return themesInflight;

  themesInflight = (async () => {
    try {
      const all: RebrickableTheme[] = [];
      let first = true;
      let nextUrl: string | null = null;
      while (first || nextUrl) {
        const page: { results: RebrickableTheme[]; next: string | null } = first
          ? await rbFetch<{
              results: RebrickableTheme[];
              next: string | null;
            }>('/lego/themes/', { page_size: 1000 })
          : await rbFetchAbsolute<{
              results: RebrickableTheme[];
              next: string | null;
            }>(nextUrl!);
        all.push(...page.results);
        nextUrl = page.next;
        first = false;
      }
      themesCache = { at: Date.now(), items: all };
      return all;
    } catch (err) {
      if (themesCache) {
        logger.warn('cache.stale_fallback', {
          context: 'rb_themes',
          error: String(err),
        });
        return themesCache.items;
      }
      throw err;
    } finally {
      themesInflight = null;
    }
  })();

  return themesInflight;
}
