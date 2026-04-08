import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT } from '@/app/lib/constants';
import { searchMinifigsLocal } from '@/app/lib/catalog';
import type { MinifigSearchPage, MinifigSortOption } from '@/app/types/search';
import { logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
};
const allowedSizes = new Set([20, 40, 60, 80, 100]);
const allowedSorts: MinifigSortOption[] = [
  'relevance',
  'theme-asc',
  'theme-desc',
  'name-asc',
  'name-desc',
  'parts-asc',
  'parts-desc',
];

const querySchema = z.object({
  q: z.string().default(''),
  page: z
    .string()
    .optional()
    .transform(v => Math.max(1, Number(v ?? '1') || 1)),
  pageSize: z
    .string()
    .optional()
    .transform(v => Number(v ?? '20') || 20)
    .transform(size => (allowedSizes.has(size) ? size : 20)),
  sort: z
    .string()
    .optional()
    .transform(v =>
      allowedSorts.includes((v as MinifigSortOption) ?? 'relevance')
        ? (v as MinifigSortOption)
        : 'relevance'
    ),
});

export async function GET(req: NextRequest) {
  // IP-based rate limit
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`search-minifigs:ip:${clientIp}`, {
    windowMs: RATE_LIMIT.WINDOW_MS,
    maxHits: RATE_LIMIT.SEARCH_MAX,
  });
  if (!ipLimit.allowed) {
    return errorResponse('rate_limited', {
      status: 429,
      headers: { 'Retry-After': String(ipLimit.retryAfterSeconds) },
      details: { retryAfterSeconds: ipLimit.retryAfterSeconds },
    });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(searchParams.entries())
  );
  if (!parsed.success) {
    return errorResponse('validation_failed', {
      details: { issues: parsed.error.flatten() },
    });
  }

  const { q, page, pageSize, sort } = parsed.data;

  try {
    const { results, nextPage } = await searchMinifigsLocal(q, {
      page,
      pageSize,
      sort,
    });

    // searchMinifigsLocal now returns BL IDs directly (figNum is BL minifig_no)
    // Add blId as an alias for backward compatibility
    const withIds = results.map(result => ({
      ...result,
      blId: result.figNum, // figNum is already a BL ID
    }));

    const payload: MinifigSearchPage = { results: withIds, nextPage };
    return NextResponse.json(payload, {
      headers: CACHE_HEADERS,
    });
  } catch (err) {
    logger.error('minifigs.search.failed', {
      query: q,
      page,
      pageSize,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('search_failed', { message: 'Minifig search failed' });
  }
}
