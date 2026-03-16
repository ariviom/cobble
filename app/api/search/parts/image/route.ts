import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT } from '@/app/lib/constants';
import { getCatalogReadClient } from '@/app/lib/db/catalogAccess';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';

const CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';

export async function GET(req: NextRequest) {
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`search-parts-image:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.SEARCH_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
    });
  }

  const { searchParams } = new URL(req.url);
  const partNum = searchParams.get('partNum');
  const colorId = searchParams.get('colorId');

  if (!partNum || colorId == null) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  const colorIdNum = Number(colorId);
  if (!Number.isFinite(colorIdNum)) {
    return NextResponse.json({ imageUrl: null }, { status: 400 });
  }

  const supabase = getCatalogReadClient();
  const { data } = await supabase
    .from('rb_inventory_parts')
    .select('img_url')
    .eq('part_num', partNum)
    .eq('color_id', colorIdNum)
    .not('img_url', 'is', null)
    .limit(1);

  const imageUrl =
    data?.[0]?.img_url &&
    typeof data[0].img_url === 'string' &&
    data[0].img_url.trim()
      ? data[0].img_url.trim()
      : null;

  return NextResponse.json(
    { imageUrl },
    { headers: { 'Cache-Control': CACHE_CONTROL } }
  );
}
