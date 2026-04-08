'use client';

import { SegmentedControl } from '@/app/components/ui/SegmentedControl';
import { ThemedPageHeader } from '@/app/components/ui/ThemedPageHeader';
import type { CollectionType } from '@/app/components/home/CollectionControlBar';

type CollectionStats = {
  ownedSets?: number | undefined;
  minifigs?: number | undefined;
  spareParts?: number | undefined;
  uniqueParts?: number | undefined;
  totalPieces?: number | undefined;
};

type CollectionHeroProps = {
  collectionType?: CollectionType;
  onCollectionTypeChange?: (next: CollectionType) => void;
  stats?: CollectionStats | undefined;
};

const typeSegments = [
  { key: 'sets', label: 'Sets' },
  { key: 'minifigs', label: 'Minifigs' },
  { key: 'parts', label: 'Parts' },
];

function StatsSummary({ stats }: { stats?: CollectionStats | undefined }) {
  if (!stats) return null;
  const items: string[] = [];
  if (stats.ownedSets != null && stats.ownedSets > 0)
    items.push(
      `${stats.ownedSets} owned set${stats.ownedSets !== 1 ? 's' : ''}`
    );
  if (stats.minifigs != null && stats.minifigs > 0)
    items.push(`${stats.minifigs} minifig${stats.minifigs !== 1 ? 's' : ''}`);
  if (stats.uniqueParts != null && stats.uniqueParts > 0)
    items.push(
      `${stats.uniqueParts.toLocaleString()} unique part${stats.uniqueParts !== 1 ? 's' : ''}`
    );
  if (stats.totalPieces != null && stats.totalPieces > 0)
    items.push(
      `${stats.totalPieces.toLocaleString()} total piece${stats.totalPieces !== 1 ? 's' : ''}`
    );
  if (stats.spareParts != null && stats.spareParts > 0)
    items.push(`${stats.spareParts.toLocaleString()} spare`);
  if (items.length === 0) return null;
  return <p className="mt-1 text-sm text-white/60">{items.join(' · ')}</p>;
}

export function CollectionHero({
  collectionType,
  onCollectionTypeChange,
  stats,
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
            <StatsSummary stats={stats} />
          </div>

          {collectionType && onCollectionTypeChange && (
            <div className="mx-auto w-full max-w-xs dark:hero-input-dark">
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
