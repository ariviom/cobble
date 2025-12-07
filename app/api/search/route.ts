import { searchSetsPage } from '@/app/lib/services/search';
import type { FilterType } from '@/app/types/search';
import { incrementCounter, logEvent } from '@/lib/metrics';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Keep fully dynamic to avoid stale responses (CDN/browser).
const CACHE_CONTROL = 'no-store';

const allowedFilters: FilterType[] = ['all', 'set', 'theme', 'subtheme'];
const allowedSizes = new Set([20, 40, 60, 80, 100]);

const querySchema = z.object({
  q: z.string().default(''),
  sort: z.string().default('relevance'),
  page: z
    .string()
    .optional()
    .transform(v => Math.max(1, Number(v ?? '1') || 1)),
  pageSize: z
    .string()
    .optional()
    .transform(v => Number(v ?? '20') || 20)
    .transform(size => (allowedSizes.has(size) ? size : 20)),
  filter: z
    .string()
    .optional()
    .transform(v => (allowedFilters.includes((v as FilterType) ?? 'all') ? (v as FilterType) : 'all')),
  exact: z
    .string()
    .optional()
    .transform(v =>
      v === '1' || v === 'true' || v?.toLowerCase() === 'yes'
    ),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
  if (!parsed.success) {
    incrementCounter('search_validation_failed', { issues: parsed.error.flatten() });
    return NextResponse.json({ error: 'validation_failed' }, { status: 400 });
  }

  const { q, sort, page, pageSize, filter, exact } = parsed.data;
  try {
    const { slice, nextPage, _debugSearch } = await searchSetsPage({
      query: q,
      sort,
      page,
      pageSize,
      filterType: filter,
      exactMatch: exact,
    });
    if (process.env.NODE_ENV !== 'production' && _debugSearch) {
      console.log('search route source', {
        query: q,
        usedLocal: _debugSearch.usedLocal,
        usedFallback: _debugSearch.usedFallback,
        total: _debugSearch.total,
      });
    }
    incrementCounter('search_succeeded', { count: slice.length });
    logEvent('search_response', { q, page, pageSize, count: slice.length });
    return NextResponse.json(
      { results: slice, nextPage },
      { headers: { 'Cache-Control': CACHE_CONTROL } }
    );
  } catch (err) {
    incrementCounter('search_failed', {
      query: q,
      error: err instanceof Error ? err.message : String(err),
    });
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
