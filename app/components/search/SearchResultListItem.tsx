'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
import type { SearchResult } from '@/app/types/search';

export function SearchResultListItem({ result }: { result: SearchResult }) {
  return (
    <SetDisplayCard
      setNumber={result.setNumber}
      name={result.name}
      year={result.year}
      imageUrl={result.imageUrl}
      numParts={result.numParts}
      themeId={result.themeId ?? null}
      themeLabel={result.themeName ?? null}
    />
  );
}
