import { mapRebrickableFigToBrickLink } from '@/app/lib/minifigMapping';
import { searchMinifigs } from '@/app/lib/rebrickable';
import type { MinifigSearchPage } from '@/app/types/search';
import { NextRequest, NextResponse } from 'next/server';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';
  const pageParam = searchParams.get('page');
  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const requestedSize = Number(searchParams.get('pageSize') ?? '20') || 20;
  const allowedSizes = new Set([20, 40, 60, 80, 100]);
  const pageSize = allowedSizes.has(requestedSize) ? requestedSize : 20;

  try {
    const { results, nextPage } = await searchMinifigs(q, page, pageSize);
    const withIds = await Promise.all(
      (results ?? []).map(async result => {
        let blId: string | null = null;
        try {
          blId = await mapRebrickableFigToBrickLink(result.figNum);
        } catch {
          blId = null;
        }
        return { ...result, blId };
      })
    );
    const payload: MinifigSearchPage = { results: withIds, nextPage };
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': CACHE_CONTROL },
    });
  } catch (err) {
    console.error('Minifig search failed:', {
      query: q,
      page,
      pageSize,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'search_failed' }, { status: 500 });
  }
}





