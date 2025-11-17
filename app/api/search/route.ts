import { getAggregatedSearchResults } from '@/app/lib/rebrickable';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort') ?? 'relevance';
  const pageParam = searchParams.get('page');
  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const requestedSize = Number(searchParams.get('pageSize') ?? '20') || 20;
  const allowedSizes = new Set([20, 40, 60, 80, 100]);
  const pageSize = allowedSizes.has(requestedSize) ? requestedSize : 20;
  try {
    const all = await getAggregatedSearchResults(q, sort);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const slice = all.slice(start, end);
    const nextPage = end < all.length ? page + 1 : null;
    return NextResponse.json({ results: slice, nextPage });
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
