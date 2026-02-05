'use client';

import { Input } from '@/app/components/ui/Input';
import { cn } from '@/app/components/ui/utils';
import { getRecentSets, type RecentSetEntry } from '@/app/store/recent-sets';
import { useUserSetsStore } from '@/app/store/user-sets';
import { Search, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OpenTab } from './SetTabBar';

type SetEntry = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId?: number | null;
  themeName?: string | null;
};

type AddTabContentProps = {
  /** Currently open tabs (to filter out from suggestions) */
  openTabs: OpenTab[];
  /** Callback when a set is selected to open as a new tab */
  onOpenSet: (tab: OpenTab) => void;
  /** Callback to close the dropdown/sheet */
  onClose: () => void;
};

const MAX_RESULTS = 10;

/**
 * Shared content for the add-tab dropdown/sheet.
 * Provides inline search across user collection and recent sets.
 */
export function AddTabContent({
  openTabs,
  onOpenSet,
  onClose,
}: AddTabContentProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    // Small delay to ensure dropdown is visible first
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Get user's collection from Zustand store
  const userSets = useUserSetsStore(state => state.sets);

  // Combine user collection and recent sets, with deduplication
  const allSets = useMemo(() => {
    const openSetNumbers = new Set(
      openTabs.map(t => t.setNumber.toLowerCase())
    );
    const seen = new Set<string>();
    const result: SetEntry[] = [];

    // Add user collection sets first (they take priority)
    // Note: UserSet doesn't store themeName, only themeId
    Object.values(userSets).forEach(set => {
      const normKey = set.setNumber.toLowerCase();
      if (openSetNumbers.has(normKey) || seen.has(normKey)) return;
      seen.add(normKey);
      result.push({
        setNumber: set.setNumber,
        name: set.name,
        year: set.year,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        themeId: set.themeId ?? null,
        themeName: null,
      });
    });

    // Add recent sets that aren't already included
    const recentSets = getRecentSets();
    recentSets.forEach((set: RecentSetEntry) => {
      const normKey = set.setNumber.toLowerCase();
      if (openSetNumbers.has(normKey) || seen.has(normKey)) return;
      seen.add(normKey);
      result.push({
        setNumber: set.setNumber,
        name: set.name,
        year: set.year,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        themeId: set.themeId ?? null,
        themeName: set.themeName ?? null,
      });
    });

    return result;
  }, [userSets, openTabs]);

  // Filter sets by search query
  const filteredSets = useMemo(() => {
    if (!query.trim()) {
      // When no query, show all sets up to MAX_RESULTS
      return allSets.slice(0, MAX_RESULTS);
    }

    const lowerQuery = query.toLowerCase().trim();
    return allSets
      .filter(
        set =>
          set.name.toLowerCase().includes(lowerQuery) ||
          set.setNumber.toLowerCase().includes(lowerQuery)
      )
      .slice(0, MAX_RESULTS);
  }, [allSets, query]);

  const handleSelectSet = useCallback(
    (set: SetEntry, e?: React.MouseEvent) => {
      e?.preventDefault();
      onOpenSet({
        setNumber: set.setNumber,
        name: set.name,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        year: set.year,
        themeId: set.themeId ?? null,
        themeName: set.themeName ?? null,
      });
      onClose();
    },
    [onOpenSet, onClose]
  );

  const handleSearchAll = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onClose();
      const searchQuery = query.trim();
      if (searchQuery) {
        router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      } else {
        router.push('/search');
      }
    },
    [onClose, router, query]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && query.trim()) {
        e.preventDefault();
        onClose();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    },
    [onClose, router, query]
  );

  const showNoResults = query.trim() && filteredSets.length === 0;
  const showEmptyState = !query.trim() && allSets.length === 0;

  return (
    <div className="-mx-5 -mb-5 flex flex-col">
      {/* Search input */}
      <div className="px-5 pb-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-foreground-muted"
          />
          <Input
            ref={inputRef}
            type="text"
            size="sm"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search your sets..."
            className="pr-9 pl-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-foreground-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Results list */}
      <div className="h-72 overflow-y-auto border-t border-subtle">
        {showEmptyState ? (
          <div className="px-5 py-6 text-center text-sm text-foreground-muted">
            <p>No sets in your collection yet.</p>
            <p className="mt-1">Browse sets to get started!</p>
          </div>
        ) : showNoResults ? (
          <div className="px-5 py-6 text-center text-sm text-foreground-muted">
            <p>No results from your collection.</p>
            <p className="mt-2">
              <Link
                href={`/search?q=${encodeURIComponent(query.trim())}`}
                onClick={handleSearchAll}
                className="font-medium text-link underline underline-offset-2 hover:text-link-hover"
              >
                Search all sets
              </Link>
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {filteredSets.map(set => (
              <li key={set.setNumber}>
                <Link
                  href={`/sets/${set.setNumber}`}
                  prefetch={true}
                  onClick={e => handleSelectSet(set, e)}
                  className={cn(
                    'flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors',
                    'hover:bg-card-muted'
                  )}
                  role="menuitem"
                >
                  <div className="relative size-10 flex-shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                    {set.imageUrl ? (
                      <Image
                        src={set.imageUrl}
                        alt=""
                        width={40}
                        height={40}
                        className="size-full object-contain"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xs text-neutral-400">
                        ?
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{set.name}</div>
                    <div className="text-sm text-foreground-muted">
                      {set.setNumber}
                      {set.year > 0 && ` • ${set.year}`}
                      {set.numParts > 0 &&
                        ` • ${set.numParts.toLocaleString()} pcs`}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
