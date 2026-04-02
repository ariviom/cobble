'use client';

import { MinifigSearchResultItem } from '@/app/components/minifig/MinifigSearchResultItem';
import { useAuth } from '@/app/components/providers/auth-provider';
import { BrickLoader } from '@/app/components/ui/BrickLoader';
import { Button } from '@/app/components/ui/Button';
import { CollectionGroupHeading } from '@/app/components/ui/CollectionGroupHeading';
import { EmptyState } from '@/app/components/ui/EmptyState';
import { ErrorBanner } from '@/app/components/ui/ErrorBanner';
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
import { CollectionPartModal } from '@/app/components/collection/parts/CollectionPartModal';
import { pickDefaultColor } from '@/app/components/collection/parts/colorGroups';
import type { PartSearchPage, PartSearchResult } from '@/app/types/search';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useOnboardingStore } from '@/app/store/onboarding';
import {
  MinifigSearchControlBar,
  PartSearchControlBar,
  SetSearchControlBar,
  fromSortOption,
  getPiecesBucket,
  piecesBucketOrder,
} from './SearchControlBar';
import { PartSearchResultCard } from './PartSearchResultCard';
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
  const res = await fetch(url, { cache: 'no-store' });
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
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'search_failed');
  }
  const data = (await res.json()) as MinifigSearchPage;
  return data;
}

async function fetchPartSearchPage(
  q: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PartSearchPage> {
  if (!q) return { results: [], nextPage: null };
  const url = `/api/search/parts?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    await throwAppErrorFromResponse(res, 'search_failed');
  }
  return (await res.json()) as PartSearchPage;
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

const allowedSorts: SortOption[] = [
  'relevance',
  'pieces-asc',
  'pieces-desc',
  'year-asc',
  'year-desc',
  'theme-asc',
  'theme-desc',
];
function parseSortParam(value: string | null): SortOption {
  if (value && allowedSorts.includes(value as SortOption)) {
    return value as SortOption;
  }
  return 'relevance';
}

const allowedPageSizes = [20, 50, 100];
function parsePageSizeParam(value: string | null): number {
  if (!value) return 20;
  const num = Number(value);
  return allowedPageSizes.includes(num) ? num : 20;
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

/** Replace a URL search param, removing it when it matches the default. */
function setParam(
  sp: URLSearchParams,
  key: string,
  value: string,
  defaultValue: string
) {
  if (value === defaultValue) {
    sp.delete(key);
  } else {
    sp.set(key, value);
  }
}

// ---------------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------------

type GroupedResults<T> = { label: string; items: T[] }[];

function groupSearchResults(
  results: SearchResult[],
  sort: SortOption
): GroupedResults<SearchResult> {
  const { field, dir } = fromSortOption(sort);

  // Relevance — no grouping
  if (field === 'relevance') {
    return [{ label: 'Results', items: results }];
  }

  const groups = new Map<string, SearchResult[]>();
  for (const r of results) {
    let key: string;
    if (field === 'year') {
      key = r.year > 0 ? String(r.year) : 'Unknown Year';
    } else if (field === 'pieces') {
      key = getPiecesBucket(r.numParts);
    } else {
      // theme
      key = r.themeName ?? r.themePath ?? 'Unknown Theme';
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const entries = Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));

  if (field === 'year') {
    return entries.sort((a, b) => {
      const aUnk = a.label === 'Unknown Year';
      const bUnk = b.label === 'Unknown Year';
      if (aUnk && bUnk) return 0;
      if (aUnk) return 1;
      if (bUnk) return -1;
      return dir === 'desc'
        ? Number(b.label) - Number(a.label)
        : Number(a.label) - Number(b.label);
    });
  }

  if (field === 'pieces') {
    for (const group of entries) {
      group.items.sort((a, b) =>
        dir === 'desc' ? b.numParts - a.numParts : a.numParts - b.numParts
      );
    }
    return entries.sort((a, b) => {
      const diff = piecesBucketOrder(a.label) - piecesBucketOrder(b.label);
      return dir === 'desc' ? -diff : diff;
    });
  }

  // theme — alphabetical
  return entries.sort((a, b) =>
    dir === 'desc'
      ? b.label.localeCompare(a.label)
      : a.label.localeCompare(b.label)
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type SearchResultsProps = {
  query: string;
  searchType: SearchType;
};

export function SearchResults({ query, searchType }: SearchResultsProps) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading: authLoading } = useAuth();
  // q and searchType come from server-rendered props (always fresh),
  // not useSearchParams() which can go stale during client navigations.
  const q = query;
  const hasQuery = q.trim().length > 0;

  // Derive all controls from URL params
  const sort = parseSortParam(params.get('sort'));
  const pageSize = parsePageSizeParam(params.get('pageSize'));
  const filter = parseFilterParam(params.get('filter'));
  const exact = parseExactParam(params.get('exact'));
  const minifigSort = parseMinifigSort(params.get('mfSort'));

  // Helper to update a URL param and replace
  const updateParam = (key: string, value: string, defaultValue: string) => {
    const sp = new URLSearchParams(Array.from(params.entries()));
    setParam(sp, key, value, defaultValue);
    const nextSearch = sp.toString();
    router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname);
  };

  const handleSortChange = (next: SortOption) => {
    updateParam('sort', next, 'relevance');
  };

  const handlePageSizeChange = (next: number) => {
    updateParam('pageSize', String(next), '20');
  };

  const handleFilterChange = (nextFilter: FilterType) => {
    updateParam('filter', nextFilter, 'all');
  };

  const handleExactChange = (nextExact: boolean) => {
    updateParam('exact', nextExact ? '1' : '', '');
  };

  const handleMinifigSortChange = (nextSort: MinifigSortOption) => {
    updateParam('mfSort', nextSort, 'relevance');
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

  const searchTourFired = useRef(false);
  useEffect(() => {
    if (searchTourFired.current) return;
    if (setData?.pages?.length && setData.pages[0].results.length > 0) {
      searchTourFired.current = true;
      useOnboardingStore.getState().complete('search_set');
    }
  }, [setData?.pages?.length]);

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

  const partQuery = useInfiniteQuery<
    PartSearchPage,
    AppError,
    InfiniteData<PartSearchPage, number>,
    [string, { q: string; pageSize: number }],
    number
  >({
    queryKey: ['search-parts', { q, pageSize }],
    queryFn: ({ pageParam = 1 }) =>
      fetchPartSearchPage(q, pageParam as number, pageSize),
    getNextPageParam: (lastPage: PartSearchPage) => lastPage.nextPage,
    initialPageParam: 1,
    enabled: hasQuery && searchType === 'part',
  });
  const {
    data: partData,
    isLoading: isPartLoading,
    error: partError,
    fetchNextPage: fetchNextPartPage,
    hasNextPage: hasNextPartPage,
    isFetchingNextPage: isFetchingNextPartPage,
  } = partQuery;

  const [selectedPart, setSelectedPart] = useState<PartSearchResult | null>(
    null
  );

  // Group set results based on the active sort field
  const { flatResults, grouped } = useMemo(() => {
    const pages = (setData?.pages as SearchPage[] | undefined) ?? [];
    const flat = pages.flatMap((p: SearchPage) => p.results);
    return { flatResults: flat, grouped: groupSearchResults(flat, sort) };
  }, [setData, sort]);

  if (!hasQuery) {
    return null;
  }

  if (searchType === 'part') {
    const ptPages = (partData?.pages as PartSearchPage[] | undefined) ?? [];
    const results = ptPages.flatMap((p: PartSearchPage) => p.results);
    return (
      <>
        <PartSearchControlBar
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
        />
        <div className="container-wide py-6 lg:py-8">
          {isPartLoading && (
            <div className="flex justify-center py-12 text-center">
              <BrickLoader />
            </div>
          )}
          {partError && (
            <ErrorBanner
              className="mt-2"
              message="Failed to load part results. Please try again."
            />
          )}
          {!isPartLoading && !partError && results.length > 0 && (
            <div>
              <div className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {results.map((r: PartSearchResult) => (
                  <PartSearchResultCard
                    key={r.partNum}
                    result={r}
                    onClick={() => setSelectedPart(r)}
                  />
                ))}
              </div>
              {hasNextPartPage && (
                <div className="mb-8 flex justify-center py-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchNextPartPage()}
                    disabled={isFetchingNextPartPage}
                  >
                    {isFetchingNextPartPage ? 'Loading…' : 'Load More'}
                  </Button>
                </div>
              )}
            </div>
          )}
          {!isPartLoading && !partError && results.length === 0 && (
            <EmptyState
              className="mt-4"
              message="No parts found. Try a different name or part number."
            />
          )}
        </div>
        {selectedPart && (
          <CollectionPartModal
            part={{
              partNum: selectedPart.partNum,
              partName: selectedPart.name,
              imageUrl: selectedPart.imageUrl,
              colorId: pickDefaultColor(selectedPart.colors)?.colorId ?? 0,
              colorName: pickDefaultColor(selectedPart.colors)?.colorName ?? '',
            }}
            availableColors={selectedPart.colors}
            onClose={() => setSelectedPart(null)}
          />
        )}
      </>
    );
  }

  if (searchType === 'minifig') {
    const mfPages =
      (minifigData?.pages as MinifigSearchPage[] | undefined) ?? [];
    const results = mfPages.flatMap((p: MinifigSearchPage) => p.results) ?? [];
    return (
      <>
        <MinifigSearchControlBar
          sort={minifigSort}
          onSortChange={handleMinifigSortChange}
        />
        <div className="container-wide py-6 lg:py-8">
          {isMinifigLoading && (
            <div className="flex justify-center py-12 text-center">
              <BrickLoader />
            </div>
          )}
          {minifigError && (
            <ErrorBanner
              className="mt-2"
              message="Failed to load minifigure results. Please try again."
            />
          )}
          {!isMinifigLoading && !minifigError && results.length > 0 && (
            <div>
              <div className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => fetchNextMinifigPage()}
                    disabled={isFetchingNextMinifigPage}
                  >
                    {isFetchingNextMinifigPage ? 'Loading…' : 'Load More'}
                  </Button>
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
      </>
    );
  }

  const showGroups = grouped.length > 1 || grouped[0]?.label !== 'Results';

  return (
    <>
      <SetSearchControlBar
        sort={sort}
        onSortChange={handleSortChange}
        pageSize={pageSize}
        onPageSizeChange={handlePageSizeChange}
        filter={filter}
        onFilterChange={handleFilterChange}
        exact={exact}
        onExactChange={handleExactChange}
      />
      <div className="container-wide py-6 lg:py-8">
        {isSetLoading && (
          <div className="flex justify-center py-12 text-center">
            <BrickLoader />
          </div>
        )}
        {setError && (
          <ErrorBanner
            className="mt-2"
            message="Failed to load search results. Please try again."
          />
        )}
        {!isSetLoading && !setError && flatResults.length > 0 && (
          <div>
            {!authLoading && !user && (
              <p className="mb-3 text-xs font-medium text-foreground-muted">
                <a
                  href="/login"
                  className="text-link underline underline-offset-2 hover:text-link-hover"
                >
                  Sign in
                </a>{' '}
                to track ownership and organize sets into collections.
              </p>
            )}
            <div className="flex flex-col gap-6">
              {grouped.map(group => (
                <div key={group.label} className="flex flex-col gap-2">
                  {showGroups && (
                    <CollectionGroupHeading>
                      {group.label}
                    </CollectionGroupHeading>
                  )}
                  <div
                    data-item-size="md"
                    className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                  >
                    {group.items.map((r: SearchResult) => (
                      <SearchResultListItem
                        key={`${r.setNumber}-${r.name}`}
                        result={r}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {hasNextSetPage && (
              <div className="mb-8 flex justify-center py-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fetchNextSetPage()}
                  disabled={isFetchingNextSetPage}
                >
                  {isFetchingNextSetPage ? 'Loading…' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
        {!isSetLoading && !setError && flatResults.length === 0 && (
          <EmptyState
            className="mt-4"
            message="No results found. Try different keywords or check spelling."
          />
        )}
      </div>
    </>
  );
}
