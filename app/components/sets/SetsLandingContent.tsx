'use client';

import { SetDisplayCardWithControls } from '@/app/components/set/SetDisplayCardWithControls';
import { MyCollectionSection } from '@/app/components/sets/MyCollectionSection';
import { SetProgressCard } from '@/app/components/sets/SetProgressCard';
import { Button } from '@/app/components/ui/Button';
import { HorizontalCardRail } from '@/app/components/ui/HorizontalCardRail';
import { useCompletionStats } from '@/app/hooks/useCompletionStats';
import { useRecentSets } from '@/app/hooks/useRecentSets';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import type { SetTab } from '@/app/store/open-tabs';
import type { RecentSetEntry } from '@/app/store/recent-sets';
import { removeRecentSet } from '@/app/store/recent-sets';
import { Camera, Search } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

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
  const recentSets = useRecentSets(isActive);
  const [removedSetNumbers, setRemovedSetNumbers] = useState<Set<string>>(
    new Set()
  );
  const { sets: continueSets } = useCompletionStats(isActive);
  const { user } = useSupabaseUser();

  const visibleRecentSets = recentSets.filter(
    s => !removedSetNumbers.has(s.setNumber)
  );

  const handleRemoveRecent = (setNumber: string) => {
    setRemovedSetNumbers(prev => new Set(prev).add(setNumber));
    removeRecentSet(setNumber);
  };

  const handleSelectRecent = useCallback(
    (set: RecentSetEntry, e: React.MouseEvent) => {
      if (!onSelectSet) return; // let Link navigate normally
      e.preventDefault();
      onSelectSet({
        type: 'set',
        id: set.setNumber,
        name: set.name,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        year: set.year,
        themeId: set.themeId ?? null,
        themeName: set.themeName ?? null,
      });
    },
    [onSelectSet]
  );

  const handleSelectContinue = useCallback(
    (set: (typeof continueSets)[number], e: React.MouseEvent) => {
      if (!onSelectSet) return;
      e.preventDefault();
      onSelectSet({
        type: 'set',
        id: set.setNumber,
        name: set.name,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        year: set.year,
        themeId: set.themeId ?? null,
      });
    },
    [onSelectSet]
  );

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
      <div className="sticky top-11 z-50 container-default bg-card py-4 lg:top-0">
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

      {/* Recently Viewed */}
      <section className="py-8">
        <div className="container-wide">
          {visibleRecentSets.length > 0 ? (
            <>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-section-title">
                  <span className="text-foreground-muted">Recently</span>{' '}
                  <span className="text-foreground">Viewed</span>
                </h2>
              </div>
              <HorizontalCardRail>
                {visibleRecentSets.map(set => (
                  <div
                    key={set.setNumber}
                    className="w-56 shrink-0 snap-start sm:w-64"
                    onClick={e => handleSelectRecent(set, e)}
                  >
                    <SetDisplayCardWithControls
                      setNumber={set.setNumber}
                      name={set.name}
                      year={set.year}
                      imageUrl={set.imageUrl}
                      numParts={set.numParts}
                      themeId={set.themeId ?? null}
                      onRemove={() => handleRemoveRecent(set.setNumber)}
                    />
                  </div>
                ))}
              </HorizontalCardRail>
            </>
          ) : (
            <p className="text-center text-body text-foreground-muted">
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
          )}
        </div>
      </section>

      {/* Continue Building — hidden when empty */}
      {continueSets.length > 0 && (
        <section className="py-8">
          <div className="container-wide">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-section-title">
                <span className="text-foreground-muted">Continue</span>{' '}
                <span className="text-foreground">Building</span>
              </h2>
            </div>
            <HorizontalCardRail>
              {continueSets.map(set => (
                <div
                  key={set.setNumber}
                  className="w-56 shrink-0 snap-start sm:w-64"
                  onClick={e => handleSelectContinue(set, e)}
                >
                  <SetProgressCard
                    setNumber={set.setNumber}
                    name={set.name}
                    year={set.year}
                    imageUrl={set.imageUrl}
                    numParts={set.numParts}
                    themeId={set.themeId}
                    ownedCount={set.ownedCount}
                    totalParts={set.totalParts}
                  />
                </div>
              ))}
            </HorizontalCardRail>
          </div>
        </section>
      )}

      {/* My Collection — self-hides when empty */}
      {user && <MyCollectionSection onSelectSet={onSelectSet} />}

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
