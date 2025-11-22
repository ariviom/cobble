'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from './utils';

const selectVariants = cva(
  'border border-neutral-200 rounded px-2 py-1 text-sm bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black',
  {
    variants: {
      size: {
        sm: 'text-sm',
        md: 'text-sm',
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
