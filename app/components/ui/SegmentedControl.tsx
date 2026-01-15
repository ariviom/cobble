'use client';

import { cx } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';

export type Segment = { key: string; label: string };

type Props = {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  size?: 'sm' | 'md';
};

export function SegmentedControl({
  segments,
  value,
  onChange,
  className,
  size = 'md',
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [thumbStyle, setThumbStyle] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const selected = el.querySelector<HTMLButtonElement>(
      `[data-key="${CSS.escape(value)}"]`
    );
    if (!selected) return;
    const cRect = el.getBoundingClientRect();
    const sRect = selected.getBoundingClientRect();
    setThumbStyle({ left: sRect.left - cRect.left, width: sRect.width });
  }, [value, segments]);

  return (
    <div
      ref={containerRef}
      className={cx(
        'relative inline-flex items-center rounded-[var(--radius-md)] border-2 border-subtle bg-card p-0.5',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className
      )}
      role="tablist"
    >
      {thumbStyle && (
        <div
          className="pointer-events-none absolute top-0.5 bottom-0.5 rounded bg-card-muted transition-all"
          style={{ left: thumbStyle.left, width: thumbStyle.width }}
          aria-hidden="true"
        />
      )}
      {segments.map(seg => (
        <button
          key={seg.key}
          data-key={seg.key}
          type="button"
          role="tab"
          aria-selected={seg.key === value}
          className={cx(
            'relative z-10 rounded-[var(--radius-sm)] px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            seg.key === value
              ? 'text-foreground'
              : 'text-foreground-muted hover:text-foreground'
          )}
          onClick={() => onChange(seg.key)}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}
