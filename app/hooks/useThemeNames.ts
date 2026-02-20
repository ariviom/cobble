'use client';

import { useQuery } from '@tanstack/react-query';

type ThemeRow = { id: number; parent_id: number | null; name: string };

/**
 * Builds a map from every themeId → its root (top-level) theme name.
 * Walks parent_id pointers to the root of the hierarchy.
 */
function buildRootNameMap(themes: ThemeRow[]): Map<number, string> {
  const byId = new Map<number, ThemeRow>(themes.map(t => [t.id, t]));
  const cache = new Map<number, string>();

  function resolve(id: number): string | null {
    if (cache.has(id)) return cache.get(id)!;
    const visited = new Set<number>();
    let current = byId.get(id);
    if (!current) return null;
    let root = current;
    while (current && current.parent_id != null && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = byId.get(current.parent_id);
      if (!parent) break;
      root = parent;
      current = parent;
    }
    cache.set(id, root.name);
    return root.name;
  }

  for (const t of themes) {
    resolve(t.id);
  }
  return cache;
}

async function fetchThemes(): Promise<Map<number, string>> {
  const res = await fetch('/api/themes');
  if (!res.ok) return new Map();
  const data = (await res.json()) as { themes: ThemeRow[] };
  return buildRootNameMap(data.themes ?? []);
}

const EMPTY_MAP = new Map<number, string>();

/**
 * Fetches the theme hierarchy once per session and returns a stable
 * Map<themeId, rootThemeName>. The map reference only changes on load.
 */
export function useThemeNames(): Map<number, string> {
  const { data } = useQuery({
    queryKey: ['theme-root-names'],
    queryFn: fetchThemes,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? EMPTY_MAP;
}
