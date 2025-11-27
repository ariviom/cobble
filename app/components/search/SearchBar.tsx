'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type SearchBarProps = {
  initialQuery?: string;
};

function getCurrentSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }
  return new URLSearchParams(window.location.search);
}

export function SearchBar({ initialQuery = '' }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState<string>(initialQuery);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const params = getCurrentSearchParams();
      setQ(params.get('q') ?? '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next = q.trim();
    setQ(next);
    if (pathname !== '/search') {
      router.push(next ? `/search?q=${encodeURIComponent(next)}` : '/search');
      return;
    }
    const sp = getCurrentSearchParams();
    if (next) {
      sp.set('q', next);
    } else {
      sp.delete('q');
    }
    const queryString = sp.toString();
    router.replace(queryString ? `/search?${queryString}` : '/search');
  }

  function onClear() {
    setQ('');
    if (pathname === '/search') {
      router.replace('/search');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <label
        className="mb-2 block text-sm font-medium text-foreground"
        htmlFor="global-search"
      >
        Search set
      </label>
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id="global-search"
            className="w-full"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="e.g. 1788, pirate, castle, ninjago"
          />
          {q && (
            <button
              type="button"
              className="absolute top-1/2 right-2 h-6 w-6 -translate-y-1/2 cursor-pointer rounded-full bg-card-muted text-foreground-muted hover:bg-background-muted"
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
        <Button type="submit" variant="primary" className="px-3 py-2">
          Search
        </Button>
      </form>
    </div>
  );
}
