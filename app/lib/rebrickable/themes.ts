import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import type { RebrickableTheme } from '@/app/lib/rebrickable/types';

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
