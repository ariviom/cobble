'use client';

import { logEvent } from '@/lib/metrics';
import { IdentifySetListItem } from './IdentifySetListItem';
import type { IdentifySet } from './types';

type Props = {
  items: IdentifySet[];
  onRemoveItem?: (setNumber: string) => void;
  source?: 'rb' | 'bl_supersets' | 'bl_components';
};

export function IdentifySetList({ items, onRemoveItem, source }: Props) {
  if (process.env.NODE_ENV !== 'production') {
    logEvent('identify.set_list.sample', { items: items.slice(0, 3) });
  }
  if (!items.length) {
    return (
      <div className="mt-4 text-sm text-foreground-muted">
        {source === 'bl_supersets'
          ? 'No BrickLink supersets found for this part.'
          : source === 'bl_components'
            ? 'Sets could not be inferred from component parts.'
            : 'No sets found for this part.'}
      </div>
    );
  }
  return (
    <div className="mt-2">
      <div
        data-item-size="md"
        className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        {items.map(it => (
          <IdentifySetListItem
            key={`${it.setNumber}-${it.quantity}`}
            item={it}
            {...(onRemoveItem ? { onRemove: onRemoveItem } : {})}
          />
        ))}
      </div>
    </div>
  );
}
