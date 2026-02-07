'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import { Input } from '@/app/components/ui/Input';
import { Spinner } from '@/app/components/ui/Spinner';
import { cn } from '@/app/components/ui/utils';
import {
  useCollectionSets,
  type ListFilter,
} from '@/app/hooks/useCollectionSets';
import type { SetTab } from '@/app/store/open-tabs';
import { Search } from 'lucide-react';
import { useCallback } from 'react';

type MyCollectionSectionProps = {
  onSelectSet?: ((setTab: SetTab) => void) | undefined;
};

export function MyCollectionSection({ onSelectSet }: MyCollectionSectionProps) {
  const {
    filteredSets,
    totalCount,
    listFilter,
    setListFilter,
    searchQuery,
    setSearchQuery,
    filterOptions,
    isLoading,
    isEmpty,
  } = useCollectionSets();

  const handleSelectSet = useCallback(
    (
      set: {
        setNumber: string;
        name: string;
        year: number;
        imageUrl: string | null;
        numParts: number;
        themeId: number | null;
      },
      e: React.MouseEvent
    ) => {
      if (!onSelectSet) return;
      e.preventDefault();
      onSelectSet({
        type: 'set',
        id: set.setNumber,
        name: set.name,
        imageUrl: set.imageUrl,
        numParts: set.numParts,
        year: set.year,
        themeId: set.themeId,
      });
    },
    [onSelectSet]
  );

  // Hide entirely when collection is empty (no owned sets and no list items)
  if (isEmpty) return null;

  return (
    <section className="py-8">
      <div className="container-wide">
        {/* Section header */}
        <div className="mb-6 flex items-center gap-3">
          <h2 className="text-section-title">
            <span className="text-foreground-muted">My</span>{' '}
            <span className="text-foreground">Collection</span>
          </h2>
          <span className="rounded-full bg-theme-primary/10 px-2.5 py-0.5 text-xs font-bold text-theme-text">
            {totalCount}
          </span>
        </div>

        {/* Filter chips */}
        {filterOptions.length > 1 && (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {filterOptions.map(opt => (
              <button
                key={opt.key}
                onClick={() => setListFilter(opt.key as ListFilter)}
                className={cn(
                  'shrink-0 rounded-full border-2 px-3 py-1 text-sm font-semibold transition-colors',
                  listFilter === opt.key
                    ? 'border-theme-primary bg-theme-primary/10 text-theme-text'
                    : 'border-subtle bg-card text-foreground-muted hover:border-theme-primary/50 hover:text-foreground'
                )}
              >
                {opt.label}
                <span className="ml-1.5 text-xs opacity-70">{opt.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            size="sm"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name or number..."
            className="pl-9"
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner label="Loading collection..." />
          </div>
        ) : filteredSets.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-muted">
            No sets match your search.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-2 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
            {filteredSets.map(set => (
              <div key={set.setNumber} onClick={e => handleSelectSet(set, e)}>
                <SetDisplayCard
                  setNumber={set.setNumber}
                  name={set.name}
                  year={set.year}
                  imageUrl={set.imageUrl}
                  numParts={set.numParts}
                  themeId={set.themeId}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
