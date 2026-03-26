'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ScrollableRailResult = {
  ref: React.RefObject<HTMLDivElement | null>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  hasOverflow: boolean;
  scrollBy: (direction: 'left' | 'right', amount?: number) => void;
};

/**
 * Shared scroll tracking hook for horizontally-scrollable rails.
 * Manages ResizeObserver + scroll event listeners and exposes scroll state.
 *
 * @param scrollFraction - fraction of container width to scroll (default 0.8)
 */
export function useScrollableRail(scrollFraction = 0.8): ScrollableRailResult {
  const ref = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setCanScrollRight(canRight);
    setHasOverflow(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scrollBy = useCallback(
    (direction: 'left' | 'right', amount?: number) => {
      const el = ref.current;
      if (!el) return;
      const distance = amount ?? Math.round(el.clientWidth * scrollFraction);
      el.scrollBy({
        left: direction === 'left' ? -distance : distance,
        behavior: 'smooth',
      });
    },
    [scrollFraction]
  );

  return { ref, canScrollLeft, canScrollRight, hasOverflow, scrollBy };
}
