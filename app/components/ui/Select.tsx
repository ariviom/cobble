'use client';

import { forwardRef, SelectHTMLAttributes } from 'react';
import { cx } from './utils';

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className, ...props },
  ref
) {
  const base =
    'border border-neutral-200 rounded px-2 py-1 text-sm bg-background text-foreground';
  return <select ref={ref} className={cx(base, className)} {...props} />;
});
