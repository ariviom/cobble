'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ChevronDown } from 'lucide-react';
import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from './utils';

const selectVariants = cva(
  // Base: Chunky borders matching Input, custom chevron
  // min-w-0 allows shrinking in flex containers on mobile
  'w-full min-w-0 border-2 border-subtle rounded-md bg-card px-4 pr-10 text-foreground font-medium transition-all duration-150 cursor-pointer appearance-none focus:outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background-muted',
  {
    variants: {
      size: {
        sm: 'h-9 text-sm px-3 pr-8',
        md: 'h-11 text-base',
        lg: 'h-13 text-lg px-5 pr-12',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

const iconSizeMap = {
  sm: 'h-4 w-4 right-2',
  md: 'h-4 w-4 right-3',
  lg: 'h-5 w-5 right-4',
};

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> &
  VariantProps<typeof selectVariants>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className, size = 'md', ...props },
  ref
) {
  const iconSize = iconSizeMap[size ?? 'md'];

  return (
    <div className="relative w-full min-w-0">
      <select
        ref={ref}
        className={cn(selectVariants({ size }), className)}
        {...props}
      />
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-foreground-muted',
          iconSize
        )}
        aria-hidden="true"
      />
    </div>
  );
});
