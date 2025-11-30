'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from './utils';

const selectVariants = cva(
  'border border-subtle rounded-md bg-card px-2 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      size: {
        sm: 'h-8 text-xs',
        md: 'h-9 text-sm',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

type Props = SelectHTMLAttributes<HTMLSelectElement> &
  VariantProps<typeof selectVariants>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className, size, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(selectVariants({ size }), className)}
      {...props}
    />
  );
});
