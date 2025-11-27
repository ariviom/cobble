'use client';

import { cx } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';

type Props = {
  parents: string[];
  subcategoriesByParent: Map<string, string[]>;
  filter:
    | { kind: 'all' }
    | { kind: 'parent'; parent: string }
    | { kind: 'category'; parent: string; category: string };
  onSelectAll: () => void;
  onSelectParent: (parent: string) => void;
  onSelectCategory: (parent: string, category: string) => void;
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
      className={cx(
        'absolute top-1/2 z-10 h-full w-8 -translate-y-1/2 border bg-background text-foreground-muted shadow-sm disabled:opacity-30',
        side === 'left' ? 'left-0' : 'right-0',
        disabled ? 'pointer-events-none' : ''
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
    >
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

export function CategoryRail({
  parents,
  subcategoriesByParent,
  filter,
  onSelectAll,
  onSelectParent,
  onSelectCategory,
  className,
}: Props) {
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

  // Build items based on filter
  const items: Array<{
    key: string;
    label: string;
    selected: boolean;
    onClick: () => void;
  }> = [];
  // Global All
  items.push({
    key: 'all',
    label: 'All',
    selected: filter.kind === 'all',
    onClick: onSelectAll,
  });

  if (filter.kind === 'all') {
    for (const p of parents) {
      items.push({
        key: `parent:${p}`,
        label: p,
        selected: false,
        onClick: () => onSelectParent(p),
      });
    }
  } else if (filter.kind === 'parent') {
    const p = filter.parent;
    // Show only the selected parent and its subcategories
    items.push({
      key: `parent:${p}`,
      label: p,
      selected: true,
      onClick: () => onSelectParent(p),
    });
    const subs = subcategoriesByParent.get(p) ?? [];
    for (const c of subs) {
      items.push({
        key: `category:${c}`,
        label: c,
        selected: false,
        onClick: () => onSelectCategory(p, c),
      });
    }
  } else if (filter.kind === 'category') {
    const p = filter.parent;
    const cSel = filter.category;
    items.push({
      key: `parent:${p}`,
      label: p,
      selected: false,
      onClick: () => onSelectParent(p),
    });
    const subs = subcategoriesByParent.get(p) ?? [];
    for (const c of subs) {
      items.push({
        key: `category:${c}`,
        label: c,
        selected: c === cSel,
        onClick: () => onSelectCategory(p, c),
      });
    }
  }

  return (
    <div
      className={cx('relative flex items-center overflow-hidden', className)}
    >
      {hasOverflow && (
        <ArrowButton
          side="left"
          disabled={!canScrollLeft}
          onClick={() => scrollByAmount('left')}
        />
      )}
      <div
        ref={listRef}
        className={cx(
          'no-scrollbar flex w-full overflow-x-auto scroll-smooth whitespace-nowrap',
          hasOverflow ? 'px-8' : 'px-0'
        )}
        role="tablist"
        aria-label="Categories"
      >
        {items.map(it => (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={it.selected}
            className={cx(
              'relative -ml-px h-9 rounded-none border px-3 text-sm leading-9 first:ml-0',
              it.selected
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'bg-background text-foreground hover:bg-background-muted'
            )}
            onClick={it.onClick}
          >
            {it.label}
          </button>
        ))}
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
