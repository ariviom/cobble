'use client';

import { SetSearchResultCard } from '@/app/components/set/SetSearchResultCard';
import type { SearchResult } from '@/app/types/search';

export function SearchResultListItem({ result }: { result: SearchResult }) {
  return (
    <SetSearchResultCard
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
