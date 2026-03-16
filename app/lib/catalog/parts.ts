import 'server-only';

import { LEGO_COLOR_IDS } from '@/app/components/collection/parts/colorGroups';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { sanitizeQuery } from '@/app/lib/utils/sanitizeQuery';

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

// ---------------------------------------------------------------------------
// Part search
// ---------------------------------------------------------------------------

const DIMENSION_PATTERN = /(\d)\s*[xX]\s*(\d)/g;
/** Matches a dimension like "1 x 1" or "2 x 4 x 3". */
const DIMENSION_RE = /\d+ x \d+( x \d+)*/;

/** Normalize "1x2", "1X2", "1 x 2" → "1 x 2" for consistent ilike matching. */
function normalizeDimensions(query: string): string {
  return query.replace(DIMENSION_PATTERN, '$1 x $2');
}

/**
 * Split a normalized query into search terms.
 * Dimensions like "1 x 2" are kept as a single term.
 * Other words are split by whitespace.
 * Returns terms in the order they should be AND-matched against part names.
 *
 * "1 x 2 tile" → ["1 x 2", "tile"]
 * "red brick 2 x 4" → ["red", "brick", "2 x 4"]
 * "3001" → ["3001"]
 */
function splitSearchTerms(normalized: string): string[] {
  const terms: string[] = [];
  let remaining = normalized;

  // Extract dimension patterns first (they contain spaces we don't want to split on)
  const dimMatch = remaining.match(DIMENSION_RE);
  if (dimMatch) {
    terms.push(dimMatch[0]);
    remaining = remaining.replace(dimMatch[0], ' ').trim();
  }

  // Split remaining by whitespace
  for (const word of remaining.split(/\s+/)) {
    if (word) terms.push(word);
  }

  return terms;
}

/**
 * Build a boundary-aware ilike pattern for a single term.
 * Dimension terms get boundary matching to prevent "1 x 1" matching "1 x 10".
 * Non-dimension terms use simple substring matching.
 */
function termToPattern(term: string): string[] {
  if (DIMENSION_RE.test(term)) {
    // Boundary-aware: match at end of name OR followed by space
    return [`%${term}`, `%${term} %`];
  }
  return [`%${term}%`];
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
    rgb: string | null;
    imageUrl: string | null;
  }>;
};

/** Max parts to fetch before sorting/paginating. Keeps queries fast. */
const SEARCH_CAP = 500;

export async function searchPartsLocal(
  rawQuery: string,
  opts: PartSearchOptions
): Promise<{ results: PartSearchLocalResult[]; nextPage: number | null }> {
  const sanitized = sanitizeQuery(rawQuery);
  if (!sanitized) return { results: [], nextPage: null };

  const normalized = normalizeDimensions(sanitized);
  const { page, pageSize } = opts;
  const supabase = getCatalogReadClient();

  // Split into terms for AND matching: "1x2 tile" → ["1 x 2", "tile"]
  const terms = splitSearchTerms(normalized);

  // Build name query: chain .ilike() for each term (AND logic).
  // For dimension terms, use .or() with boundary patterns within that term.
  function buildNameQuery() {
    let query = supabase
      .from('rb_parts')
      .select('part_num, name, part_cat_id, image_url');

    for (const term of terms) {
      const patterns = termToPattern(term);
      if (patterns.length === 1) {
        query = query.ilike('name', patterns[0]!);
      } else {
        // Dimension term: OR the boundary patterns
        query = query.or(patterns.map(p => `name.ilike.${p}`).join(','));
      }
    }
    return query.range(0, SEARCH_CAP - 1);
  }

  // Fetch up to SEARCH_CAP results so we can sort by popularity before paginating
  const [byNum, byName] = await Promise.all([
    supabase
      .from('rb_parts')
      .select('part_num, name, part_cat_id, image_url')
      .ilike('part_num', `${normalized}%`)
      .range(0, SEARCH_CAP - 1),
    buildNameQuery(),
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
    Array<{
      colorId: number;
      colorName: string;
      rgb: string | null;
      imageUrl: string | null;
    }>
  >
> {
  if (partNums.length === 0) return new Map();

  // 1. Get available colors from rb_part_rarity (parallel batches)
  const rarityBatches: Promise<{ part_num: string; color_id: number }[]>[] = [];
  for (let i = 0; i < partNums.length; i += 200) {
    const batch = partNums.slice(i, i + 200);
    rarityBatches.push(
      Promise.resolve(
        supabase
          .from('rb_part_rarity')
          .select('part_num, color_id')
          .in('part_num', batch)
      ).then(({ data }) => data ?? [])
    );
  }
  const allRarity = (await Promise.all(rarityBatches)).flat();
  if (!allRarity.length) return new Map();

  // 2. Get color metadata (name + rgb) from rb_colors (parallel batches)
  const colorIds = [...new Set(allRarity.map(r => r.color_id))];
  const colorMeta = new Map<number, { name: string; rgb: string | null }>();
  const colorBatches: Promise<void>[] = [];
  for (let i = 0; i < colorIds.length; i += 200) {
    const batch = colorIds.slice(i, i + 200);
    colorBatches.push(
      Promise.resolve(
        supabase.from('rb_colors').select('id, name, rgb').in('id', batch)
      ).then(({ data: colors }) => {
        for (const c of colors ?? []) {
          colorMeta.set(c.id, { name: c.name, rgb: c.rgb });
        }
      })
    );
  }
  await Promise.all(colorBatches);

  // 3. Assemble: group by part_num with color name + rgb (images loaded lazily in modal)
  const result = new Map<
    string,
    Array<{
      colorId: number;
      colorName: string;
      rgb: string | null;
      imageUrl: string | null;
    }>
  >();
  for (const row of allRarity) {
    const meta = colorMeta.get(row.color_id);
    if (!meta) continue;
    if (!result.has(row.part_num)) result.set(row.part_num, []);
    result.get(row.part_num)!.push({
      colorId: row.color_id,
      colorName: meta.name,
      rgb: meta.rgb,
      imageUrl: null, // loaded lazily in modal
    });
  }

  return result;
}

/** Preferred color order for thumbnails: white, black, then any. */
const PREFERRED_THUMB_COLORS = [LEGO_COLOR_IDS.WHITE, LEGO_COLOR_IDS.BLACK];

/**
 * Fetch one thumbnail image per part, preferring white then black.
 * Uses batch queries: first for preferred colors, then a single fallback for
 * any parts that had no preferred-color thumbnail.
 */
async function fetchThumbnailsForParts(
  supabase: ReturnType<typeof getCatalogReadClient>,
  partNums: string[]
): Promise<Map<string, string>> {
  if (partNums.length === 0) return new Map();

  const result = new Map<string, string>();

  // 1. Batch-fetch preferred-color thumbnails (white + black)
  const preferredBatches: Promise<
    { part_num: string; img_url: string | null; color_id: number }[]
  >[] = [];
  for (let i = 0; i < partNums.length; i += 200) {
    const batch = partNums.slice(i, i + 200);
    preferredBatches.push(
      Promise.resolve(
        supabase
          .from('rb_inventory_parts')
          .select('part_num, img_url, color_id')
          .in('part_num', batch)
          .in('color_id', PREFERRED_THUMB_COLORS)
          .not('img_url', 'is', null)
      ).then(({ data }) => data ?? [])
    );
  }
  const allPreferred = (await Promise.all(preferredBatches)).flat();

  // Group preferred results by part_num, pick best match in preference order
  const preferredByPart = new Map<
    string,
    { img_url: string | null; color_id: number }[]
  >();
  for (const row of allPreferred) {
    if (!preferredByPart.has(row.part_num)) {
      preferredByPart.set(row.part_num, []);
    }
    preferredByPart.get(row.part_num)!.push(row);
  }

  for (const [partNum, rows] of preferredByPart) {
    for (const colorId of PREFERRED_THUMB_COLORS) {
      const match = rows.find(r => r.color_id === colorId);
      const url = match?.img_url;
      if (typeof url === 'string' && url.trim()) {
        result.set(partNum, url.trim());
        break;
      }
    }
  }

  // 2. Collect parts that still need a thumbnail
  const missingPartNums = partNums.filter(pn => !result.has(pn));
  if (missingPartNums.length === 0) return result;

  // 3. Single batch fallback: any color with an image
  const fallbackBatches: Promise<
    { part_num: string; img_url: string | null }[]
  >[] = [];
  for (let i = 0; i < missingPartNums.length; i += 200) {
    const batch = missingPartNums.slice(i, i + 200);
    fallbackBatches.push(
      Promise.resolve(
        supabase
          .from('rb_inventory_parts')
          .select('part_num, img_url')
          .in('part_num', batch)
          .not('img_url', 'is', null)
      ).then(({ data }) => data ?? [])
    );
  }
  const allFallback = (await Promise.all(fallbackBatches)).flat();

  // Pick the first available image per part
  for (const row of allFallback) {
    if (result.has(row.part_num)) continue;
    const url = row.img_url;
    if (typeof url === 'string' && url.trim()) {
      result.set(row.part_num, url.trim());
    }
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

  const batches: Promise<{ part_num: string; set_count: number | null }[]>[] =
    [];
  for (let i = 0; i < partNums.length; i += 200) {
    const batch = partNums.slice(i, i + 200);
    batches.push(
      Promise.resolve(
        supabase
          .from('rb_part_rarity')
          .select('part_num, set_count')
          .in('part_num', batch)
      ).then(({ data }) => data ?? [])
    );
  }
  const results = await Promise.all(batches);
  for (const rows of results) {
    for (const row of rows) {
      counts.set(
        row.part_num,
        (counts.get(row.part_num) ?? 0) + (row.set_count ?? 0)
      );
    }
  }

  return counts;
}
