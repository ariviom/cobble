import { searchSetsLocal } from '@/app/lib/catalog';
import { getAggregatedSearchResults } from '@/app/lib/rebrickable';

export async function searchSetsPage(args: {
  query: string;
  sort: string;
  page: number;
  pageSize: number;
}): Promise<{
  results: Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  slice: Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  page: number;
  nextPage: number | null;
}> {
  const { query, sort, page, pageSize } = args;

  type ResultArray = Awaited<ReturnType<typeof getAggregatedSearchResults>>;
  let all: ResultArray = [];

  // Prefer Supabase-backed catalog search when available.
  try {
    const local = await searchSetsLocal(query, sort);
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
    all = await getAggregatedSearchResults(query, sort);
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const slice = all.slice(start, end);
  const nextPage = end < all.length ? page + 1 : null;

  return {
    results: all,
    slice,
    page,
    nextPage,
  };
}




