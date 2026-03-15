import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

export async function getPartByPartNum(partNum: string) {
  const supabase = getCatalogReadClient();
  const { data, error } = await supabase
    .from('rb_parts')
    .select('part_num, name, part_cat_id, bl_part_id')
    .eq('part_num', partNum)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export async function getPartColors(partNum: string) {
  // rb_part_rarity has no FK to rb_colors, so we need a separate query.
  const supabase = getCatalogReadClient();
  const { data: rarityRows } = await supabase
    .from('rb_part_rarity')
    .select('color_id')
    .eq('part_num', partNum);

  if (!rarityRows?.length) return [];

  const colorIds = rarityRows.map(r => r.color_id);
  const { data: colors } = await supabase
    .from('rb_colors')
    .select('id, name, rgb')
    .in('id', colorIds);

  return (colors ?? []).map(c => ({
    color_id: c.id,
    name: c.name,
    rgb: c.rgb,
  }));
}

export async function getPartSetCount(partNum: string, colorId?: number) {
  const supabase = getCatalogReadClient();
  let query = supabase
    .from('rb_part_rarity')
    .select('set_count, color_id')
    .eq('part_num', partNum);

  if (colorId != null) {
    query = query.eq('color_id', colorId);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getSetsContainingPart(partNum: string, colorId?: number) {
  // rb_inventory_parts has a FK to rb_inventories, so we do two queries.
  const supabase = getCatalogReadClient();
  let query = supabase
    .from('rb_inventory_parts')
    .select('inventory_id')
    .eq('part_num', partNum)
    .eq('is_spare', false);

  if (colorId != null) {
    query = query.eq('color_id', colorId);
  }

  const { data: invParts } = await query.limit(500);
  if (!invParts?.length) return [];

  const invIds = [...new Set(invParts.map(r => r.inventory_id))];

  const { data: inventories } = await supabase
    .from('rb_inventories')
    .select('set_num')
    .in('id', invIds.slice(0, 200))
    .not('set_num', 'like', 'fig-%');

  const setNums = new Set<string>();
  for (const row of inventories ?? []) {
    if (row.set_num) setNums.add(row.set_num);
  }
  return [...setNums];
}

// ---------------------------------------------------------------------------
// Part search
// ---------------------------------------------------------------------------

const DIMENSION_PATTERN = /(\d)\s*[xX]\s*(\d)/g;
/** Matches a trailing dimension like "1 x 1" or "2 x 4 x 3" at end of string. */
const TRAILING_DIMENSION = /\d+ x \d+( x \d+)*$/;

/** Normalize "1x2", "1X2", "1 x 2" → "1 x 2" for consistent ilike matching. */
function normalizeDimensions(query: string): string {
  return query.replace(DIMENSION_PATTERN, '$1 x $2');
}

/**
 * Build ilike patterns for a name search that respects dimension boundaries.
 * "1 x 1" should NOT match "1 x 10". We achieve this by requiring the
 * dimension to be followed by end-of-string or a space (not another digit).
 * Returns an array of ilike patterns to OR together.
 */
function buildNamePatterns(normalized: string): string[] {
  if (TRAILING_DIMENSION.test(normalized)) {
    // Query ends with a dimension — use boundary-aware patterns:
    // "%1 x 1" (at end of name) OR "%1 x 1 %" (followed by space, more text)
    return [`%${normalized}`, `%${normalized} %`];
  }
  return [`%${normalized}%`];
}

const MAX_QUERY_LENGTH = 200;
const SPECIAL_CHARS = /[%_\\]/g;

function sanitizePartQuery(query: string): string {
  return query
    .slice(0, MAX_QUERY_LENGTH)
    .replace(SPECIAL_CHARS, char => `\\${char}`)
    .trim();
}

type PartSearchOptions = {
  page: number;
  pageSize: number;
};

type PartSearchLocalResult = {
  partNum: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  colors: Array<{
    colorId: number;
    colorName: string;
    imageUrl: string | null;
  }>;
};

/** Max parts to fetch before sorting/paginating. Keeps queries fast. */
const SEARCH_CAP = 500;

export async function searchPartsLocal(
  rawQuery: string,
  opts: PartSearchOptions
): Promise<{ results: PartSearchLocalResult[]; nextPage: number | null }> {
  const sanitized = sanitizePartQuery(rawQuery);
  if (!sanitized) return { results: [], nextPage: null };

  const normalized = normalizeDimensions(sanitized);
  const { page, pageSize } = opts;
  const supabase = getCatalogReadClient();

  // Fetch up to SEARCH_CAP results so we can sort by popularity before paginating
  const namePatterns = buildNamePatterns(normalized);
  const nameFilter = namePatterns.map(p => `name.ilike.${p}`).join(',');

  const [byNum, byName] = await Promise.all([
    supabase
      .from('rb_parts')
      .select('part_num, name, part_cat_id, image_url')
      .ilike('part_num', `${normalized}%`)
      .range(0, SEARCH_CAP - 1),
    supabase
      .from('rb_parts')
      .select('part_num, name, part_cat_id, image_url')
      .or(nameFilter)
      .range(0, SEARCH_CAP - 1),
  ]);

  // Merge and deduplicate by part_num, preferring part_num matches first
  const seen = new Set<string>();
  const merged: NonNullable<typeof byNum.data> = [];
  for (const row of byNum.data ?? []) {
    if (!seen.has(row.part_num)) {
      seen.add(row.part_num);
      merged.push(row);
    }
  }
  for (const row of byName.data ?? []) {
    if (!seen.has(row.part_num)) {
      seen.add(row.part_num);
      merged.push(row);
    }
  }

  const error = byNum.error ?? byName.error;
  if (error || !merged.length) return { results: [], nextPage: null };

  // Batch-fetch set counts from rb_part_rarity and sort by popularity
  const allPartNums = merged.map(p => p.part_num);
  const setCountMap = await fetchSetCountsForParts(supabase, allPartNums);
  merged.sort(
    (a, b) =>
      (setCountMap.get(b.part_num) ?? 0) - (setCountMap.get(a.part_num) ?? 0)
  );

  // Paginate the sorted results
  const offset = (page - 1) * pageSize;
  const pageSlice = merged.slice(offset, offset + pageSize);
  const hasMore = offset + pageSize < merged.length;

  // Batch-fetch categories
  const catIds = [
    ...new Set(
      pageSlice.map(p => p.part_cat_id).filter((id): id is number => id != null)
    ),
  ];
  const categoryMap = new Map<number, string>();
  if (catIds.length > 0) {
    const { data: cats } = await supabase
      .from('rb_part_categories')
      .select('id, name')
      .in('id', catIds);
    for (const c of cats ?? []) {
      categoryMap.set(c.id, c.name);
    }
  }

  // Batch-fetch colors and one thumbnail image per part in parallel
  const partNums = pageSlice.map(p => p.part_num);
  const [colorsMap, thumbMap] = await Promise.all([
    fetchColorsForParts(supabase, partNums),
    fetchThumbnailsForParts(supabase, partNums),
  ]);

  const results: PartSearchLocalResult[] = pageSlice.map(p => {
    const partColors = colorsMap.get(p.part_num) ?? [];

    return {
      partNum: p.part_num,
      name: p.name,
      imageUrl: thumbMap.get(p.part_num) ?? p.image_url ?? null,
      categoryName: p.part_cat_id
        ? (categoryMap.get(p.part_cat_id) ?? null)
        : null,
      colors: partColors,
    };
  });

  return {
    results,
    nextPage: hasMore ? page + 1 : null,
  };
}

/**
 * Batch-fetch distinct colors for multiple parts.
 * Uses rb_part_rarity for the color list (compact: one row per part+color).
 * Does NOT fetch per-color images — those are loaded lazily when the modal opens.
 */
async function fetchColorsForParts(
  supabase: ReturnType<typeof getCatalogReadClient>,
  partNums: string[]
): Promise<
  Map<
    string,
    Array<{ colorId: number; colorName: string; imageUrl: string | null }>
  >
> {
  if (partNums.length === 0) return new Map();

  // 1. Get available colors from rb_part_rarity
  const rarityRows: Array<{ part_num: string; color_id: number }>[] = [];
  for (let i = 0; i < partNums.length; i += 200) {
    const batch = partNums.slice(i, i + 200);
    const { data } = await supabase
      .from('rb_part_rarity')
      .select('part_num, color_id')
      .in('part_num', batch);
    if (data) rarityRows.push(data);
  }
  const allRarity = rarityRows.flat();
  if (!allRarity.length) return new Map();

  // 2. Get color metadata from rb_colors
  const colorIds = [...new Set(allRarity.map(r => r.color_id))];
  const colorMeta = new Map<number, string>();
  for (let i = 0; i < colorIds.length; i += 200) {
    const batch = colorIds.slice(i, i + 200);
    const { data: colors } = await supabase
      .from('rb_colors')
      .select('id, name')
      .in('id', batch);
    for (const c of colors ?? []) {
      colorMeta.set(c.id, c.name);
    }
  }

  // 3. Assemble: group by part_num with color name (no images at search time)
  const result = new Map<
    string,
    Array<{ colorId: number; colorName: string; imageUrl: string | null }>
  >();
  for (const row of allRarity) {
    const name = colorMeta.get(row.color_id);
    if (!name) continue;
    if (!result.has(row.part_num)) result.set(row.part_num, []);
    result.get(row.part_num)!.push({
      colorId: row.color_id,
      colorName: name,
      imageUrl: null, // loaded lazily in modal
    });
  }

  return result;
}

/**
 * Fetch one thumbnail image per part. Queries rb_inventory_parts individually
 * per part (in parallel) to avoid row explosion from batch queries on popular parts.
 */
async function fetchThumbnailsForParts(
  supabase: ReturnType<typeof getCatalogReadClient>,
  partNums: string[]
): Promise<Map<string, string>> {
  if (partNums.length === 0) return new Map();

  const result = new Map<string, string>();

  // Query each part individually — just need one image row per part.
  // Run in parallel batches of 10 to avoid overwhelming the connection.
  const CONCURRENCY = 10;
  for (let i = 0; i < partNums.length; i += CONCURRENCY) {
    const batch = partNums.slice(i, i + CONCURRENCY);
    const promises = batch.map(async partNum => {
      const { data } = await supabase
        .from('rb_inventory_parts')
        .select('img_url')
        .eq('part_num', partNum)
        .not('img_url', 'is', null)
        .limit(1);
      const url = data?.[0]?.img_url;
      if (typeof url === 'string' && url.trim()) {
        result.set(partNum, url.trim());
      }
    });
    await Promise.all(promises);
  }

  return result;
}

/**
 * Batch-fetch total set counts per part_num from rb_part_rarity.
 * Sums set_count across all colors for each part.
 */
async function fetchSetCountsForParts(
  supabase: ReturnType<typeof getCatalogReadClient>,
  partNums: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (partNums.length === 0) return counts;

  for (let i = 0; i < partNums.length; i += 200) {
    const batch = partNums.slice(i, i + 200);
    const { data } = await supabase
      .from('rb_part_rarity')
      .select('part_num, set_count')
      .in('part_num', batch);

    for (const row of data ?? []) {
      counts.set(
        row.part_num,
        (counts.get(row.part_num) ?? 0) + (row.set_count ?? 0)
      );
    }
  }

  return counts;
}
