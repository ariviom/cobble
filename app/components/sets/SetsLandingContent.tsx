'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import { SetDisplayCardWithControls } from '@/app/components/set/SetDisplayCardWithControls';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Spinner } from '@/app/components/ui/Spinner';
import { cn } from '@/app/components/ui/utils';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import {
  useUnifiedSets,
  type UnifiedFilter,
  type UnifiedSet,
} from '@/app/hooks/useUnifiedSets';
import type { SetTab } from '@/app/store/open-tabs';
import { Camera, Search, Trophy, Users, Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

type SetsLandingContentProps = {
  /** When provided, clicking a set calls this instead of navigating via Link. */
  onSelectSet?: (setTab: SetTab) => void;
  /** Whether this landing tab is currently active/visible. */
  isActive?: boolean;
};

export function SetsLandingContent({
  onSelectSet,
  isActive = true,
}: SetsLandingContentProps) {
  const {
    sets,
    activeFilter,
    setActiveFilter,
    searchQuery,
    setSearchQuery,
    filterOptions,
    removeRecent,
    removeSearchParty,
    clearAllSearchParties,
    storedSessions,
    isLoading,
  } = useUnifiedSets(isActive);
  const { user } = useSupabaseUser();

  const handleSelectSet = useCallback(
    (set: UnifiedSet, e: React.MouseEvent) => {
      if (!onSelectSet) return;
      e.preventDefault();
      onSelectSet({
        type: 'set',
        id: set.setNumber,
        setNumber: set.setNumber,
        name: set.name,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        year: set.year,
        themeId: set.themeId,
      });
    },
    [onSelectSet]
  );

  const emptyMessage = (() => {
    if (searchQuery.trim()) return 'No sets match your search.';
    switch (activeFilter) {
      case 'recent':
        return null; // handled with rich empty state below
      case 'continue':
        return 'Start marking pieces on a set to track your progress.';
      case 'search-parties':
        return 'No active Search Party sessions.';
      default:
        return 'No sets found.';
    }
  })();

  return (
    <div className="min-h-screen pb-[var(--spacing-nav-height)] lg:pb-0">
      {/* Hero Section */}
      <section className="bg-card px-4 pt-6 lg:pt-10">
        <div className="container-default flex flex-col items-center text-center">
          <p className="max-w-lg text-lg font-medium text-foreground-muted lg:text-xl">
            Find your LEGO set by searching the catalog or snapping a photo of a
            part to get started.
          </p>
        </div>
      </section>

      {/* Sticky CTA buttons */}
      <div className="sticky top-11 z-50 bg-card px-4 py-4 lg:top-0">
        <div className="flex flex-wrap justify-center gap-4">
          <Button href="/search" variant="primary" size="lg" className="gap-2">
            <Search className="h-5 w-5" />
            Search All Sets
          </Button>
          <Button
            href="/identify"
            variant="secondary"
            size="lg"
            className="gap-2"
          >
            <Camera className="h-5 w-5" />
            Identify Parts
          </Button>
        </div>
      </div>

      {/* Unified sets grid */}
      <section className="py-8">
        <div className="container-wide">
          {/* Filter chips */}
          <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 no-scrollbar sm:-mx-4 sm:px-4">
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setActiveFilter(opt.key as UnifiedFilter)}
                className={cn(
                  'shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors',
                  activeFilter === opt.key
                    ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                    : 'border-subtle bg-card text-foreground-muted hover:border-theme-primary/50 hover:text-foreground'
                )}
              >
                {opt.label}
                <span className="ml-1.5 text-xs opacity-70">{opt.count}</span>
              </button>
            ))}
          </div>

          {/* Clear all link for Search Parties */}
          {activeFilter === 'search-parties' && sets.length > 0 && (
            <div className="mb-2 text-right">
              <button
                type="button"
                onClick={clearAllSearchParties}
                className="text-xs text-foreground-muted underline underline-offset-2 transition-colors hover:text-foreground"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Filter / search input */}
          <div className="relative mb-6">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-foreground-muted" />
            <Input
              size="lg"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter by name or number..."
              className="pl-11"
            />
          </div>

          {/* Content */}
          {isLoading && activeFilter !== 'recent' && sets.length === 0 ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading sets..." />
            </div>
          ) : sets.length === 0 ? (
            activeFilter === 'recent' && !searchQuery.trim() ? (
              <p className="py-8 text-center text-body text-foreground-muted">
                Sets you view will appear here.
                {!user && (
                  <>
                    {' '}
                    <Link
                      href="/login"
                      className="font-medium text-theme-text underline underline-offset-2"
                    >
                      Sign in
                    </Link>{' '}
                    to sync your collection across devices.
                  </>
                )}
              </p>
            ) : (
              <div className="py-8 text-center text-sm text-foreground-muted">
                <p>{emptyMessage}</p>
                {searchQuery.trim() && (
                  <p className="mt-3">
                    <Link
                      href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
                      className="font-medium text-theme-text underline underline-offset-2"
                    >
                      Search the catalog for &ldquo;{searchQuery.trim()}&rdquo;
                    </Link>
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 gap-x-2 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
              {sets.map(set => {
                const isSpFilter = activeFilter === 'search-parties';
                const stored = isSpFilter
                  ? storedSessions.find(
                      s =>
                        s.setNumber.toLowerCase() ===
                        set.setNumber.toLowerCase()
                    )
                  : undefined;

                let onRemove: (() => void) | undefined;
                if (activeFilter === 'recent') {
                  onRemove = () => removeRecent(set.setNumber);
                } else if (stored) {
                  onRemove = () => removeSearchParty(stored.slug);
                }

                if (isSpFilter && stored) {
                  const hasStats =
                    stored.piecesFound != null ||
                    stored.participantCount != null;
                  return (
                    <div
                      key={set.setNumber}
                      onClick={e => handleSelectSet(set, e)}
                    >
                      <SetDisplayCard
                        setNumber={set.setNumber}
                        name={set.name}
                        year={set.year}
                        imageUrl={set.imageUrl}
                        numParts={set.numParts}
                        themeId={set.themeId}
                        onRemove={onRemove}
                      >
                        {hasStats && (
                          <div className="grid grid-cols-3 border-t border-subtle px-2 py-2.5 text-[0.8125rem] font-semibold text-foreground-muted sm:px-3">
                            {stored.participantCount != null && (
                              <span className="flex items-center justify-center gap-1">
                                <Users className="h-3.5 w-3.5 shrink-0" />
                                {stored.participantCount}
                              </span>
                            )}
                            {stored.piecesFound != null && (
                              <span className="flex items-center justify-center gap-1">
                                <Puzzle className="h-3.5 w-3.5 shrink-0" />
                                {stored.piecesFound}
                              </span>
                            )}
                            {stored.leaderboardPosition != null && (
                              <span className="flex items-center justify-center gap-1">
                                <Trophy className="h-3.5 w-3.5 shrink-0" />#
                                {stored.leaderboardPosition}
                              </span>
                            )}
                          </div>
                        )}
                      </SetDisplayCard>
                    </div>
                  );
                }

                return (
                  <div
                    key={set.setNumber}
                    onClick={e => handleSelectSet(set, e)}
                  >
                    <SetDisplayCardWithControls
                      setNumber={set.setNumber}
                      name={set.name}
                      year={set.year}
                      imageUrl={set.imageUrl}
                      numParts={set.numParts}
                      themeId={set.themeId}
                      ownedCount={set.ownedCount}
                      totalParts={set.totalParts}
                      onRemove={onRemove}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-8 mb-8 border-t border-subtle px-4 pt-8">
        <div className="container-default flex flex-col items-center gap-4">
          <div className="flex gap-6 text-xs text-foreground-muted">
            <Link
              href="/terms"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link
              href="/privacy"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
