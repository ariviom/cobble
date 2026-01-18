import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { getThemesLocal, type LocalTheme } from '@/app/lib/catalog/themes';
import { logger } from '@/lib/metrics';

export type ExclusivePiece = {
  partNum: string;
  partName: string;
  partImage: string | null;
  colorId: number;
  colorName: string;
  colorRgb: string | null;
  setNum: string;
  setName: string;
  setYear: number;
  setImage: string | null;
};

/**
 * Get all theme IDs that are descendants of the given theme (including itself).
 * Traverses up to 3 levels deep which covers most theme hierarchies.
 */
function getThemeDescendants(
  themeId: number,
  themes: LocalTheme[]
): Set<number> {
  const result = new Set<number>([themeId]);
  const themesByParent = new Map<number, number[]>();

  // Build parent → children map
  for (const t of themes) {
    if (t.parent_id != null) {
      const children = themesByParent.get(t.parent_id) ?? [];
      children.push(t.id);
      themesByParent.set(t.parent_id, children);
    }
  }

  // BFS to find all descendants
  const queue = [themeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = themesByParent.get(current) ?? [];
    for (const child of children) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }

  return result;
}

/** Search by theme (includes all sub-themes) */
export type ThemeSearchOptions = {
  themeId: number;
  setNums?: undefined;
};

/** Search by specific set numbers (e.g., user's collection) */
export type SetSearchOptions = {
  themeId?: undefined;
  setNums: string[];
};

export type ExclusivePiecesOptions = ThemeSearchOptions | SetSearchOptions;

/**
 * Find all part+color combinations that appear in exactly one set worldwide.
 * Can search by theme (includes sub-themes) OR by specific set numbers.
 */
export async function getExclusivePieces(
  options: ExclusivePiecesOptions
): Promise<ExclusivePiece[]> {
  const supabase = getCatalogReadClient();

  let targetSetNums: Set<string>;

  if ('themeId' in options && options.themeId !== undefined) {
    // Search by theme - get all sets in theme tree
    const themes = await getThemesLocal();
    const themeIds = getThemeDescendants(options.themeId, themes);
    const themeIdArray = Array.from(themeIds);

    const { data: themeSets, error: themeSetsError } = await supabase
      .from('rb_sets')
      .select('set_num')
      .in('theme_id', themeIdArray);

    if (themeSetsError) {
      throw new Error(`Failed to fetch theme sets: ${themeSetsError.message}`);
    }

    if (!themeSets || themeSets.length === 0) {
      return [];
    }

    targetSetNums = new Set(themeSets.map(s => s.set_num));

    logger.debug('exclusive_pieces.theme_search', {
      themeId: options.themeId,
      themeIds: themeIdArray,
      setCount: targetSetNums.size,
    });
  } else if ('setNums' in options && options.setNums.length > 0) {
    // Search by specific set numbers
    targetSetNums = new Set(options.setNums);

    logger.debug('exclusive_pieces.set_search', {
      setCount: targetSetNums.size,
      sampleSets: options.setNums.slice(0, 5),
    });
  } else {
    return [];
  }

  return findExclusivePiecesInSets(targetSetNums, supabase);
}

// Keep old function name as alias for backwards compatibility
export const getExclusivePiecesForTheme = getExclusivePieces;

/**
 * Find pieces that are GLOBALLY unique (appear in exactly one set worldwide),
 * filtered to only show those that belong to the target sets.
 */
async function findExclusivePiecesInSets(
  targetSetNums: Set<string>,
  supabase: ReturnType<typeof getCatalogReadClient>
): Promise<ExclusivePiece[]> {
  const setNumArray = Array.from(targetSetNums);
  const BATCH_SIZE = 100;

  // Step 1: Get inventory IDs for sets in the theme
  const themeInventories: Array<{ id: number; set_num: string }> = [];
  for (let i = 0; i < setNumArray.length; i += BATCH_SIZE) {
    const batch = setNumArray.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase
      .from('rb_inventories')
      .select('id, set_num')
      .in('set_num', batch);

    if (error) {
      throw new Error(`Failed to fetch inventories: ${error.message}`);
    }

    themeInventories.push(
      ...(data ?? []).filter(
        (row): row is { id: number; set_num: string } =>
          typeof row.id === 'number' && typeof row.set_num === 'string'
      )
    );
  }

  const inv5978 = themeInventories.find(i => i.set_num === '5978-1');
  logger.debug('exclusive_pieces.theme_inventories', {
    count: themeInventories.length,
    sample: themeInventories.slice(0, 3),
    inv5978: inv5978 ?? 'NOT FOUND',
  });

  if (themeInventories.length === 0) {
    return [];
  }

  // Build inventory_id -> set_num mapping
  const inventoryToSet = new Map<number, string>();
  for (const inv of themeInventories) {
    inventoryToSet.set(inv.id, inv.set_num);
  }
  const inventoryIds = Array.from(inventoryToSet.keys());

  // Step 2: Get parts for sets in the theme using rb_inventory_parts_public
  // Also fetch img_url for part images
  const allSetParts: Array<{
    set_num: string;
    part_num: string;
    color_id: number;
    img_url: string | null;
  }> = [];

  // Batch inventories in small groups with high row limits
  const INV_BATCH_SIZE = 10; // Small batches since each set has ~100-500 parts
  for (let i = 0; i < inventoryIds.length; i += INV_BATCH_SIZE) {
    const batch = inventoryIds.slice(i, i + INV_BATCH_SIZE);
    const { data, error } = await supabase
      .from('rb_inventory_parts_public')
      .select('inventory_id, part_num, color_id, img_url')
      .in('inventory_id', batch)
      .eq('is_spare', false)
      .limit(5000); // 10 sets * ~500 parts each

    if (error) {
      throw new Error(`Failed to fetch inventory parts: ${error.message}`);
    }

    for (const row of data ?? []) {
      const setNum = inventoryToSet.get(row.inventory_id as number);
      if (setNum && row.part_num && typeof row.color_id === 'number') {
        allSetParts.push({
          set_num: setNum,
          part_num: row.part_num,
          color_id: row.color_id,
          img_url:
            typeof row.img_url === 'string' && row.img_url.trim()
              ? row.img_url.trim()
              : null,
        });
      }
    }
  }

  // Get unique part numbers from theme sets to query global occurrences
  const uniqueParts = Array.from(new Set(allSetParts.map(p => p.part_num)));

  const parts5978 = allSetParts.filter(p => p.set_num === '5978-1');
  logger.debug('exclusive_pieces.theme_parts', {
    totalParts: allSetParts.length,
    uniqueParts: uniqueParts.length,
    sampleParts: uniqueParts.slice(0, 5),
    parts5978Count: parts5978.length,
    parts5978Sample: parts5978.slice(0, 3),
  });

  if (uniqueParts.length === 0) {
    return [];
  }

  // Step 3: Get ALL global occurrences via rb_inventory_parts_public
  // We need to count distinct sets per part+color across ALL sets, not just theme sets
  const globalPartColorSets = new Map<string, Set<string>>();

  // Query parts individually but in parallel batches to avoid row limits
  // Supabase has a default 1000 row limit that overrides .limit() for large queries
  const allInvIdsNeeded = new Set<number>();
  const partOccurrences: Array<{
    inventory_id: number;
    part_num: string;
    color_id: number;
  }> = [];

  // Process in parallel batches of 10 concurrent requests
  const CONCURRENT_REQUESTS = 10;
  for (let i = 0; i < uniqueParts.length; i += CONCURRENT_REQUESTS) {
    const batch = uniqueParts.slice(i, i + CONCURRENT_REQUESTS);
    const results = await Promise.all(
      batch.map(partNum =>
        supabase
          .from('rb_inventory_parts_public')
          .select('inventory_id, part_num, color_id')
          .eq('part_num', partNum)
          .eq('is_spare', false)
          .limit(10000)
      )
    );

    for (const result of results) {
      if (result.error) {
        throw new Error(
          `Failed to fetch global inventory parts: ${result.error.message}`
        );
      }

      for (const row of result.data ?? []) {
        if (
          typeof row.inventory_id === 'number' &&
          row.part_num &&
          typeof row.color_id === 'number'
        ) {
          partOccurrences.push({
            inventory_id: row.inventory_id,
            part_num: row.part_num,
            color_id: row.color_id,
          });
          allInvIdsNeeded.add(row.inventory_id);
        }
      }
    }
  }

  // Fetch all needed inventory -> set_num mappings at once
  const globalInvToSet = new Map<number, string>();
  const invIdsArray = Array.from(allInvIdsNeeded);
  for (let j = 0; j < invIdsArray.length; j += BATCH_SIZE) {
    const invBatch = invIdsArray.slice(j, j + BATCH_SIZE);
    const { data: invs, error: invsError } = await supabase
      .from('rb_inventories')
      .select('id, set_num')
      .in('id', invBatch);

    if (invsError) {
      throw new Error(
        `Failed to fetch global inventories: ${invsError.message}`
      );
    }

    for (const inv of invs ?? []) {
      if (typeof inv.id === 'number' && typeof inv.set_num === 'string') {
        globalInvToSet.set(inv.id, inv.set_num);
      }
    }
  }

  // Now count distinct sets per part+color
  for (const row of partOccurrences) {
    const setNum = globalInvToSet.get(row.inventory_id);
    if (!setNum) continue;

    const key = `${row.part_num}:${row.color_id}`;
    const existing = globalPartColorSets.get(key);
    if (!existing) {
      globalPartColorSets.set(key, new Set([setNum]));
    } else {
      existing.add(setNum);
    }
  }

  logger.debug('exclusive_pieces.global_part_colors', {
    totalPartColors: globalPartColorSets.size,
  });

  // Filter to pieces that appear in exactly ONE set globally AND that set is in our theme
  const exclusivePieces: Array<{
    partNum: string;
    colorId: number;
    setNum: string;
  }> = [];

  let uniqueGlobalCount = 0;
  for (const [key, sets] of globalPartColorSets) {
    if (sets.size === 1) {
      uniqueGlobalCount++;
      const setNum = Array.from(sets)[0];
      // Only include if this set is in our theme
      if (targetSetNums.has(setNum)) {
        const [partNum, colorIdStr] = key.split(':');
        exclusivePieces.push({
          partNum,
          colorId: parseInt(colorIdStr, 10),
          setNum,
        });
      }
    }
  }

  logger.debug('exclusive_pieces.found', {
    uniqueGlobalCount,
    inThemeCount: exclusivePieces.length,
    sample: exclusivePieces.slice(0, 3),
  });

  if (exclusivePieces.length === 0) {
    return [];
  }

  // Build part+color → img_url map from inventory parts (preferred image source)
  const partImageMap = new Map<string, string>();
  for (const p of allSetParts) {
    if (p.img_url) {
      const key = `${p.part_num}:${p.color_id}`;
      if (!partImageMap.has(key)) {
        partImageMap.set(key, p.img_url);
      }
    }
  }

  // Fetch metadata for the exclusive pieces
  const partNums = Array.from(new Set(exclusivePieces.map(p => p.partNum)));
  const colorIds = Array.from(new Set(exclusivePieces.map(p => p.colorId)));
  const setNums = Array.from(new Set(exclusivePieces.map(p => p.setNum)));

  const [partsRes, colorsRes, setsRes] = await Promise.all([
    supabase
      .from('rb_parts')
      .select('part_num, name, image_url')
      .in('part_num', partNums),
    supabase.from('rb_colors').select('id, name, rgb').in('id', colorIds),
    supabase
      .from('rb_sets')
      .select('set_num, name, year, image_url')
      .in('set_num', setNums),
  ]);

  if (partsRes.error || colorsRes.error || setsRes.error) {
    throw new Error('Failed to fetch metadata for exclusive pieces');
  }

  const partMap = new Map((partsRes.data ?? []).map(p => [p.part_num, p]));
  const colorMap = new Map((colorsRes.data ?? []).map(c => [c.id, c]));
  const setMap = new Map((setsRes.data ?? []).map(s => [s.set_num, s]));

  return exclusivePieces.map(ep => {
    const part = partMap.get(ep.partNum);
    const color = colorMap.get(ep.colorId);
    const set = setMap.get(ep.setNum);
    // Prefer inventory-specific image over generic part image
    const imageKey = `${ep.partNum}:${ep.colorId}`;
    const partImage = partImageMap.get(imageKey) ?? part?.image_url ?? null;

    return {
      partNum: ep.partNum,
      partName: part?.name ?? ep.partNum,
      partImage,
      colorId: ep.colorId,
      colorName: color?.name ?? `Color ${ep.colorId}`,
      colorRgb: color?.rgb ?? null,
      setNum: ep.setNum,
      setName: set?.name ?? ep.setNum,
      setYear: set?.year ?? 0,
      setImage: set?.image_url ?? null,
    };
  });
}
