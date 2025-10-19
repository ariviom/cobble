'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function SearchBar() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const qParam = searchParams.get('q') ?? '';
  const [q, setQ] = useState<string>(qParam);

  useEffect(() => {
    setQ(qParam);
  }, [qParam]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = q.trim();
    if (pathname !== '/search') {
      router.push(next ? `/search?q=${encodeURIComponent(next)}` : '/search');
      return;
    }
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    if (next) sp.set('q', next);
    else sp.delete('q');
    router.replace(`/search?${sp.toString()}`);
  }

  function onClear() {
    setQ('');
    if (pathname === '/search') {
      router.replace('/search');
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <label
        className="mb-2 block text-sm font-medium text-foreground"
        htmlFor="global-search"
      >
        Search set
      </label>
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            id="global-search"
            className="w-full rounded border border-neutral-200 bg-background px-3 py-2 pr-8 text-foreground"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="e.g. 1788, pirate, castle, ninjago"
          />
          {q && (
            <button
              type="button"
              className="absolute top-1/2 right-2 h-6 w-6 -translate-y-1/2 cursor-pointer rounded-full bg-neutral-100 text-foreground-muted hover:bg-neutral-200"
              onClick={onClear}
              aria-label="Clear search"
            >
              <span
                className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
                aria-hidden="true"
              />
              ×
            </button>
          )}
        </div>
        <button
          type="submit"
          className="rounded border bg-blue-600 px-3 py-2 text-white"
        >
          Search
        </button>
      </form>
    </div>
  );
}
