'use client';

import { SetSearchResultCard } from '@/app/components/set/SetSearchResultCard';
import { X } from 'lucide-react';
import type { IdentifySet } from './types';

type Props = {
  item: IdentifySet;
  onRemove?: (setNumber: string) => void;
};

export function IdentifySetListItem({ item, onRemove }: Props) {
  return (
    <div className="group relative">
      {onRemove && (
        <button
          type="button"
          className="absolute top-1 right-1 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full bg-brand-red p-1 text-white shadow transition-transform hover:scale-110"
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
      <SetSearchResultCard
        setNumber={item.setNumber}
        name={item.name}
        year={item.year}
        imageUrl={item.imageUrl}
        quantity={item.quantity}
        themeId={item.themeId ?? null}
        themeLabel={item.themeName ?? null}
      />
    </div>
  );
}
