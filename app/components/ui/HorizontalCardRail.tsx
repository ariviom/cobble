'use client';

import { cn } from '@/app/components/ui/utils';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

function ArrowButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-foreground-muted shadow-sm transition-opacity disabled:opacity-0',
        side === 'left' ? 'left-0' : 'right-0',
        disabled ? 'pointer-events-none' : 'hover:bg-background-muted'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
    >
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
      {side === 'left' ? '\u2039' : '\u203A'}
    </button>
  );
}

export function HorizontalCardRail({ children, className }: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const updateScrollState = () => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setCanScrollRight(canRight);
    setHasOverflow(el.scrollWidth > el.clientWidth + 1);
  };

  useEffect(() => {
    updateScrollState();
    const el = listRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, []);

  function scrollByAmount(dir: 'left' | 'right') {
    const el = listRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.8);
    el.scrollBy({
      left: dir === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  }

  return (
    <div className={cn('relative', className)}>
      {hasOverflow && (
        <ArrowButton
          side="left"
          disabled={!canScrollLeft}
          onClick={() => scrollByAmount('left')}
        />
      )}
      <div
        ref={listRef}
        className={cn(
          'flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible scroll-smooth py-1 no-scrollbar',
          hasOverflow ? 'px-12' : 'px-0'
        )}
      >
        {children}
      </div>
      {hasOverflow && (
        <ArrowButton
          side="right"
          disabled={!canScrollRight}
          onClick={() => scrollByAmount('right')}
        />
      )}
    </div>
  );
}
