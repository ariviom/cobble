import 'server-only';

import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';

export type RelatedSet = {
  setNumber: string;
  name: string;
  year: number;
  numParts: number;
  imageUrl: string | null;
};

/**
 * Fetches sets sharing the same theme_id, sorted by year proximity
 * to the reference set, excluding the reference set itself.
 */
export async function getRelatedSets(
  themeId: number,
  referenceSetNumber: string,
  referenceYear: number,
  limit: number = 6,
  offset: number = 0
): Promise<{ sets: RelatedSet[]; total: number }> {
  const supabase = getCatalogReadClient();

  // Fetch sets in this theme, capped at 200 to avoid unbounded queries.
  // theme_id on rb_sets is the leaf subtheme, so most themes are small.
  // We fetch all matching rows (up to cap) for client-side year-proximity sorting.
  const { data, count } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, num_parts, image_url', { count: 'exact' })
    .eq('theme_id', themeId)
    .neq('set_num', referenceSetNumber)
    .order('year', { ascending: false })
    .limit(200);

  const total = count ?? data?.length ?? 0;

  if (!data || data.length === 0) return { sets: [], total: 0 };

  // Sort by year proximity to reference set, then name
  const sorted = data.sort((a, b) => {
    const distA = Math.abs((a.year ?? 0) - referenceYear);
    const distB = Math.abs((b.year ?? 0) - referenceYear);
    if (distA !== distB) return distA - distB;
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  const page = sorted.slice(offset, offset + limit);

  return {
    sets: page.map(row => ({
      setNumber: row.set_num,
      name: row.name ?? '',
      year: row.year ?? 0,
      numParts: row.num_parts ?? 0,
      imageUrl: row.image_url ?? null,
    })),
    total,
  };
}
