'use client';

import { SetTopBar } from '@/app/components/nav/SetTopBar';
import { InventoryTable } from '@/app/components/set/InventoryTable';
import { cn } from '@/app/components/ui/utils';
import { addRecentSet } from '@/app/store/recent-sets';
import { useEffect, useState } from 'react';

type SetPageClientProps = {
  setNumber: string;
  setName: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
};

export function SetPageClient({
  setNumber,
  setName,
  year,
  imageUrl,
  numParts,
}: SetPageClientProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    addRecentSet({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
    });
  }, [setNumber, setName, year, imageUrl, numParts]);

  return (
    <div
      className={cn(
        'flex min-h-[100dvh] flex-col',
        'lg:set-grid-layout lg:h-[calc(100dvh-var(--spacing-nav-height))] lg:min-h-0 lg:pl-80 lg:set-grid-animated',
        expanded
          ? 'expanded-topnav lg:set-grid-top-expanded'
          : 'lg:set-grid-top-collapsed'
      )}
    >
      <SetTopBar
        setNumber={setNumber}
        setName={setName}
        imageUrl={imageUrl}
        expanded={expanded}
        onToggleExpanded={() => setExpanded(prev => !prev)}
      />
      <InventoryTable setNumber={setNumber} setName={setName} />
    </div>
  );
}
