'use client';

import { IdentifySetListItem } from './IdentifySetListItem';
import type { IdentifySet } from './types';

type Props = {
  items: IdentifySet[];
  onRemoveItem?: (setNumber: string) => void;
};

export function IdentifySetList({ items, onRemoveItem }: Props) {
  if (!items.length) {
    return (
      <div className="mt-4 text-sm text-foreground-muted">
        No sets found for this part.
      </div>
    );
  }
  return (
    <div className="mt-2">
      <div
        data-item-size="md"
        className="grid grid-cols-1 gap-2 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        {items.map(it => (
          <IdentifySetListItem
            key={`${it.setNumber}-${it.quantity}`}
            item={it}
            onRemove={onRemoveItem}
          />
        ))}
      </div>
    </div>
  );
}
