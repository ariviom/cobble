'use client';

import { SetDisplayCard } from '@/app/components/set/SetDisplayCard';
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
          className="absolute top-1 right-1 z-10 rounded-full bg-white/90 p-1 text-[10px] text-brand-red shadow hover:bg-brand-red hover:text-white"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            onRemove(item.setNumber);
          }}
          aria-label="Remove from recently viewed"
        >
          ×
        </button>
      )}
      <SetDisplayCard
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
