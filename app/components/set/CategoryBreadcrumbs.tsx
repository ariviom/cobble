'use client';

import { cx } from 'class-variance-authority';

export type Crumb = { key: string; label: string };

type Props = {
  path: Crumb[];
  onNavigate: (key: string) => void;
  className?: string;
};

export function CategoryBreadcrumbs({ path, onNavigate, className }: Props) {
  const last = path[path.length - 1]?.key;
  return (
    <nav
      className={cx('flex items-center gap-2 text-sm', className)}
      aria-label="Categories"
    >
      {path.map((c, idx) => (
        <span key={c.key} className="flex items-center gap-2">
          <button
            type="button"
            className={cx(
              'rounded px-1.5 py-0.5 hover:bg-neutral-100',
              c.key === last
                ? 'font-semibold text-foreground'
                : 'text-foreground-muted'
            )}
            aria-current={c.key === last ? 'page' : undefined}
            onClick={() => onNavigate(c.key)}
          >
            {c.label}
          </button>
          {idx < path.length - 1 ? (
            <span className="text-foreground-muted">›</span>
          ) : null}
        </span>
      ))}
    </nav>
  );
}
