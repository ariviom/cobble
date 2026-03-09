'use client';

import { SegmentedControl } from '@/app/components/ui/SegmentedControl';
import { ThemedPageHeader } from '@/app/components/ui/ThemedPageHeader';
import type { CollectionType } from '@/app/components/home/CollectionControlBar';

type CollectionHeroProps = {
  collectionType?: CollectionType;
  onCollectionTypeChange?: (next: CollectionType) => void;
};

const typeSegments = [
  { key: 'sets', label: 'Sets' },
  { key: 'minifigs', label: 'Minifigs' },
  { key: 'parts', label: 'Parts' },
];

export function CollectionHero({
  collectionType,
  onCollectionTypeChange,
}: CollectionHeroProps = {}) {
  return (
    <section className="relative overflow-hidden">
      <ThemedPageHeader preferredColor="purple" className="py-6 lg:py-8">
        <div className="container-default">
          <div className="mb-6 text-center">
            <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-white lg:text-4xl">
              My Collection
            </h1>
            <p className="text-base text-white/80 lg:text-lg">
              Track your LEGO sets and minifigures
            </p>
          </div>

          {collectionType && onCollectionTypeChange && (
            <div className="mx-auto w-full max-w-xs hero-input-light">
              <SegmentedControl
                segments={typeSegments}
                value={collectionType}
                onChange={key => onCollectionTypeChange(key as CollectionType)}
                size="md"
                className="w-full shadow-lg"
              />
            </div>
          )}
        </div>

        {/* Decorative stud pattern */}
        <div className="pointer-events-none absolute top-3 right-0 left-0 flex justify-center gap-6 opacity-10">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-3 w-3 rounded-full bg-white" />
          ))}
        </div>
      </ThemedPageHeader>
      <div className="h-1.5 bg-brand-yellow" />
    </section>
  );
}
