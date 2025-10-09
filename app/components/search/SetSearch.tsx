'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SearchResultListItem } from './SearchResultListItem';
import { SearchResultGridCard } from './SearchResultGridCard';
import type { SearchResult } from './types';

async function fetchSearch(q: string) {
  if (!q) return [] as Array<SearchResult>;
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('search_failed');
  const data = (await res.json()) as { results: Array<SearchResult> };
  return data.results;
}

export function SetSearch() {
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 250);
  const { data, isLoading } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => fetchSearch(debounced),
    enabled: debounced.length > 0,
  });
  const [view, setView] = useState<'list' | 'grid'>('list');

  return (
    <div className="w-full max-w-xl">
      <label className="block text-sm font-medium mb-1" htmlFor="set-search">
        Search set number
      </label>
      <input
        id="set-search"
        className="w-full border rounded px-3 py-2"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="e.g. 1788, 6989, 21322"
      />
      <div className="flex items-center gap-2 mt-2">
        <label className="text-xs">View</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={view}
          onChange={e => setView(e.target.value as any)}
        >
          <option value="list">List</option>
          <option value="grid">Grid</option>
        </select>
      </div>
      {isLoading && <div className="mt-2 text-sm">Loading…</div>}
      {!isLoading &&
        data &&
        data.length > 0 &&
        (view === 'list' ? (
          <ul className="mt-2 border rounded divide-y">
            {data.map(r => (
              <SearchResultListItem key={r.setNumber} result={r} />
            ))}
          </ul>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.map(r => (
              <SearchResultGridCard key={r.setNumber} result={r} />
            ))}
          </div>
        ))}
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
