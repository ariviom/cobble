'use client';

import { IdentifySetList } from '@/app/components/identify/IdentifySetList';
import type { IdentifySet } from '@/app/components/identify/types';
import { getRecentSets, removeRecentSet } from '@/app/store/recent-sets';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function RecentlyViewedSets() {
  const [items, setItems] = useState<IdentifySet[]>([]);

  useEffect(() => {
    const recents = getRecentSets();
    if (!recents.length) return;
    const mapped: IdentifySet[] = recents.map(it => ({
      setNumber: it.setNumber,
      name: it.name,
      year: it.year,
      imageUrl: it.imageUrl,
      // Reuse "quantity" field to display a count; here we use total parts in the set.
      quantity: it.numParts,
      themeId: it.themeId ?? null,
      themeName: it.themeName ?? null,
    }));
    setItems(mapped);
  }, []);

  const handleRemove = (setNumber: string) => {
    setItems(prev => prev.filter(it => it.setNumber !== setNumber));
    removeRecentSet(setNumber);
  };
  return (
    <section className="mb-8">
      <div className="mx-auto w-full max-w-7xl">
        {items.length > 0 ? (
          <div className="my-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recently viewed sets</h2>
          </div>
        ) : (
          <div className="my-4">
            <h2 className="text-lg font-semibold">Jump Back In</h2>
            <Link className="text-theme-primary underline" href="/search">
              Search for a set
            </Link>{' '}
            or{' '}
            <Link className="text-theme-primary underline" href="/identify">
              upload a photo
            </Link>{' '}
            to get started.
          </div>
        )}
        {items.length > 0 && (
          <IdentifySetList items={items} onRemoveItem={handleRemove} />
        )}
      </div>
    </section>
  );
}
