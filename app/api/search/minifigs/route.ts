import { errorResponse } from '@/app/lib/api/responses';
import { searchMinifigsLocal } from '@/app/lib/catalog';
import { mapRebrickableFigToBrickLink } from '@/app/lib/minifigMapping';
import type { MinifigSearchPage, MinifigSortOption } from '@/app/types/search';
import { logger } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const CACHE_CONTROL =
  process.env.NODE_ENV === 'production'
    ? 'public, max-age=60, stale-while-revalidate=300'
    : 'no-store';
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
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
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
    logger.error('minifigs.search.failed', {
      query: q,
      page,
      pageSize,
      error: err instanceof Error ? err.message : String(err),
    });
    return errorResponse('search_failed', { message: 'Minifig search failed' });
  }
}





