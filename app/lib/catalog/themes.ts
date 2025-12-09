import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { normalizeText } from '@/app/lib/rebrickable';
import { buildThemeHelpersFromMap } from '@/app/lib/themes';

export type LocalTheme = {
  id: number;
  parent_id: number | null;
  name: string;
};

type LocalThemesCache =
  | {
      at: number;
      items: LocalTheme[];
    }
  | null;

const LOCAL_THEMES_TTL_MS = 60 * 60 * 1000;

let localThemesCache: LocalThemesCache = null;

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

export type ThemeMeta = { themeName: string | null; themePath: string | null };

export function buildThemeMetaHelpers(themes: LocalTheme[]) {
  const themeById = new Map<number, LocalTheme>(themes.map(t => [t.id, t]));
  const { getThemeMeta } = buildThemeHelpersFromMap(themeById);

  function matchesTheme(
    queryNorm: string,
    compactQuery: string
  ): Set<number> {
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

export function deriveRootThemeName(
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

