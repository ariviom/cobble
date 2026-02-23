'use client';

import { useEffect, useRef } from 'react';
import { cn } from './utils';

type ControlBarProps = {
  children: React.ReactNode;
  className?: string;
  /** Whether the bar sticks to the top on scroll. Default true. */
  sticky?: boolean;
  /** Ref to the inner flex container (used by useControlBarDropdown for click-outside). */
  containerRef?: React.RefObject<HTMLDivElement | null>;
};

/**
 * Shared control bar wrapper used on search, collection, and inventory pages.
 * Provides sticky positioning and sets the `--sticky-header-bottom` CSS variable
 * via ResizeObserver so `DropdownPanelFrame` bottom sheets position correctly.
 */
export function ControlBar({
  children,
  className,
  sticky = true,
  containerRef,
}: ControlBarProps) {
  const outerRef = useRef<HTMLDivElement>(null);

  // Measure sticky header bottom so DropdownPanelFrame positions correctly
  useEffect(() => {
    if (!sticky) return;
    const el = outerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const top = parseFloat(getComputedStyle(el).top) || 0;
      document.documentElement.style.setProperty(
        '--sticky-header-bottom',
        `${top + el.offsetHeight}px`
      );
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--sticky-header-bottom');
    };
  }, [sticky]);

  return (
    <div
      ref={outerRef}
      className={cn(
        'z-40 bg-background',
        sticky && 'sticky top-0 lg:top-[var(--spacing-nav-offset)]',
        className
      )}
    >
      <div
        ref={containerRef}
        className="relative container-wide flex h-controls-height w-full flex-nowrap items-center gap-2 overflow-x-auto border-b border-subtle bg-card-muted no-scrollbar lg:overflow-visible"
      >
        {children}
      </div>
    </div>
  );
}
