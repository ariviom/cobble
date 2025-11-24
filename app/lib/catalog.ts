import 'server-only';

import type { SimpleSet } from '@/app/lib/rebrickable';
import {
  sortAggregatedResults,
  mapCategoryNameToParent,
  normalizeText,
} from '@/app/lib/rebrickable';
import { getSupabaseServerClient } from '@/app/lib/supabaseServerClient';
import type { InventoryRow } from '@/app/components/set/types';

type LocalTheme = {
  id: number;
  parent_id: number | null;
  name: string;
};

let localThemesCache:
  | {
      at: number;
      items: LocalTheme[];
    }
  | null = null;

const LOCAL_THEMES_TTL_MS = 60 * 60 * 1000;

export async function getThemesLocal(): Promise<LocalTheme[]> {
  const now = Date.now();
  if (localThemesCache && now - localThemesCache.at < LOCAL_THEMES_TTL_MS) {
    return localThemesCache.items;
  }

  const supabase = getSupabaseServerClient();
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

export async function searchSetsLocal(
  query: string,
  sort: string
): Promise<SimpleSet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = getSupabaseServerClient();

  // We fetch by set number prefix and by name contains, and merge with theme-
  // based matches, then sort in-memory for relevance and other sort modes.
  const [bySetNum, byName, themes] = await Promise.all([
    supabase
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .ilike('set_num', `${trimmed}%`)
      .limit(250),
    supabase
      .from('rb_sets')
      .select('set_num, name, year, num_parts, image_url, theme_id')
      .ilike('name', `%${trimmed}%`)
      .limit(250),
    getThemesLocal(),
  ]);

  if (bySetNum.error && !bySetNum.data && byName.error && !byName.data) {
    throw new Error(
      `Supabase searchSetsLocal failed: ${bySetNum.error?.message ?? ''} ${byName.error?.message ?? ''}`.trim()
    );
  }

  const themeById = new Map<number, LocalTheme>(
    (themes ?? []).map(t => [t.id, t])
  );
  const themePathCache = new Map<number, string>();

  function getThemeMeta(
    themeId: number | null | undefined
  ): { themeName: string | null; themePath: string | null } {
    if (themeId == null || !Number.isFinite(themeId)) {
      return { themeName: null, themePath: null };
    }
    const id = themeId as number;
    const theme = themeById.get(id);
    const themeName = theme?.name ?? null;

    let path: string | null = null;
    if (themePathCache.has(id)) {
      path = themePathCache.get(id) ?? null;
    } else if (theme) {
      const names: string[] = [];
      const visited = new Set<number>();
      let current: LocalTheme | null | undefined = theme;
      while (current && !visited.has(current.id)) {
        names.unshift(current.name);
        visited.add(current.id);
        if (current.parent_id != null) {
          current = themeById.get(current.parent_id) ?? null;
        } else {
          current = null;
        }
      }
      path = names.length > 0 ? names.join(' / ') : null;
      if (path != null) {
        themePathCache.set(id, path);
      }
    }

    return { themeName, themePath: path };
  }

  const seen = new Map<string, SimpleSet>();

  function addRow(row: {
    set_num: string;
    name: string;
    year: number | null;
    num_parts: number | null;
    image_url: string | null;
    theme_id: number | null;
  }) {
    const key = row.set_num.toLowerCase();
    if (seen.has(key)) return;

    const rawThemeId =
      typeof row.theme_id === 'number' && Number.isFinite(row.theme_id)
        ? row.theme_id
        : null;
    const { themeName, themePath } = getThemeMeta(rawThemeId);

    seen.set(key, {
      setNumber: row.set_num,
      name: row.name,
      year: row.year ?? 0,
      numParts: row.num_parts ?? 0,
      imageUrl: row.image_url ?? null,
      themeId: rawThemeId,
      ...(themeName ? { themeName } : {}),
      ...(themePath ? { themePath } : {}),
    });
  }

  for (const row of bySetNum.data ?? []) {
    addRow(row as {
      set_num: string;
      name: string;
      year: number | null;
      num_parts: number | null;
      image_url: string | null;
      theme_id: number | null;
    });
  }

  for (const row of byName.data ?? []) {
    addRow(row as {
      set_num: string;
      name: string;
      year: number | null;
      num_parts: number | null;
      image_url: string | null;
      theme_id: number | null;
    });
  }

  // Theme & subtheme keyword search: include sets whose full theme path matches
  // the query (e.g., "Star Wars" or "Classic Space").
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  if (hasLetters && themeById.size > 0) {
    const normalizedQuery = normalizeText(trimmed);
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const matchingThemeIds = new Set<number>();

    for (const theme of themeById.values()) {
      const id = theme.id;
      const existingPath = themePathCache.get(id);
      const path =
        existingPath ??
        getThemeMeta(id).themePath ??
        null;
      if (!path) continue;
      const normalizedPath = normalizeText(path);
      const compactPath = normalizedPath.replace(/\s+/g, '');
      if (
        normalizedPath.includes(normalizedQuery) ||
        (compactQuery.length >= 3 && compactPath.includes(compactQuery))
      ) {
        matchingThemeIds.add(id);
      }
    }

    if (matchingThemeIds.size > 0) {
      const { data: byTheme, error: byThemeError } = await supabase
        .from('rb_sets')
        .select('set_num, name, year, num_parts, image_url, theme_id')
        .in('theme_id', Array.from(matchingThemeIds))
        .limit(500);

      if (byThemeError) {
        console.error(
          'Supabase searchSetsLocal theme search failed',
          byThemeError.message
        );
      } else {
        for (const row of byTheme ?? []) {
          addRow(row as {
            set_num: string;
            name: string;
            year: number | null;
            num_parts: number | null;
            image_url: string | null;
            theme_id: number | null;
          });
        }
      }
    }
  }

  const items = Array.from(seen.values());
  if (items.length === 0) return [];

  return sortAggregatedResults(items, sort, trimmed);
}

export async function getSetInventoryLocal(
  setNumber: string
): Promise<InventoryRow[]> {
  const trimmedSet = setNumber.trim();
  if (!trimmedSet) return [];

  const supabase = getSupabaseServerClient();

  const { data: setParts, error: setPartsError } = await supabase
    .from('rb_set_parts')
    .select('part_num, color_id, quantity, is_spare')
    .eq('set_num', trimmedSet);

  if (setPartsError) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_set_parts failed: ${setPartsError.message}`
    );
  }

  const mainParts =
    setParts?.filter(row => row && row.is_spare === false) ?? [];
  if (mainParts.length === 0) return [];

  const partNums = Array.from(
    new Set(mainParts.map(row => row.part_num).filter(Boolean))
  );
  const colorIds = Array.from(
    new Set(mainParts.map(row => row.color_id).filter(id => id != null))
  );

  const [partsRes, colorsRes] = await Promise.all([
    partNums.length
      ? supabase
          .from('rb_parts')
          .select('part_num, name, part_cat_id, image_url')
          .in('part_num', partNums)
      : Promise.resolve({ data: [], error: null } as {
          data: {
            part_num: string;
            name: string;
            part_cat_id: number | null;
            image_url: string | null;
          }[];
          error: null;
        }),
    colorIds.length
      ? supabase
          .from('rb_colors')
          .select('id, name')
          .in('id', colorIds)
      : Promise.resolve({ data: [], error: null } as {
          data: { id: number; name: string }[];
          error: null;
        }),
  ]);

  if (partsRes.error) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_parts failed: ${partsRes.error.message}`
    );
  }
  if (colorsRes.error) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_colors failed: ${colorsRes.error.message}`
    );
  }

  const parts = partsRes.data ?? [];
  const colors = colorsRes.data ?? [];

  const partMap = new Map<
    string,
    {
      part_num: string;
      name: string;
      part_cat_id: number | null;
      image_url: string | null;
    }
  >();
  for (const part of parts) {
    partMap.set(part.part_num, part);
  }

  const colorMap = new Map<number, { id: number; name: string }>();
  for (const color of colors) {
    colorMap.set(color.id, color);
  }

  const categoryIds = Array.from(
    new Set(
      parts
        .map(p => p.part_cat_id)
        .filter((id): id is number => typeof id === 'number')
    )
  );

  let categoryMap = new Map<number, { id: number; name: string }>();
  if (categoryIds.length > 0) {
    const { data: categories, error: categoriesError } = await supabase
      .from('rb_part_categories')
      .select('id, name')
      .in('id', categoryIds);

    if (categoriesError) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_part_categories failed: ${categoriesError.message}`
      );
    }

    for (const cat of categories ?? []) {
      categoryMap.set(cat.id, cat);
    }
  }

  const rows: InventoryRow[] = mainParts.map(row => {
    const part = partMap.get(row.part_num);
    const color = colorMap.get(row.color_id);
    const catId =
      typeof part?.part_cat_id === 'number' ? part.part_cat_id : undefined;
    const catName =
      typeof catId === 'number' ? categoryMap.get(catId)?.name : undefined;
    const parentCategory =
      catName != null ? mapCategoryNameToParent(catName) : undefined;

    return {
      setNumber: trimmedSet,
      partId: row.part_num,
      partName: part?.name ?? row.part_num,
      colorId: row.color_id,
      colorName: color?.name ?? `Color ${row.color_id}`,
      quantityRequired: row.quantity,
      imageUrl: part?.image_url ?? null,
      elementId: null,
      ...(typeof catId === 'number' && { partCategoryId: catId }),
      ...(catName && { partCategoryName: catName }),
      ...(parentCategory && { parentCategory }),
      inventoryKey: `${row.part_num}:${row.color_id}`,
    };
  });

  return rows;
}

export async function getSetSummaryLocal(setNumber: string): Promise<{
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
} | null> {
  const trimmed = setNumber.trim();
  if (!trimmed) return null;

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, num_parts, image_url, theme_id')
    .eq('set_num', trimmed)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Supabase getSetSummaryLocal rb_sets failed: ${error.message}`
    );
  }

  if (!data) return null;

  return {
    setNumber: data.set_num,
    name: data.name,
    year: data.year ?? 0,
    numParts: data.num_parts ?? 0,
    imageUrl: data.image_url ?? null,
    themeId: data.theme_id ?? null,
  };
}



