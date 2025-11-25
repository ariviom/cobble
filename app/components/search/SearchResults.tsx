'use client';

import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Spinner } from '@/app/components/ui/Spinner';
import { AppError, throwAppErrorFromResponse } from '@/app/lib/domain/errors';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SearchResultListItem } from './SearchResultListItem';
import type { SearchPage, SearchResult, SortOption } from './types';

async function fetchSearchPage(
  q: string,
  sort: SortOption = 'relevance',
  page: number = 1,
  pageSize: number = 20
): Promise<SearchPage> {
  if (!q) return { results: [], nextPage: null };
  const url = `/api/search?q=${encodeURIComponent(q)}&sort=${sort}&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url);
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'search_failed');
  }
  const data = (await res.json()) as SearchPage;
  return data;
}

export function SearchResults() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const hasQuery = q.trim().length > 0;
  const [sort, setSort] = useState<SortOption>('relevance');
  const [pageSize, setPageSize] = useState<number>(20);
  const query = useInfiniteQuery<
    SearchPage,
    AppError,
    InfiniteData<SearchPage, number>,
    string[],
    number
  >({
    queryKey: ['search', q, sort, String(pageSize)],
    queryFn: ({ pageParam = 1 }) =>
      fetchSearchPage(q, sort, pageParam as number, pageSize),
    getNextPageParam: (lastPage: SearchPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: hasQuery,
  });
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = query;

  if (!hasQuery) {
    return null;
  }
  const pages = (data?.pages as SearchPage[] | undefined) ?? [];
  const results = pages.flatMap((p: SearchPage) => p.results) ?? [];
  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <label className="text-xs font-medium">Sort</label>
        <select
          className="rounded border px-2 py-1 text-xs"
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
        >
          <option value="relevance">Relevance</option>
          <option value="pieces-asc">Pieces (asc)</option>
          <option value="pieces-desc">Pieces (desc)</option>
          <option value="year-asc">Year (asc)</option>
          <option value="year-desc">Year (desc)</option>
        </select>
        <span className="mx-1 h-4 w-px bg-neutral-300" />
        <label className="text-xs font-medium">Per page</label>
        <select
          className="rounded border px-2 py-1 text-xs"
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value))}
        >
          <option value={20}>20</option>
          <option value={40}>40</option>
          <option value={60}>60</option>
          <option value={80}>80</option>
          <option value={100}>100</option>
        </select>
      </div>
      {isLoading && (
        <Spinner className="mt-2" label="Loading search results…" />
      )}
      {error && (
        <ErrorBanner
          className="mt-2"
          message="Failed to load search results. Please try again."
        />
      )}
      {!isLoading && !error && results.length > 0 && (
        <div className="mt-2">
          <div
            data-item-size="md"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          >
            {results.map((r: SearchResult) => (
              <SearchResultListItem
                key={`${r.setNumber}-${r.name}`}
                result={r}
              />
            ))}
          </div>
          {hasNextPage && (
            <div className="mb-8 flex justify-center py-4">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded border px-3 py-2 text-sm"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
      {!isLoading && !error && results.length === 0 && (
        <EmptyState
          className="mt-4"
          message="No results found. Try different keywords or check spelling."
        />
      )}
    </div>
  );
}
