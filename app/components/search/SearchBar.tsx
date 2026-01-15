'use client';

import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SearchType } from '@/app/types/search';

type SearchBarProps = {
  initialQuery?: string;
  initialType?: SearchType;
};

function getCurrentSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }
  return new URLSearchParams(window.location.search);
}

export function SearchBar({
  initialQuery = '',
  initialType = 'set',
}: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState<string>(initialQuery);
  const [type, setType] = useState<SearchType>(initialType);

  useEffect(() => {
    setQ(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handlePopState = () => {
      const params = getCurrentSearchParams();
      setQ(params.get('q') ?? '');
      const rawType = params.get('type');
      setType(rawType === 'minifig' ? 'minifig' : 'set');
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
    const params =
      pathname === '/search' ? getCurrentSearchParams() : new URLSearchParams();
    if (next) {
      params.set('q', next);
    } else {
      params.delete('q');
    }
    // Only persist non-default type in the URL to keep links clean.
    if (type === 'minifig') {
      params.set('type', 'minifig');
    } else {
      params.delete('type');
    }
    const queryString = params.toString();
    const href = queryString ? `/search?${queryString}` : '/search';
    if (pathname !== '/search') {
      router.push(href);
    } else {
      router.replace(href);
    }
  }

  function onClear() {
    setQ('');
    if (pathname === '/search') {
      router.replace('/search');
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
      >
        <div className="relative flex-1">
          <Input
            id="global-search"
            size="lg"
            className="w-full shadow-lg"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={
              type === 'minifig' ? 'Search minifigures...' : 'Search sets...'
            }
            aria-label={
              type === 'minifig' ? 'Search minifigures' : 'Search sets'
            }
          />
          {q && (
            <button
              type="button"
              className="absolute top-1/2 right-3 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-neutral-200 text-foreground-muted hover:bg-neutral-300"
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
        <div className="flex items-stretch gap-3">
          <Select
            id="search-type"
            size="lg"
            className="flex-1 shadow-lg sm:w-auto sm:flex-none"
            value={type}
            onChange={event =>
              setType(event.target.value === 'minifig' ? 'minifig' : 'set')
            }
            aria-label="Search type"
          >
            <option value="set">Sets</option>
            <option value="minifig">Minifigures</option>
          </Select>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="px-8 shadow-lg"
          >
            Search
          </Button>
        </div>
      </form>
    </div>
  );
}
