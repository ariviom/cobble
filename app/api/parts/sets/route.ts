import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { NextRequest, NextResponse } from 'next/server';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600';
const PAGE_SIZE = 24;

/**
 * GET /api/parts/sets?partNum=3069b&page=1
 *
 * Returns paginated sets containing a given part, sorted by year descending.
 * Uses a single RPC with server-side join + dedup (~40ms).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const partNum = searchParams.get('partNum');
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  if (!partNum) {
    return NextResponse.json(
      { results: [], nextPage: null, total: 0 },
      { status: 400 }
    );
  }

  const supabase = getCatalogReadClient();
  const offset = (page - 1) * PAGE_SIZE;

  const { data, error } = await supabase.rpc('get_sets_for_part', {
    p_part_num: partNum,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });

  if (error || !data?.length) {
    return NextResponse.json(
      { results: [], nextPage: null, total: 0 },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  }

  const total = Number(data[0]?.total_count ?? 0);
  const hasMore = offset + PAGE_SIZE < total;

  const results = data.map(
    (s: {
      set_num: string;
      name: string | null;
      year: number | null;
      image_url: string | null;
    }) => ({
      setNumber: s.set_num,
      name: s.name,
      year: s.year,
      imageUrl: s.image_url,
    })
  );

  return NextResponse.json(
    { results, nextPage: hasMore ? page + 1 : null, total },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
