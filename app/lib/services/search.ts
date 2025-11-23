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
  const all = await getAggregatedSearchResults(query, sort);
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



