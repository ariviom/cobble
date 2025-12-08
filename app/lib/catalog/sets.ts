import 'server-only';

import type { InventoryRow } from '@/app/components/set/types';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import type { PartInSet, SimpleSet } from '@/app/lib/rebrickable';
import {
    mapCategoryNameToParent,
    normalizeText,
    sortAggregatedResults
} from '@/app/lib/rebrickable';
import { filterExactMatches } from '@/app/lib/searchExactMatch';
import type { MatchType } from '@/app/types/search';
import type { Json } from '@/supabase/types';

import { dedup } from '@/app/lib/utils/dedup';
import {
    buildThemeMetaHelpers,
    deriveRootThemeName,
    getThemesLocal,
    type LocalTheme,
} from './themes';

export async function searchSetsLocal(
  query: string,
  sort: string,
  options?: { exactMatch?: boolean }
): Promise<SimpleSet[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const exactMatch = options?.exactMatch ?? false;

  // rb_sets is publicly readable (anon SELECT policy)
  const supabase = getCatalogReadClient();

  // We fetch by set number prefix and by name contains, and merge with theme-
  // based matches, then sort in-memory for relevance and other sort modes.
  const [bySetNum, byName, themesRaw] = await Promise.all([
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

  const themes = themesRaw ?? [];
  const themeById = new Map<number, LocalTheme>(themes.map(t => [t.id, t]));
  const { getThemeMeta, matchesTheme } = buildThemeMetaHelpers(themes);

  function getMatchTypeForTheme(
    themeId: number | null | undefined
  ): MatchType {
    if (themeId == null || !Number.isFinite(themeId)) {
      return 'theme';
    }
    const theme = themeById.get(themeId as number);
    if (theme && theme.parent_id != null) {
      return 'subtheme';
    }
    return 'theme';
  }

  const seen = new Map<string, SimpleSet>();
  const MATCH_PRIORITY: Record<MatchType, number> = {
    set: 3,
    subtheme: 2,
    theme: 1,
  };

  function addRow(
    row: {
      set_num: string;
      name: string;
      year: number | null;
      num_parts: number | null;
      image_url: string | null;
      theme_id: number | null;
    },
    matchType: MatchType = 'set'
  ) {
    const key = row.set_num.toLowerCase();
    const existing = seen.get(key);
    if (existing) {
      const existingType = existing.matchType ?? 'theme';
      if (MATCH_PRIORITY[matchType] > MATCH_PRIORITY[existingType]) {
        seen.set(key, { ...existing, matchType });
      }
      return;
    }

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
      matchType,
    });
  }

  for (const row of bySetNum.data ?? []) {
    addRow(
      row as {
        set_num: string;
        name: string;
        year: number | null;
        num_parts: number | null;
        image_url: string | null;
        theme_id: number | null;
      },
      'set'
    );
  }

  for (const row of byName.data ?? []) {
    addRow(
      row as {
        set_num: string;
        name: string;
        year: number | null;
        num_parts: number | null;
        image_url: string | null;
        theme_id: number | null;
      },
      'set'
    );
  }

  // Theme & subtheme keyword search: include sets whose full theme path matches
  // the query (e.g., "Star Wars" or "Classic Space").
  const hasLetters = /[a-zA-Z]/.test(trimmed);
  if (hasLetters && themeById.size > 0) {
    const normalizedQuery = normalizeText(trimmed);
    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    const matchingThemeIds = matchesTheme(normalizedQuery, compactQuery);

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
          const matchTypeForTheme = getMatchTypeForTheme(
            typeof row.theme_id === 'number' && Number.isFinite(row.theme_id)
              ? row.theme_id
              : null
          );
          addRow(
            row as {
              set_num: string;
              name: string;
              year: number | null;
              num_parts: number | null;
              image_url: string | null;
              theme_id: number | null;
            },
            matchTypeForTheme
          );
        }
      }
    }
  }

  let items = Array.from(seen.values());
  if (items.length === 0) return [];
  if (exactMatch) {
    items = filterExactMatches(items, trimmed);
  }
  if (items.length === 0) return [];

  return sortAggregatedResults(items, sort, trimmed);
}

export async function getSetSummaryLocal(setNumber: string): Promise<{
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
  themeId: number | null;
  /**
   * Root theme name for this set, when available (e.g., top-level parent theme).
   */
  themeName: string | null;
} | null> {
  const trimmed = setNumber.trim();
  if (!trimmed) return null;

  const data = await dedup(
    `getSetSummaryLocal:${trimmed.toLowerCase()}`,
    async () => {
      // rb_sets is publicly readable (anon SELECT policy)
      const supabase = getCatalogReadClient();
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
      return data ?? null;
    }
  );

  if (!data) return null;

  // Resolve root theme name using cached local themes, when a theme_id is present.
  let themeName: string | null = null;
  const rawThemeId =
    typeof data.theme_id === 'number' && Number.isFinite(data.theme_id)
      ? data.theme_id
      : null;
  if (rawThemeId != null) {
    try {
      const themes = await getThemesLocal();
      const themeById = new Map<number, LocalTheme>(
        (themes ?? []).map(t => [t.id, t])
      );
      let current: LocalTheme | null | undefined = themeById.get(rawThemeId);
      if (current) {
        const visited = new Set<number>();
        while (current && !visited.has(current.id)) {
          visited.add(current.id);
          if (current.parent_id != null) {
            const parent = themeById.get(current.parent_id);
            if (!parent) break;
            current = parent;
          } else {
            break;
          }
        }
        themeName = current?.name ?? null;
      }
    } catch {
      // If theme lookup fails, fall back to null without breaking summary.
      themeName = null;
    }
  }

  return {
    setNumber: data.set_num,
    name: data.name,
    year: data.year ?? 0,
    numParts: data.num_parts ?? 0,
    imageUrl: data.image_url ?? null,
    themeId: rawThemeId,
    themeName,
  };
}

export async function getSetInventoryLocal(
  setNumber: string
): Promise<InventoryRow[]> {
  const trimmedSet = setNumber.trim();
  if (!trimmedSet) return [];

  // Catalog reads use anon client. Inventory parts come from the public view
  // rb_inventory_parts_public, which exposes non-sensitive columns with RLS in place.
  const supabase = getCatalogReadClient();

  type InventoryPartRow = {
    part_num: string;
    color_id: number;
    quantity: number;
    is_spare: boolean;
    element_id?: string | null;
    img_url?: string | null;
  };

  // Prefer inventory_parts (with color-specific img_url) using the latest inventory version.
  let setParts: InventoryPartRow[] = [];

  const { data: inventories, error: inventoriesError } = await supabase
    .from('rb_inventories')
    .select('id, version')
    .eq('set_num', trimmedSet);

  if (inventoriesError) {
    throw new Error(
      `Supabase getSetInventoryLocal rb_inventories failed: ${inventoriesError.message}`
    );
  }

  const inventoryCandidates =
    inventories?.filter(
      row => typeof row?.id === 'number' && Number.isFinite(row.id)
    ) ?? [];

  if (inventoryCandidates.length > 0) {
    inventoryCandidates.sort(
      (a, b) => (b.version ?? -1) - (a.version ?? -1)
    );
    const selectedInventoryId = inventoryCandidates[0]!.id;
    const { data: inventoryParts, error: inventoryPartsError } = await supabase
      .from('rb_inventory_parts_public')
      .select('part_num, color_id, quantity, is_spare, element_id, img_url')
      .eq('inventory_id', selectedInventoryId)
      .eq('is_spare', false);

    if (inventoryPartsError) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_inventory_parts failed: ${inventoryPartsError.message}`
      );
    }

    if (inventoryParts?.length) {
      setParts = inventoryParts as InventoryPartRow[];
    }
  }

  // Fallback to legacy rb_set_parts when no inventory records were found.
  if (setParts.length === 0) {
    const { data: setPartsFallback, error: setPartsError } = await supabase
      .from('rb_set_parts')
      .select('part_num, color_id, quantity, is_spare')
      .eq('set_num', trimmedSet);

    if (setPartsError) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_set_parts failed: ${setPartsError.message}`
      );
    }

    setParts = setPartsFallback ?? [];
  }

  const mainParts = setParts.filter(row => row && row.is_spare === false);
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
          .select('part_num, name, part_cat_id, image_url, external_ids')
          .in('part_num', partNums)
      : Promise.resolve({ data: [], error: null } as {
          data: {
            part_num: string;
            name: string;
            part_cat_id: number | null;
            image_url: string | null;
            external_ids: Json;
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
      external_ids: Json;
    }
  >();
  for (const part of parts) {
    partMap.set(part.part_num, part);
  }

  // Helper to extract BrickLink part ID from external_ids
  function extractBricklinkPartId(
    externalIds: Json | null | undefined
  ): string | null {
    if (!externalIds || typeof externalIds !== 'object') return null;
    const record = externalIds as Record<string, unknown>;
    const blIds = record.BrickLink as unknown;
    // BrickLink IDs can be an array ["3024"] or object {ext_ids: [...]}
    if (Array.isArray(blIds) && blIds.length > 0) {
      const first = blIds[0];
      return typeof first === 'string' || typeof first === 'number'
        ? String(first)
        : null;
    }
    if (blIds && typeof blIds === 'object' && 'ext_ids' in blIds) {
      const extIds = (blIds as { ext_ids?: unknown }).ext_ids;
      if (Array.isArray(extIds) && extIds.length > 0) {
        const first = extIds[0];
        return typeof first === 'string' || typeof first === 'number'
          ? String(first)
          : null;
      }
    }
    return null;
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

  const categoryMap = new Map<number, { id: number; name: string }>();
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
    const bricklinkPartId = extractBricklinkPartId(part?.external_ids);
    const elementId =
      typeof row.element_id === 'string' && row.element_id.trim().length > 0
        ? row.element_id.trim()
        : null;
    const imageUrl =
      (typeof row.img_url === 'string' && row.img_url.trim().length > 0
        ? row.img_url.trim()
        : null) ?? part?.image_url ?? null;

    return {
      setNumber: trimmedSet,
      partId: row.part_num,
      partName: part?.name ?? row.part_num,
      colorId: row.color_id,
      colorName: color?.name ?? `Color ${row.color_id}`,
      quantityRequired: row.quantity,
      imageUrl,
      elementId,
      ...(typeof catId === 'number' && { partCategoryId: catId }),
      ...(catName && { partCategoryName: catName }),
      ...(parentCategory && { parentCategory }),
      inventoryKey: `${row.part_num}:${row.color_id}`,
      // Only include bricklinkPartId if different from partId
      ...(bricklinkPartId && bricklinkPartId !== row.part_num && {
        bricklinkPartId,
      }),
    };
  });
  const partRowMap = new Map<string, InventoryRow>();
  for (const r of rows) {
    partRowMap.set(r.inventoryKey, r);
  }
  const regularInventoryKeys = new Set(rows.map(r => r.inventoryKey));

  // ---- Minifigs (parents + components) from catalog ----
  const parentRows: InventoryRow[] = [];
  const orphanComponents: InventoryRow[] = [];
  const addedComponentKeys = new Set<string>();

  if (inventoryCandidates.length > 0) {
    // Use the same selected inventory ID as parts
    const selectedInventoryId = inventoryCandidates[0]!.id;
    const { data: inventoryMinifigs, error: invFigsError } = await supabase
      .from('rb_inventory_minifigs')
      .select('fig_num, quantity')
      .eq('inventory_id', selectedInventoryId);

    if (invFigsError) {
      throw new Error(
        `Supabase getSetInventoryLocal rb_inventory_minifigs failed: ${invFigsError.message}`
      );
    }

    const figNums = Array.from(
      new Set(
        (inventoryMinifigs ?? [])
          .map(f => (typeof f?.fig_num === 'string' ? f.fig_num.trim() : ''))
          .filter(Boolean)
      )
    );

    if (figNums.length > 0) {
      const [figMetaRes, figImagesRes, figPartsRes] = await Promise.all([
        supabase
          .from('rb_minifigs')
          .select('fig_num, name, num_parts')
          .in('fig_num', figNums),
        supabase
          .from('rb_minifig_images')
          .select('fig_num, image_url')
          .in('fig_num', figNums),
        supabase
          .from('rb_minifig_parts')
          .select('fig_num, part_num, color_id, quantity')
          .in('fig_num', figNums),
      ]);

      if (figMetaRes.error) {
        throw new Error(
          `Supabase getSetInventoryLocal rb_minifigs failed: ${figMetaRes.error.message}`
        );
      }
      if (figImagesRes.error) {
        throw new Error(
          `Supabase getSetInventoryLocal rb_minifig_images failed: ${figImagesRes.error.message}`
        );
      }
      if (figPartsRes.error) {
        throw new Error(
          `Supabase getSetInventoryLocal rb_minifig_parts failed: ${figPartsRes.error.message}`
        );
      }

      const figMetaById = new Map<
        string,
        { name?: string | null; num_parts?: number | null }
      >();
      for (const m of figMetaRes.data ?? []) {
        figMetaById.set(m.fig_num, {
          name: m.name ?? null,
          num_parts: m.num_parts ?? null,
        });
      }

      const figImgById = new Map<string, string | null>();
      for (const img of figImagesRes.data ?? []) {
        figImgById.set(
          img.fig_num,
          typeof img.image_url === 'string' && img.image_url.trim().length > 0
            ? img.image_url.trim()
            : null
        );
      }

      const figPartsByFig = new Map<
        string,
        Array<{ part_num: string; color_id: number; quantity: number }>
      >();
      const figPartNums = new Set<string>();
      const figColorIds = new Set<number>();
      for (const p of figPartsRes.data ?? []) {
        const fn =
          typeof p.fig_num === 'string' && p.fig_num.trim().length > 0
            ? p.fig_num.trim()
            : null;
        if (!fn) continue;
        const partNum =
          typeof p.part_num === 'string' && p.part_num.trim().length > 0
            ? p.part_num.trim()
            : null;
        if (!partNum) continue;
        const colorId =
          typeof p.color_id === 'number' && Number.isFinite(p.color_id)
            ? p.color_id
            : 0;
        const quantity =
          typeof p.quantity === 'number' && Number.isFinite(p.quantity)
            ? p.quantity
            : 1;
        figPartNums.add(partNum);
        figColorIds.add(colorId);
        if (!figPartsByFig.has(fn)) figPartsByFig.set(fn, []);
        figPartsByFig.get(fn)!.push({ part_num: partNum, color_id: colorId, quantity });
      }

      // Fetch missing part metadata for minifig components not already loaded
      const missingPartNums = Array.from(figPartNums).filter(
        pn => !partMap.has(pn)
      );
      if (missingPartNums.length > 0) {
        const { data: extraParts, error: extraPartsError } = await supabase
          .from('rb_parts')
          .select('part_num, name, part_cat_id, image_url, external_ids')
          .in('part_num', missingPartNums);
        if (extraPartsError) {
          throw new Error(
            `Supabase getSetInventoryLocal rb_parts (minifig components) failed: ${extraPartsError.message}`
          );
        }
        for (const p of extraParts ?? []) {
          partMap.set(p.part_num, {
            part_num: p.part_num,
            name: p.name,
            part_cat_id:
              typeof p.part_cat_id === 'number' ? p.part_cat_id : null,
            image_url:
              typeof p.image_url === 'string' && p.image_url.trim().length > 0
                ? p.image_url.trim()
                : null,
            external_ids: p.external_ids as Json,
          });
        }
      }

      // Fetch missing categories introduced by the extra parts
      const missingCatIds = Array.from(
        new Set(
          Array.from(partMap.values())
            .map(p => p.part_cat_id)
            .filter(
              (cid): cid is number =>
                typeof cid === 'number' && !categoryMap.has(cid)
            )
        )
      );
      if (missingCatIds.length > 0) {
        const { data: extraCats, error: extraCatsError } = await supabase
          .from('rb_part_categories')
          .select('id, name')
          .in('id', missingCatIds);
        if (extraCatsError) {
          throw new Error(
            `Supabase getSetInventoryLocal rb_part_categories (minifig components) failed: ${extraCatsError.message}`
          );
        }
        for (const c of extraCats ?? []) {
          categoryMap.set(c.id, { id: c.id, name: c.name });
        }
      }

      // Fetch missing colors introduced by minifig components
      const missingColorIds = Array.from(figColorIds).filter(
        cid => !colorMap.has(cid)
      );
      if (missingColorIds.length > 0) {
        const { data: extraColors, error: extraColorsError } = await supabase
          .from('rb_colors')
          .select('id, name')
          .in('id', missingColorIds);
        if (extraColorsError) {
          throw new Error(
            `Supabase getSetInventoryLocal rb_colors (minifig components) failed: ${extraColorsError.message}`
          );
        }
        for (const c of extraColors ?? []) {
          colorMap.set(c.id, { id: c.id, name: c.name });
        }
      }

      for (const invFig of inventoryMinifigs ?? []) {
        const figNum =
          typeof invFig?.fig_num === 'string' && invFig.fig_num.trim().length > 0
            ? invFig.fig_num.trim()
            : null;
        if (!figNum) continue;
        const parentQuantity =
          typeof invFig.quantity === 'number' && Number.isFinite(invFig.quantity)
            ? invFig.quantity
            : 1;
        const parentKey = `fig:${figNum}`;
        const meta = figMetaById.get(figNum);
        const parentRow: InventoryRow = {
          setNumber: trimmedSet,
          partId: parentKey,
          partName: meta?.name ?? figNum,
          colorId: 0,
          colorName: '—',
          quantityRequired: parentQuantity,
          imageUrl: figImgById.get(figNum) ?? null,
          partCategoryName: 'Minifig',
          parentCategory: 'Minifigure',
          inventoryKey: parentKey,
          componentRelations: [],
        };

        if (!parentRow.imageUrl) {
          // Leave image null so the client enrichment pipeline can fetch an accurate URL.
          parentRow.imageUrl = null;
        }

        const figParts = figPartsByFig.get(figNum) ?? [];
        for (const component of figParts) {
          const perParentQty = Math.max(
            1,
            Math.floor(component.quantity ?? 1)
          );
          const inventoryKey = `${component.part_num}:${component.color_id}`;
          const existingRow = partRowMap.get(inventoryKey);

          if (existingRow) {
            const isRegular = regularInventoryKeys.has(inventoryKey);
            if (!isRegular) {
              existingRow.quantityRequired += perParentQty;
            }
            if (!existingRow.parentRelations) {
              existingRow.parentRelations = [];
            }
            existingRow.parentRelations.push({
              parentKey,
              quantity: perParentQty,
            });
            parentRow.componentRelations!.push({
              key: inventoryKey,
              quantity: perParentQty,
            });
          } else {
            const partMeta = partMap.get(component.part_num);
            const catId =
              typeof partMeta?.part_cat_id === 'number'
                ? partMeta.part_cat_id
                : undefined;
            const catName =
              typeof catId === 'number' ? categoryMap.get(catId)?.name : undefined;
            const parentCategory =
              catName != null ? mapCategoryNameToParent(catName) : 'Minifigure';
            const bricklinkPartId = extractBricklinkPartId(
              partMeta?.external_ids
            );
            const color =
              typeof component.color_id === 'number'
                ? colorMap.get(component.color_id)
                : null;
            const childRow: InventoryRow = {
              setNumber: trimmedSet,
              partId: component.part_num,
              partName: partMeta?.name ?? component.part_num,
              colorId: component.color_id,
              colorName: color?.name ?? `Color ${component.color_id}`,
              quantityRequired: perParentQty,
              imageUrl: partMeta?.image_url ?? null,
              ...(typeof catId === 'number' && { partCategoryId: catId }),
              ...(catName && { partCategoryName: catName }),
              ...(parentCategory && { parentCategory }),
              inventoryKey,
              parentRelations: [{ parentKey, quantity: perParentQty }],
              ...(bricklinkPartId &&
                bricklinkPartId !== component.part_num && { bricklinkPartId }),
            };
            parentRow.componentRelations!.push({
              key: inventoryKey,
              quantity: perParentQty,
            });
            partRowMap.set(inventoryKey, childRow);
            if (!addedComponentKeys.has(inventoryKey)) {
              orphanComponents.push(childRow);
              addedComponentKeys.add(inventoryKey);
            }
          }
        }

        parentRows.push(parentRow);
      }
    }
  }

  const mergedRows = Array.from(partRowMap.values());
  return [...mergedRows, ...parentRows];
}

export async function getSetsForPartLocal(
  partNum: string,
  colorId?: number | null
): Promise<PartInSet[]> {
  const trimmed = partNum.trim();
  if (!trimmed) return [];

  const supabase = getCatalogReadClient();
  const query = supabase
    .from('rb_set_parts')
    .select(
      `
        set_num,
        quantity,
        color_id,
        rb_sets!inner (
          set_num,
          name,
          year,
          num_parts,
          image_url,
          theme_id
        )
      `
    )
    .eq('part_num', trimmed)
    .eq('is_spare', false)
    .limit(1000);

  if (typeof colorId === 'number') {
    query.eq('color_id', colorId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(
      `Supabase getSetsForPartLocal failed: ${error.message}`
    );
  }

  if (!data || data.length === 0) return [];

  const themes = await getThemesLocal();
  const themeById = new Map<number, LocalTheme>(
    (themes ?? []).map(t => [t.id, t])
  );

  const bySet = new Map<string, PartInSet>();

  for (const row of data) {
    const set = (row as unknown as { rb_sets?: Record<string, unknown> }).rb_sets;
    if (!set) continue;

    const setNum = String((set as { set_num?: unknown }).set_num ?? row.set_num ?? '').trim();
    if (!setNum) continue;

    const key = setNum.toLowerCase();
    const quantity =
      typeof row.quantity === 'number' && Number.isFinite(row.quantity)
        ? row.quantity
        : 1;

    const rawThemeId =
      typeof (set as { theme_id?: unknown }).theme_id === 'number' &&
      Number.isFinite((set as { theme_id?: number }).theme_id)
        ? (set as { theme_id: number }).theme_id
        : null;
    const themeName = deriveRootThemeName(themeById, rawThemeId);

    const base: PartInSet = {
      setNumber: setNum,
      name: String((set as { name?: unknown }).name ?? setNum),
      year:
        typeof (set as { year?: unknown }).year === 'number' &&
        Number.isFinite((set as { year: number }).year)
          ? (set as { year: number }).year
          : 0,
      imageUrl:
        typeof (set as { image_url?: unknown }).image_url === 'string'
          ? ((set as { image_url: string }).image_url ?? null)
          : null,
      quantity,
      numParts:
        typeof (set as { num_parts?: unknown }).num_parts === 'number' &&
        Number.isFinite((set as { num_parts: number }).num_parts)
          ? (set as { num_parts: number }).num_parts
          : null,
      themeId: rawThemeId,
      themeName: themeName ?? null,
    };

    const existing = bySet.get(key);
    if (!existing) {
      bySet.set(key, base);
    } else {
      existing.quantity += base.quantity;
      if (existing.year === 0 && base.year !== 0) existing.year = base.year;
      if (existing.numParts == null && base.numParts != null) {
        existing.numParts = base.numParts;
      }
      if (!existing.themeId && base.themeId) existing.themeId = base.themeId;
      if (!existing.themeName && base.themeName) {
        existing.themeName = base.themeName;
      }
      if (!existing.imageUrl && base.imageUrl) existing.imageUrl = base.imageUrl;
      if (!existing.name && base.name) existing.name = base.name;
    }
  }

  return Array.from(bySet.values());
}

