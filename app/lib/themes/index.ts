import 'server-only';

import { getThemes } from '@/app/lib/rebrickable/themes';
import type { RebrickableTheme } from '@/app/lib/rebrickable/types';

type ThemeLike = Pick<RebrickableTheme, 'id' | 'name' | 'parent_id'>;
type ThemeId = number | null | undefined;

let themeMapCache: Map<number, ThemeLike> | null = null;
let themePathCache: Map<number, string> | null = null;

async function ensureThemeMap(): Promise<Map<number, ThemeLike>> {
  if (themeMapCache) return themeMapCache;
  const themes = await getThemes();
  themeMapCache = new Map(themes.map(t => [t.id, t]));
  return themeMapCache;
}

function createThemeResolvers(themeById: Map<number, ThemeLike>) {
  const pathCache = new Map<number, string>();

  const getThemePath = (themeId: ThemeId): string | null => {
    if (themeId == null || !Number.isFinite(themeId)) return null;
    const id = themeId as number;
    if (pathCache.has(id)) return pathCache.get(id) ?? null;

    const theme = themeById.get(id);
    if (!theme) return null;

    const names: string[] = [];
    const visited = new Set<number>();
    let current: ThemeLike | null | undefined = theme;
    while (current && !visited.has(current.id)) {
      names.unshift(current.name);
      visited.add(current.id);
      current =
        current.parent_id != null
          ? themeById.get(current.parent_id)
          : undefined;
    }
    const path = names.length > 0 ? names.join(' / ') : null;
    if (path !== null) {
      pathCache.set(id, path);
    }
    return path;
  };

  const getRootTheme = (themeId: ThemeId): ThemeLike | null => {
    if (themeId == null || !Number.isFinite(themeId)) return null;
    const visited = new Set<number>();
    let current: ThemeLike | null | undefined = themeById.get(themeId) ?? null;
    while (current && current.parent_id != null && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = themeById.get(current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return current ?? null;
  };

  const getThemeMeta = (
    themeId: ThemeId
  ): { themeName: string | null; themePath: string | null } => {
    const theme = Number.isFinite(themeId as number)
      ? themeById.get(themeId as number)
      : undefined;
    return {
      themeName: theme?.name ?? null,
      themePath: getThemePath(themeId),
    };
  };

  return { getThemePath, getRootTheme, getThemeMeta, themeById };
}

export async function getThemePath(themeId: number): Promise<string | null> {
  if (!themePathCache) {
    themePathCache = new Map<number, string>();
  }
  const map = await ensureThemeMap();
  if (themePathCache.has(themeId)) return themePathCache.get(themeId) ?? null;

  const theme = map.get(themeId);
  if (!theme) return null;

  const names: string[] = [];
  const visited = new Set<number>();
  let current: ThemeLike | null | undefined = theme;
  while (current && !visited.has(current.id)) {
    names.unshift(current.name);
    visited.add(current.id);
    current =
      current.parent_id != null ? map.get(current.parent_id) : undefined;
  }
  const path = names.length > 0 ? names.join(' / ') : null;
  if (path !== null) {
    themePathCache.set(themeId, path);
  }
  return path;
}

export async function getRootTheme(themeId: number): Promise<ThemeLike | null> {
  const map = await ensureThemeMap();
  const { getRootTheme } = createThemeResolvers(map);
  return getRootTheme(themeId);
}

export async function getThemeMeta(
  themeId: ThemeId
): Promise<{ themeName: string | null; themePath: string | null }> {
  const map = await ensureThemeMap();
  const { getThemeMeta } = createThemeResolvers(map);
  return getThemeMeta(themeId);
}

export function buildThemeHelpers(themes: ThemeLike[]) {
  return createThemeResolvers(new Map(themes.map(t => [t.id, t])));
}

export function buildThemeHelpersFromMap(themeById: Map<number, ThemeLike>) {
  return createThemeResolvers(themeById);
}
