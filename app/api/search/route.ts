import { searchSets } from '@/app/lib/rebrickable';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort') ?? 'relevance';
  try {
    const { exactMatches, otherMatches } = await searchSets(q, sort);
    return NextResponse.json({
      exactMatches,
      otherMatches,
      hasMore: otherMatches.length > 0,
    });
  } catch (err) {
    console.error('Search failed:', {
      query: q,
      sort,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}
