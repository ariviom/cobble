'use client';

import { MinifigSearchResultItem } from '@/app/components/minifig/MinifigSearchResultItem';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
import { Spinner } from '@/app/components/ui/Spinner';
import { AppError, throwAppErrorFromResponse } from '@/app/lib/domain/errors';
import type {
  FilterType,
  MinifigSearchPage,
  MinifigSearchResult,
  MinifigSortOption,
  SearchPage,
  SearchResult,
  SearchType,
  SortOption,
} from '@/app/types/search';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SearchResultListItem } from './SearchResultListItem';

async function fetchSearchPage(
  q: string,
  sort: SortOption = 'relevance',
  page: number = 1,
  pageSize: number = 20,
  filter: FilterType = 'all',
  exact: boolean = false
): Promise<SearchPage> {
  if (!q) return { results: [], nextPage: null };
  const url = `/api/search?q=${encodeURIComponent(
    q
  )}&sort=${sort}&page=${page}&pageSize=${pageSize}&filter=${encodeURIComponent(
    filter
  )}&exact=${exact ? '1' : '0'}`;
  const res = await fetch(url);
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'search_failed');
  }
  const data = (await res.json()) as SearchPage;
  return data;
}

async function fetchMinifigSearchPage(
  q: string,
  page: number = 1,
  pageSize: number = 20,
  sort: MinifigSortOption = 'relevance'
): Promise<MinifigSearchPage> {
  if (!q) return { results: [], nextPage: null };
  const url = `/api/search/minifigs?q=${encodeURIComponent(
    q
  )}&page=${page}&pageSize=${pageSize}&sort=${encodeURIComponent(sort)}`;
  const res = await fetch(url);
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'search_failed');
  }
  const data = (await res.json()) as MinifigSearchPage;
  return data;
}

function parseFilterParam(value: string | null): FilterType {
  if (
    value === 'set' ||
    value === 'theme' ||
    value === 'subtheme' ||
    value === 'all'
  ) {
    return value;
  }
  return 'all';
}

function parseExactParam(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

const allowedMinifigSorts: MinifigSortOption[] = [
  'relevance',
  'theme-asc',
  'theme-desc',
  'name-asc',
  'name-desc',
  'parts-asc',
  'parts-desc',
];
function parseMinifigSort(value: string | null): MinifigSortOption {
  if (value && allowedMinifigSorts.includes(value as MinifigSortOption)) {
    return value as MinifigSortOption;
  }
  return 'relevance';
}

function parseTypeParam(value: string | null): SearchType {
  if (value === 'minifig') return 'minifig';
  return 'set';
}

export function SearchResults() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get('q') ?? '';
  const hasQuery = q.trim().length > 0;
  const searchType = parseTypeParam(params.get('type'));
  const [sort, setSort] = useState<SortOption>('relevance');
  const [pageSize, setPageSize] = useState<number>(20);

  // Derive values directly from URL params - no useEffect sync needed
  const filter = parseFilterParam(params.get('filter'));
  const exact = parseExactParam(params.get('exact'));
  const minifigSort = parseMinifigSort(params.get('mfSort'));

  const handleFilterChange = (nextFilter: FilterType) => {
    if (nextFilter === filter) {
      return;
    }
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set('filter', nextFilter);
    const nextSearch = sp.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  };

  const handleMinifigSortChange = (nextSort: MinifigSortOption) => {
    if (nextSort === minifigSort) return;
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (nextSort === 'relevance') {
      sp.delete('mfSort');
    } else {
      sp.set('mfSort', nextSort);
    }
    const nextSearch = sp.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  };

  const handleExactChange = (nextExact: boolean) => {
    if (nextExact === exact) {
      return;
    }
    const sp = new URLSearchParams(Array.from(params.entries()));
    if (nextExact) {
      sp.set('exact', '1');
    } else {
      sp.delete('exact');
    }
    const nextSearch = sp.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  };
  const setQuery = useInfiniteQuery<
    SearchPage,
    AppError,
    InfiniteData<SearchPage, number>,
    [
      string,
      {
        q: string;
        sort: SortOption;
        pageSize: number;
        filter: FilterType;
        exact: boolean;
      },
    ],
    number
  >({
    queryKey: ['search', { q, sort, pageSize, filter, exact }],
    queryFn: ({ pageParam = 1 }) =>
      fetchSearchPage(q, sort, pageParam as number, pageSize, filter, exact),
    getNextPageParam: (lastPage: SearchPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: hasQuery && searchType === 'set',
  });
  const {
    data: setData,
    isLoading: isSetLoading,
    error: setError,
    fetchNextPage: fetchNextSetPage,
    hasNextPage: hasNextSetPage,
    isFetchingNextPage: isFetchingNextSetPage,
  } = setQuery;

  const minifigQuery = useInfiniteQuery<
    MinifigSearchPage,
    AppError,
    InfiniteData<MinifigSearchPage, number>,
    [
      string,
      {
        q: string;
        pageSize: number;
        sort: MinifigSortOption;
      },
    ],
    number
  >({
    queryKey: ['search-minifigs', { q, pageSize, sort: minifigSort }],
    queryFn: ({ pageParam = 1 }) =>
      fetchMinifigSearchPage(q, pageParam as number, pageSize, minifigSort),
    getNextPageParam: (lastPage: MinifigSearchPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: hasQuery && searchType === 'minifig',
  });
  const {
    data: minifigData,
    isLoading: isMinifigLoading,
    error: minifigError,
    fetchNextPage: fetchNextMinifigPage,
    hasNextPage: hasNextMinifigPage,
    isFetchingNextPage: isFetchingNextMinifigPage,
  } = minifigQuery;

  if (!hasQuery) {
    return null;
  }
  if (searchType === 'minifig') {
    const pages = (minifigData?.pages as MinifigSearchPage[] | undefined) ?? [];
    const results = pages.flatMap((p: MinifigSearchPage) => p.results) ?? [];
    return (
      <div className="w-full">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium">Sort</label>
          <select
            className="rounded-md border border-subtle bg-card px-2 py-1 text-xs"
            value={minifigSort}
            onChange={e =>
              handleMinifigSortChange(e.target.value as MinifigSortOption)
            }
          >
            <option value="relevance">Relevance</option>
            <option value="theme-asc">Theme (A–Z)</option>
            <option value="theme-desc">Theme (Z–A)</option>
            <option value="name-asc">Name (A–Z)</option>
            <option value="name-desc">Name (Z–A)</option>
            <option value="parts-desc">Parts (desc)</option>
            <option value="parts-asc">Parts (asc)</option>
          </select>
        </div>
        <p className="mb-3 text-[11px] text-foreground-muted">
          Minifigure search looks up Rebrickable minifigs by ID or name. You can
          search by theme names too. Add results to your Owned / Wishlist
          minifig collection and to shared lists.
        </p>
        {isMinifigLoading && (
          <Spinner className="mt-2" label="Loading minifigure results…" />
        )}
        {minifigError && (
          <ErrorBanner
            className="mt-2"
            message="Failed to load minifigure results. Please try again."
          />
        )}
        {!isMinifigLoading && !minifigError && results.length > 0 && (
          <div className="mt-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {results.map((r: MinifigSearchResult) => (
                <MinifigSearchResultItem
                  key={`${r.figNum}-${r.name}`}
                  figNum={r.figNum}
                  blId={r.blId ?? null}
                  name={r.name}
                  imageUrl={r.imageUrl}
                  numParts={r.numParts}
                  themeName={r.themeName ?? null}
                  themePath={r.themePath ?? null}
                />
              ))}
            </div>
            {hasNextMinifigPage && (
              <div className="mb-8 flex justify-center py-4">
                <button
                  onClick={() => fetchNextMinifigPage()}
                  disabled={isFetchingNextMinifigPage}
                  className="rounded-md border border-subtle bg-card px-3 py-2 text-sm hover:bg-card-muted"
                >
                  {isFetchingNextMinifigPage ? 'Loading…' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
        {!isMinifigLoading && !minifigError && results.length === 0 && (
          <EmptyState
            className="mt-4"
            message="No minifigures found. Try a different ID or name."
          />
        )}
      </div>
    );
  }

  const pages = (setData?.pages as SearchPage[] | undefined) ?? [];
  const results = pages.flatMap((p: SearchPage) => p.results) ?? [];
  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium">Sort</label>
        <select
          className="rounded-md border border-subtle bg-card px-2 py-1 text-xs"
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
        >
          <option value="relevance">Relevance</option>
          <option value="pieces-asc">Pieces (asc)</option>
          <option value="pieces-desc">Pieces (desc)</option>
          <option value="year-asc">Year (asc)</option>
          <option value="year-desc">Year (desc)</option>
        </select>
        <span className="bg-border-subtle mx-1 h-4 w-px" />
        <label className="text-xs font-medium">Per page</label>
        <select
          className="rounded-md border border-subtle bg-card px-2 py-1 text-xs"
          value={pageSize}
          onChange={e => setPageSize(Number(e.target.value))}
        >
          <option value={20}>20</option>
          <option value={40}>40</option>
          <option value={60}>60</option>
          <option value={80}>80</option>
          <option value={100}>100</option>
        </select>
        <span className="bg-border-subtle mx-1 h-4 w-px" />
        <label className="text-xs font-medium">Filter</label>
        <select
          className="rounded-md border border-subtle bg-card px-2 py-1 text-xs"
          value={filter}
          onChange={e => handleFilterChange(e.target.value as FilterType)}
        >
          <option value="all">All</option>
          <option value="set">Set</option>
          <option value="theme">Theme</option>
          <option value="subtheme">Subtheme</option>
        </select>
        <span className="bg-border-subtle mx-1 h-4 w-px" />
        <label className="inline-flex items-center gap-1 text-xs font-medium">
          <input
            type="checkbox"
            className="h-3 w-3 accent-theme-primary"
            checked={exact}
            onChange={e => handleExactChange(e.target.checked)}
          />
          <span>Exact match</span>
        </label>
      </div>
      <p className="mb-3 text-[11px] text-foreground-muted">
        All shows every result, Set limits to direct matches on set number or
        name, Theme shows sets whose top-level theme matches your query, and
        Subtheme restricts to child/subtheme matches only. Exact match confines
        results to sets/themes that match your query exactly (set numbers may
        include standard &ldquo;-1&rdquo; style suffixes).
      </p>
      {isSetLoading && (
        <Spinner className="mt-2" label="Loading search results…" />
      )}
      {setError && (
        <ErrorBanner
          className="mt-2"
          message="Failed to load search results. Please try again."
        />
      )}
      {!isSetLoading && !setError && results.length > 0 && (
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
          {hasNextSetPage && (
            <div className="mb-8 flex justify-center py-4">
              <button
                onClick={() => fetchNextSetPage()}
                disabled={isFetchingNextSetPage}
                className="rounded-md border border-subtle bg-card px-3 py-2 text-sm hover:bg-card-muted"
              >
                {isFetchingNextSetPage ? 'Loading…' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
      {!isSetLoading && !setError && results.length === 0 && (
        <EmptyState
          className="mt-4"
          message="No results found. Try different keywords or check spelling."
        />
      )}
    </div>
  );
}
