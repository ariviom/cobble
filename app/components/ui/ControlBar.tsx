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

  // Measure sticky header bottom so DropdownPanelFrame positions correctly.
  // Uses getBoundingClientRect for the actual visual position (accounts for
  // the bar not yet being stuck at the top before scrolling).
  useEffect(() => {
    if (!sticky) return;
    const el = outerRef.current;
    if (!el) return;

    const update = () => {
      const bottom = el.getBoundingClientRect().bottom;
      document.documentElement.style.setProperty(
        '--sticky-header-bottom',
        `${bottom}px`
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('scroll', update, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', update);
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
      <div className="h-controls-height border-b border-subtle bg-card-muted">
        <div
          ref={containerRef}
          className="relative container-wide flex h-full w-full flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar"
        >
          {children}
        </div>
      </div>
    </div>
  );
}
