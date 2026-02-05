'use client';

import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from './utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { className, ...props },
  ref
) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-subtle bg-card checked:border-theme-primary checked:bg-theme-primary focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        {...props}
      />
      <svg
        className="pointer-events-none absolute top-0 left-0 h-4 w-4 opacity-0 peer-checked:opacity-100"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 5L6.5 10.5L4 8"
          stroke="var(--color-theme-primary-contrast)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
});
