'use client';

import { cx } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';

export type TabDef = { key: string; label: string };

type Props = {
  tabs: TabDef[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
};

type ArrowButtonProps = {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
};

function TabsArrowButton({ side, disabled, onClick }: ArrowButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'absolute top-1/2 z-10 h-full w-8 -translate-y-1/2 border bg-background text-foreground-muted shadow-sm disabled:opacity-30',
        side === 'left' ? 'left-0' : 'right-0',
        disabled ? 'pointer-events-none' : ''
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Scroll tabs left' : 'Scroll tabs right'}
    >
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

export function InventoryFilterTabs({
  tabs,
  value,
  onChange,
  className,
}: Props) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
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

  // Ensure selected tab is visible when value changes
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const idx = tabs.findIndex(t => t.key === value);
    if (idx < 0) return;
    const tabEl = el.querySelector<HTMLButtonElement>(
      `[data-key="${CSS.escape(value)}"]`
    );
    if (!tabEl) return;
    const { left, right } = tabEl.getBoundingClientRect();
    const { left: elLeft, right: elRight } = el.getBoundingClientRect();
    if (left < elLeft)
      el.scrollBy({ left: left - elLeft - 16, behavior: 'smooth' });
    else if (right > elRight)
      el.scrollBy({ left: right - elRight + 16, behavior: 'smooth' });
  }, [value, tabs]);

  return (
    <div
      className={cx('relative flex items-center overflow-hidden', className)}
    >
      <TabsArrowButton
        side="left"
        disabled={!canScrollLeft}
        onClick={() => scrollByAmount('left')}
      />
      <div
        ref={listRef}
        className={cx(
          'flex w-full overflow-x-auto scroll-smooth px-8 whitespace-nowrap no-scrollbar'
        )}
        role="tablist"
        aria-label="Inventory filters"
      >
        {tabs.map(t => (
          <button
            key={t.key}
            data-key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === value}
            className={cx(
              'relative -ml-px h-9 rounded-none border px-3 text-sm leading-9 first:ml-0',
              t.key === value
                ? 'border-theme-primary bg-theme-primary text-theme-primary-contrast'
                : 'bg-background text-foreground hover:bg-background-muted'
            )}
            onClick={() => onChange(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <TabsArrowButton
        side="right"
        disabled={!canScrollRight}
        onClick={() => scrollByAmount('right')}
      />
    </div>
  );
}
