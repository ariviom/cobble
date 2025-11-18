'use client';

import { InventoryTable } from '@/app/components/set/InventoryTable';
import { addRecentSet } from '@/app/store/recent-sets';
import { useEffect } from 'react';

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
  useEffect(() => {
    addRecentSet({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
    });
  }, [setNumber, setName, year, imageUrl, numParts]);

  return <InventoryTable setNumber={setNumber} />;
}


