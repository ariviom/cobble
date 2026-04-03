import { errorResponse } from '@/app/lib/api/responses';
import { searchMinifigsLocal } from '@/app/lib/catalog';
import type { MinifigSearchPage, MinifigSortOption } from '@/app/types/search';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Browser may cache per-URL (max-age). Netlify CDN must not cache because its
// netlify-vary header ignores search query params, collapsing different queries
// into one cache entry. CDN-Cache-Control overrides CDN behavior only.
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
  'CDN-Cache-Control': 'no-store',
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
