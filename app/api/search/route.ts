import { searchSetsPage } from '@/app/lib/services/search';
import type { FilterType } from '@/app/types/search';
import { NextRequest, NextResponse } from 'next/server';

// Search results can be cached briefly since set data rarely changes
const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort') ?? 'relevance';
  const pageParam = searchParams.get('page');
  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const requestedSize = Number(searchParams.get('pageSize') ?? '20') || 20;
  const allowedSizes = new Set([20, 40, 60, 80, 100]);
  const pageSize = allowedSizes.has(requestedSize) ? requestedSize : 20;
  const allowedFilters: FilterType[] = ['all', 'set', 'theme', 'subtheme'];
  const filterParam = searchParams.get('filter');
  const filterType: FilterType = allowedFilters.includes(
    (filterParam as FilterType) ?? 'all'
  )
    ? ((filterParam as FilterType) ?? 'all')
    : 'all';
  const exactParam = searchParams.get('exact');
  const exactMatch =
    exactParam === '1' ||
    exactParam === 'true' ||
    exactParam?.toLowerCase() === 'yes';
  try {
    const { slice, nextPage } = await searchSetsPage({
      query: q,
      sort,
      page,
      pageSize,
      filterType,
      exactMatch,
    });
    return NextResponse.json(
      { results: slice, nextPage },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    console.error('Search failed:', {
      query: q,
      sort,
      page,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}
