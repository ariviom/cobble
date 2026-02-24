'use client';

import { logEvent } from '@/lib/metrics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IdentifySetListItem } from './IdentifySetListItem';
import type { IdentifySet } from './types';

const PAGE_SIZE = 50;

type Props = {
  items: IdentifySet[];
  onRemoveItem?: (setNumber: string) => void;
  source?: 'rb' | 'bl_supersets' | 'bl_components';
};

export function IdentifySetList({ items, onRemoveItem, source }: Props) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Reset when results change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [items]);

  // Callback ref: sets up / tears down IntersectionObserver when
  // the sentinel div mounts or unmounts.  Re-created when visibleCount
  // or items.length changes so the observer re-checks the sentinel's
  // new position after each page load — this cascades until the
  // sentinel is pushed below the viewport, then stops.
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!node) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            setVisibleCount(prev => Math.min(prev + PAGE_SIZE, items.length));
          }
        },
        { rootMargin: '600px' }
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [items.length, visibleCount]
  );

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

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

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <div className="mt-2">
      <div
        data-item-size="md"
        className="grid grid-cols-1 gap-x-2 gap-y-4 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        {visibleItems.map(it => (
          <IdentifySetListItem
            key={`${it.setNumber}-${it.quantity}`}
            item={it}
            {...(onRemoveItem ? { onRemove: onRemoveItem } : {})}
          />
        ))}
      </div>
      {hasMore && (
        <div
          ref={sentinelRef}
          className="flex justify-center py-4 text-sm text-foreground-muted"
        >
          Loading more...
        </div>
      )}
    </div>
  );
}
