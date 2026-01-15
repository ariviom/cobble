'use client';

import { buttonVariants } from '@/app/components/ui/Button';
import { IdentifySetList } from '@/app/components/identify/IdentifySetList';
import type { IdentifySet } from '@/app/components/identify/types';
import { getRecentSets, removeRecentSet } from '@/app/store/recent-sets';
import { Search, Camera } from 'lucide-react';
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
    <section className="py-8">
      <div className="container-wide px-4">
        {items.length > 0 ? (
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-section-title">
              <span className="text-foreground-muted">Recently</span>{' '}
              <span className="text-foreground">Viewed</span>
            </h2>
          </div>
        ) : (
          <div className="rounded-[var(--radius-xl)] border-2 border-dashed border-subtle bg-card/50 p-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow">
              <span className="text-3xl">🎯</span>
            </div>
            <h2 className="mb-2 text-section-title">Jump Back In</h2>
            <p className="mb-6 text-body text-foreground-muted">
              Start exploring your LEGO collection
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/search"
                className={buttonVariants({ variant: 'primary', size: 'md' })}
              >
                <Search className="h-4 w-4" />
                Search for a set
              </Link>
              <Link
                href="/identify"
                className={buttonVariants({ variant: 'secondary', size: 'md' })}
              >
                <Camera className="h-4 w-4" />
                Upload a photo
              </Link>
            </div>
          </div>
        )}
        {items.length > 0 && (
          <IdentifySetList items={items} onRemoveItem={handleRemove} />
        )}
      </div>
    </section>
  );
}
