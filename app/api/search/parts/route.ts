import { errorResponse } from '@/app/lib/api/responses';
import { RATE_LIMIT } from '@/app/lib/constants';
import { searchPartsPage } from '@/app/lib/services/searchParts';
import { incrementCounter, logEvent, logger } from '@/lib/metrics';
import { consumeRateLimit, getClientIp } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';
const allowedSizes = new Set([20, 50, 100]);

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
});

export async function GET(req: NextRequest) {
  const clientIp = (await getClientIp(req)) ?? 'unknown';
  const ipLimit = await consumeRateLimit(`search-parts:ip:${clientIp}`, {
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

  const { q, page, pageSize } = parsed.data;
  try {
    const { results, nextPage } = await searchPartsPage({
      query: q,
      page,
      pageSize,
    });
    incrementCounter('search_parts_succeeded', { count: results.length });
    logEvent('search_parts_response', {
      q,
      page,
      pageSize,
      count: results.length,
    });
    return NextResponse.json(
      { results, nextPage },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    incrementCounter('search_parts_failed', {
      query: q,
      error: err instanceof Error ? err.message : String(err),
    });
    logger.error('search.parts.route.failed', {
      query: q,
      page,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('search_failed');
  }
}
