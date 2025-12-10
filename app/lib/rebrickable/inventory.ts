import { rbFetch, rbFetchAbsolute } from '@/app/lib/rebrickable/client';
import { getMinifigPartsCached } from '@/app/lib/rebrickable/minifigs';
import { getPartCategories } from '@/app/lib/rebrickable/parts';
import { getThemes } from '@/app/lib/rebrickable/themes';
import type {
  InventoryRow,
  RebrickableCategory,
  RebrickableSetInventoryItem,
  RebrickableSetMinifigItem,
  RebrickableSetSearchResult,
  RebrickableTheme,
} from '@/app/lib/rebrickable/types';
import {
  extractBricklinkPartId,
  mapCategoryNameToParent,
} from '@/app/lib/rebrickable/utils';

export async function getSetInventory(
  setNumber: string
): Promise<InventoryRow[]> {
  type Page = { results: RebrickableSetInventoryItem[]; next: string | null };

  // Fetch all pages of parts for the set with external_ids included
  const firstPage = await rbFetch<Page>(
    `/lego/sets/${encodeURIComponent(setNumber)}/parts/`,
    { page_size: 1000, inc_part_details: 1 }
  );
  const allItems: RebrickableSetInventoryItem[] = [...firstPage.results];
  let nextUrl: string | null = firstPage.next;
  while (nextUrl) {
    const page = await rbFetchAbsolute<Page>(nextUrl);
    allItems.push(...page.results);
    nextUrl = page.next;
  }

  const cats = await getPartCategories();
  const idToName = new Map<number, string>(cats.map(c => [c.id, c.name]));

  const partRows = allItems
    .filter(i => !i.is_spare)
    .map(i => {
      const catId = i.part.part_cat_id;
      const catName = catId != null ? idToName.get(catId) : undefined;
      const parentCategory =
        catName != null ? mapCategoryNameToParent(catName) : undefined;
      const inventoryKey = `${i.part.part_num}:${i.color.id}`;
      const bricklinkPartId = extractBricklinkPartId(i.part.external_ids);
      return {
        setNumber,
        partId: i.part.part_num,
        partName: i.part.name,
        colorId: i.color.id,
        colorName: i.color.name,
        quantityRequired: i.quantity,
        imageUrl: i.part.part_img_url,
        elementId: i.element_id ?? null,
        ...(catId != null && { partCategoryId: catId }),
        ...(catName && { partCategoryName: catName }),
        ...(parentCategory && { parentCategory }),
        inventoryKey,
        // Only include bricklinkPartId if different from partId
        ...(bricklinkPartId &&
          bricklinkPartId !== i.part.part_num && {
            bricklinkPartId,
          }),
      } satisfies InventoryRow;
    });

  const partRowMap = new Map<string, InventoryRow>();
  const regularInventoryKeys = new Set<string>();
  partRows.forEach(row => {
    partRowMap.set(row.inventoryKey, row);
    regularInventoryKeys.add(row.inventoryKey);
  });

  // Fetch all minifigs for the set (separate endpoint) and map them into rows
  type MinifigPage = {
    results: RebrickableSetMinifigItem[];
    next: string | null;
  };
  const firstMinifigs = await rbFetch<MinifigPage>(
    `/lego/sets/${encodeURIComponent(setNumber)}/minifigs/`,
    { page_size: 1000 }
  );
  const allMinifigs: RebrickableSetMinifigItem[] = [...firstMinifigs.results];
  let nextMinUrl: string | null = firstMinifigs.next;
  while (nextMinUrl) {
    const pg = await rbFetchAbsolute<MinifigPage>(nextMinUrl);
    allMinifigs.push(...pg.results);
    nextMinUrl = pg.next;
  }

  const minifigParents: InventoryRow[] = [];
  const orphanComponents: InventoryRow[] = [];
  const addedComponentKeys = new Set<string>();

  for (let idx = 0; idx < allMinifigs.length; idx++) {
    const entry = allMinifigs[idx]!;
    const rawId =
      entry.fig_num ??
      entry.set_num ??
      entry.minifig?.fig_num ??
      entry.minifig?.set_num ??
      '';
    const figNum = rawId && rawId.trim() ? rawId.trim() : `unknown-${idx + 1}`;
    const parentKey = `fig:${figNum}`;
    const figName =
      entry.name ?? entry.set_name ?? entry.minifig?.name ?? 'Minifigure';
    const imgUrl = entry.set_img_url ?? entry.minifig?.set_img_url ?? null;
    const parentQuantity = entry.quantity ?? 1;
    const parentRow: InventoryRow = {
      setNumber,
      partId: parentKey,
      partName: figName,
      colorId: 0,
      colorName: '—',
      quantityRequired: parentQuantity,
      imageUrl: imgUrl,
      partCategoryName: 'Minifig',
      parentCategory: 'Minifigure',
      inventoryKey: parentKey,
      componentRelations: [],
    };

    if (figNum && !figNum.startsWith('unknown')) {
      try {
        const components = await getMinifigPartsCached(figNum);
        for (const component of components) {
          if (!component?.part?.part_num) continue;
          const perParentQty = Math.max(1, Math.floor(component.quantity ?? 1));
          const colorId =
            component.color && typeof component.color.id === 'number'
              ? component.color.id
              : 0;
          const colorName =
            component.color && typeof component.color.name === 'string'
              ? component.color.name
              : '—';
          const baseKey = `${component.part.part_num}:${colorId}`;
          const existingRow = partRowMap.get(baseKey);
          if (existingRow) {
            // Part already exists. Check if it came from regular inventory or another minifigure.
            const isFromRegularInventory = regularInventoryKeys.has(baseKey);
            if (!isFromRegularInventory) {
              // Part came from another minifigure, so aggregate quantities across minifigures
              // Don't multiply by parentQuantity - aggregate per minifigure instance
              existingRow.quantityRequired += perParentQty;
            }
            // Always track parentRelation for minifigure completion logic
            if (!existingRow.parentRelations) {
              existingRow.parentRelations = [];
            }
            existingRow.parentRelations.push({
              parentKey,
              quantity: perParentQty,
            });
            parentRow.componentRelations!.push({
              key: existingRow.inventoryKey,
              quantity: perParentQty,
            });
          } else {
            // Create new row using baseKey (same format as regular parts) to avoid duplicates
            const inventoryKey = baseKey;
            const catId = component.part.part_cat_id;
            const resolvedCategoryName =
              catId != null
                ? (idToName.get(catId) ?? 'Minifig Component')
                : 'Minifig Component';
            const bricklinkPartId = extractBricklinkPartId(
              component.part.external_ids
            );

            const childRow: InventoryRow = {
              setNumber,
              partId: component.part.part_num,
              partName: component.part.name ?? component.part.part_num,
              colorId,
              colorName,
              // Don't multiply by parentQuantity - use per minifigure instance quantity
              quantityRequired: perParentQty,
              imageUrl: component.part.part_img_url ?? null,
              ...(catId != null && { partCategoryId: catId }),
              partCategoryName: resolvedCategoryName,
              parentCategory: 'Minifigure',
              inventoryKey,
              parentRelations: [{ parentKey, quantity: perParentQty }],
              // Only include bricklinkPartId if different from partId
              ...(bricklinkPartId &&
                bricklinkPartId !== component.part.part_num && {
                  bricklinkPartId,
                }),
            };
            parentRow.componentRelations!.push({
              key: inventoryKey,
              quantity: perParentQty,
            });
            partRowMap.set(inventoryKey, childRow);
            // Only add to orphanComponents if we haven't added this key yet
            if (!addedComponentKeys.has(inventoryKey)) {
              orphanComponents.push(childRow);
              addedComponentKeys.add(inventoryKey);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch minifig parts', {
          figNum,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    minifigParents.push(parentRow);
  }

  return [...partRows, ...orphanComponents, ...minifigParents];
}

let setSummaryCache: {
  at: number;
  items: Map<
    string,
    {
      setNumber: string;
      name: string;
      year: number;
      numParts: number;
      imageUrl: string | null;
      themeId: number | null;
      themeName: string | null;
    }
  >;
} | null = null;

export async function getSetSummary(setNumber: string): Promise<{
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
}> {
  const now = Date.now();
  const ttl = 60 * 60 * 1000; // 1h
  if (setSummaryCache && now - setSummaryCache.at < ttl) {
    const cached = setSummaryCache.items.get(setNumber.toLowerCase());
    if (cached) return cached;
  }
  const d = await rbFetch<RebrickableSetSearchResult>(
    `/lego/sets/${encodeURIComponent(setNumber)}/`
  );

  // Normalize theme id first.
  const rawThemeId =
    typeof d.theme_id === 'number' && Number.isFinite(d.theme_id)
      ? d.theme_id
      : null;

  // Resolve root theme name using cached Rebrickable themes when available.
  let themeName: string | null = null;
  if (rawThemeId != null) {
    try {
      const themes = await getThemes();
      const themeById = new Map<number, RebrickableTheme>(
        themes.map(t => [t.id, t])
      );
      let current: RebrickableTheme | null | undefined =
        themeById.get(rawThemeId) ?? null;
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
      // If theme lookup fails, keep themeName as null.
      themeName = null;
    }
  }

  const result = {
    setNumber: d.set_num,
    name: d.name,
    year: d.year,
    numParts: d.num_parts,
    imageUrl: d.set_img_url,
    themeId: rawThemeId,
    themeName,
  };
  if (!setSummaryCache || now - setSummaryCache.at >= ttl) {
    setSummaryCache = { at: now, items: new Map() };
  }
  setSummaryCache.items.set(setNumber.toLowerCase(), result);
  return result;
}

export type RebrickableCategoryResult = RebrickableCategory;
