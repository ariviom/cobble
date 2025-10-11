'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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

export function SetSearch() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortOption>('relevance');
  const [showMore, setShowMore] = useState(false);
  const debounced = useDebounce(q, 250);
  const { data, isLoading } = useQuery({
    queryKey: ['search', debounced, sort],
    queryFn: () => fetchSearch(debounced, sort),
    enabled: debounced.length > 0,
  });

  return (
    <div className="w-full max-w-xl">
      <label className="mb-1 block text-sm font-medium" htmlFor="set-search">
        Search set number
      </label>
      <input
        id="set-search"
        className="w-full rounded border px-3 py-2"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="e.g. 1788, pirate, castle, ninjago"
      />
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs">Sort by</label>
        <select
          className="rounded border px-2 py-1 text-sm"
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
      {!isLoading &&
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

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
