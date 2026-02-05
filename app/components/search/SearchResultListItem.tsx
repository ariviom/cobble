'use client';

import { SetDisplayCardWithControls } from '@/app/components/set/SetDisplayCardWithControls';
import type { SearchResult } from '@/app/types/search';

export function SearchResultListItem({ result }: { result: SearchResult }) {
  return (
    <SetDisplayCardWithControls
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
