import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { NextRequest, NextResponse } from 'next/server';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';
const PAGE_SIZE = 24;

/**
 * GET /api/parts/sets?partNum=3069b&page=1
 *
 * Returns paginated sets containing a given part (any color).
 * Uses rb_inventories + rb_inventory_parts join, deduplicated by set_num.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const partNum = searchParams.get('partNum');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  if (!partNum) {
    return NextResponse.json({ results: [], nextPage: null }, { status: 400 });
  }

  const supabase = getCatalogReadClient();

  // Get distinct set_nums via rb_inventory_parts → rb_inventories
  // We fetch inventory_ids first, then map to set_nums, then fetch set metadata.
  // This is more efficient than getSetsContainingPart because we paginate.

  const { data: invParts } = await supabase
    .from('rb_inventory_parts')
    .select('inventory_id')
    .eq('part_num', partNum)
    .eq('is_spare', false)
    .limit(5000);

  if (!invParts?.length) {
    return NextResponse.json(
      { results: [], nextPage: null },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  // Get unique inventory IDs
  const invIds = [...new Set(invParts.map(r => r.inventory_id))];

  // Map to set_nums in batches
  const setNums = new Set<string>();
  for (let i = 0; i < invIds.length; i += 200) {
    const batch = invIds.slice(i, i + 200);
    const { data: inventories } = await supabase
      .from('rb_inventories')
      .select('set_num')
      .in('id', batch)
      .not('set_num', 'like', 'fig-%');

    for (const row of inventories ?? []) {
      if (row.set_num) setNums.add(row.set_num);
    }
  }

  const allSetNums = [...setNums];
  const totalSets = allSetNums.length;
  const offset = (page - 1) * PAGE_SIZE;
  const pageSlice = allSetNums.slice(offset, offset + PAGE_SIZE);
  const hasMore = offset + PAGE_SIZE < totalSets;

  if (pageSlice.length === 0) {
    return NextResponse.json(
      { results: [], nextPage: null, total: totalSets },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  // Fetch set metadata for this page
  const { data: setMeta } = await supabase
    .from('rb_sets')
    .select('set_num, name, year, image_url')
    .in('set_num', pageSlice);

  const results = (setMeta ?? []).map(s => ({
    setNumber: s.set_num,
    name: s.name,
    year: s.year,
    imageUrl: s.image_url,
  }));

  return NextResponse.json(
    {
      results,
      nextPage: hasMore ? page + 1 : null,
      total: totalSets,
    },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
