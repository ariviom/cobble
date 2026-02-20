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
        'relative inline-flex items-center overflow-hidden rounded-xl border border-subtle bg-card-muted',
        size === 'sm' ? 'h-9 text-sm' : 'h-11 text-base',
        className
      )}
      role="tablist"
    >
      {/* Sliding thumb - theme color background */}
      {thumbStyle && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 bg-theme-primary transition-all duration-150"
          style={{ left: thumbStyle.left - 2, width: thumbStyle.width + 4 }}
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
            'relative z-10 flex-1 rounded-sm px-3 text-center font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card-muted',
            size === 'sm' ? 'py-1' : 'py-1.5',
            seg.key === value
              ? 'text-theme-primary-contrast'
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
