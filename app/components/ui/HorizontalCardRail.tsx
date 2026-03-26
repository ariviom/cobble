'use client';

import { cn } from '@/app/components/ui/utils';
import { useScrollableRail } from '@/app/hooks/useScrollableRail';
import type { ReactNode } from 'react';

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
  const { ref, canScrollLeft, canScrollRight, hasOverflow, scrollBy } =
    useScrollableRail();

  return (
    <div className={cn('relative', className)}>
      {hasOverflow && (
        <ArrowButton
          side="left"
          disabled={!canScrollLeft}
          onClick={() => scrollBy('left')}
        />
      )}
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-visible scroll-smooth py-1 no-scrollbar"
      >
        {children}
      </div>
      {hasOverflow && (
        <ArrowButton
          side="right"
          disabled={!canScrollRight}
          onClick={() => scrollBy('right')}
        />
      )}
      {/* Fade overlays for clipped cards — desktop only */}
      {canScrollLeft && (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] hidden w-20 bg-gradient-to-r from-background to-transparent lg:block" />
      )}
      {canScrollRight && (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] hidden w-20 bg-gradient-to-l from-background to-transparent lg:block" />
      )}
    </div>
  );
}
