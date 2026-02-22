'use client';

import { SetDisplayCardWithControls } from '@/app/components/set/SetDisplayCardWithControls';
import { SetDetailModal } from '@/app/components/set/SetDetailModal';
import { X } from 'lucide-react';
import { useState } from 'react';
import type { IdentifySet } from './types';

type Props = {
  item: IdentifySet;
  onRemove?: (setNumber: string) => void;
};

export function IdentifySetListItem({ item, onRemove }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="group relative">
        {onRemove && (
          <button
            type="button"
            className="absolute top-2 right-2 z-10 flex size-7 cursor-pointer items-center justify-center rounded-sm border-2 border-subtle bg-card text-foreground-muted shadow-sm transition-all duration-150 hover:scale-105 hover:border-danger hover:bg-danger hover:text-white"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              onRemove(item.setNumber);
            }}
            aria-label="Remove from recently viewed"
          >
            <div className="absolute top-1/2 left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"></div>
            <X className="size-4" />
          </button>
        )}
        <SetDisplayCardWithControls
          setNumber={item.setNumber}
          name={item.name && item.name.trim() ? item.name : item.setNumber}
          year={item.year}
          imageUrl={item.imageUrl}
          {...(typeof item.numParts === 'number'
            ? { numParts: item.numParts }
            : {})}
          themeId={item.themeId ?? null}
          themeLabel={item.themeName ?? null}
          onClick={() => setModalOpen(true)}
        />
      </div>
      <SetDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        setNumber={item.setNumber}
        setName={item.name && item.name.trim() ? item.name : item.setNumber}
        imageUrl={item.imageUrl}
        year={item.year}
        numParts={item.numParts ?? undefined}
        themeId={item.themeId ?? null}
        themeName={item.themeName ?? null}
      />
    </>
  );
}
