import 'server-only';

import { searchSetsLocal } from '@/app/lib/catalog';
import {
  getAggregatedSearchResults,
  type SimpleSet,
} from '@/app/lib/rebrickable';
import { sanitizeQuery } from '@/app/lib/utils/sanitizeQuery';
import type { FilterType } from '@/app/types/search';
import { logger } from '@/lib/metrics';

function applyFilter(
  results: SimpleSet[],
  filterType: FilterType
): SimpleSet[] {
  if (filterType === 'all') {
    return results;
  }
  return results.filter(result => {
    const types = result.matchTypes;
    if (types && types.length > 0) {
      return types.includes(filterType);
    }
    return (result.matchType ?? 'set') === filterType;
  });
}

export async function searchSetsPage(args: {
  query: string;
  sort: string;
  page: number;
  pageSize: number;
  filterType?: FilterType;
  exactMatch?: boolean;
}): Promise<{
  results: Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  slice: Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  page: number;
  nextPage: number | null;
  _debugSearch?: {
    usedLocal: boolean;
    usedFallback: boolean;
    total: number;
  };
}> {
  const { sort, page, pageSize, filterType = 'all', exactMatch = false } = args;
  const sanitizedQuery = sanitizeQuery(args.query);

  type ResultArray = Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  let all: ResultArray = [];
  let usedLocal = false;
  let usedFallback = false;

  // Prefer Supabase-backed catalog search when available.
  try {
    const local = await searchSetsLocal(sanitizedQuery, sort, { exactMatch });
    if (local.length > 0) {
      all = local as ResultArray;
      usedLocal = true;
    }
  } catch (err) {
    logger.warn('search.local_failed_fallback_to_rebrickable', {
      query: sanitizedQuery,
      sort,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to live Rebrickable search when Supabase has no results or errors.
  if (all.length === 0) {
    all = await getAggregatedSearchResults(sanitizedQuery, sort, {
      exactMatch,
    });
    usedFallback = true;
  }

  const filtered = applyFilter(all, filterType);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = filtered.slice(start, end);
  const nextPage = end < filtered.length ? page + 1 : null;

  return {
    results: filtered,
    slice,
    page,
    nextPage,
    ...(process.env.NODE_ENV !== 'production'
      ? { _debugSearch: { usedLocal, usedFallback, total: filtered.length } }
      : {}),
  };
}
