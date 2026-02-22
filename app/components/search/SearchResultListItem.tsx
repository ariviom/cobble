'use client';

import { SetDisplayCardWithControls } from '@/app/components/set/SetDisplayCardWithControls';
import { SetDetailModal } from '@/app/components/set/SetDetailModal';
import type { SearchResult } from '@/app/types/search';
import { useState } from 'react';

export function SearchResultListItem({ result }: { result: SearchResult }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <SetDisplayCardWithControls
        setNumber={result.setNumber}
        name={result.name}
        year={result.year}
        imageUrl={result.imageUrl}
        numParts={result.numParts}
        themeId={result.themeId ?? null}
        themeLabel={result.themeName ?? null}
        onClick={() => setModalOpen(true)}
      />
      <SetDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        setNumber={result.setNumber}
        setName={result.name}
        imageUrl={result.imageUrl}
        year={result.year}
        numParts={result.numParts}
        themeId={result.themeId ?? null}
        themeName={result.themeName ?? null}
      />
    </>
  );
}
