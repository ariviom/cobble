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
  } catch {
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}
