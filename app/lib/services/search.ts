import { searchSetsLocal } from '@/app/lib/catalog';
import {
  getAggregatedSearchResults,
  type SimpleSet,
} from '@/app/lib/rebrickable';
import type { FilterType } from '@/app/types/search';

function applyFilter(results: SimpleSet[], filterType: FilterType): SimpleSet[] {
  if (filterType === 'all') {
    return results;
  }
  return results.filter(result => {
    const type = result.matchType ?? 'set';
    return type === filterType;
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
}> {
  const {
    query,
    sort,
    page,
    pageSize,
    filterType = 'all',
    exactMatch = false,
  } = args;

  type ResultArray = Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  let all: ResultArray = [];

  // Prefer Supabase-backed catalog search when available.
  try {
    const local = await searchSetsLocal(query, sort, { exactMatch });
    if (local.length > 0) {
      all = local as ResultArray;
    }
  } catch (err) {
    console.error('Supabase searchSetsLocal failed, falling back to Rebrickable', {
      query,
      sort,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to live Rebrickable search when Supabase has no results or errors.
  if (all.length === 0) {
    all = await getAggregatedSearchResults(query, sort, { exactMatch });
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
  };
}




