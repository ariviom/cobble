'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SearchResultListItem } from './SearchResultListItem';
import type { SearchResponse, SortOption } from './types';

async function fetchSearch(
  q: string,
  sort: SortOption = 'relevance'
): Promise<SearchResponse> {
  if (!q) return { exactMatches: [], otherMatches: [], hasMore: false };
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(q)}&sort=${sort}`
  );
  if (!res.ok) throw new Error('search_failed');
  const data = (await res.json()) as SearchResponse;
  return data;
}

export function SearchResults() {
  const params = useSearchParams();
  const q = params.get('q') ?? '';
  const [sort, setSort] = useState<SortOption>('relevance');
  const [showMore, setShowMore] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['search', q, sort],
    queryFn: () => fetchSearch(q, sort),
    enabled: q.length > 0,
  });

  if (!q) return null;
  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium">Sort by</label>
        <select
          className="rounded border px-3 py-2 text-sm"
          value={sort}
          onChange={e => setSort(e.target.value as SortOption)}
        >
          <option value="relevance">Relevance</option>
          <option value="pieces-asc">Pieces (fewest first)</option>
          <option value="pieces-desc">Pieces (most first)</option>
          <option value="year-asc">Year (oldest first)</option>
          <option value="year-desc">Year (newest first)</option>
        </select>
      </div>
      {isLoading && <div className="mt-2 text-sm">Loading…</div>}
      {error && (
        <div className="mt-2 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {/* Placeholder error message - will be styled later */}
          Failed to load search results. Please try again.
        </div>
      )}
      {!isLoading &&
        !error &&
        data &&
        (data.exactMatches.length > 0 || data.otherMatches.length > 0) && (
          <div className="mt-2">
            <ul className="divide-y rounded border">
              {data.exactMatches.map(r => (
                <SearchResultListItem key={r.setNumber} result={r} />
              ))}
              {showMore &&
                data.otherMatches.map(r => (
                  <SearchResultListItem key={r.setNumber} result={r} />
                ))}
            </ul>
            {data.hasMore && !showMore && (
              <button
                onClick={() => setShowMore(true)}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Show {data.otherMatches.length} more results
              </button>
            )}
          </div>
        )}
    </div>
  );
}
