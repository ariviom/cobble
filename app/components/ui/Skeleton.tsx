'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from './utils';

const skeletonVariants = cva(
  'animate-pulse bg-neutral-200 dark:bg-neutral-700',
  {
    variants: {
      variant: {
        text: 'h-4 rounded-sm',
        heading: 'h-8 rounded-md',
        avatar: 'rounded-full',
        card: 'rounded-lg',
        image: 'rounded-md',
        button: 'h-9 rounded-md',
      },
      size: {
        sm: '',
        md: '',
        lg: '',
        full: 'w-full',
      },
    },
    compoundVariants: [
      { variant: 'avatar', size: 'sm', className: 'h-8 w-8' },
      { variant: 'avatar', size: 'md', className: 'h-10 w-10' },
      { variant: 'avatar', size: 'lg', className: 'h-12 w-12' },
      { variant: 'card', size: 'sm', className: 'h-24' },
      { variant: 'card', size: 'md', className: 'h-32' },
      { variant: 'card', size: 'lg', className: 'h-48' },
      { variant: 'image', size: 'sm', className: 'h-16 w-16' },
      { variant: 'image', size: 'md', className: 'h-24 w-24' },
      { variant: 'image', size: 'lg', className: 'h-32 w-32' },
    ],
    defaultVariants: {
      variant: 'text',
      size: 'full',
    },
  }
);

export type SkeletonProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>;

export function Skeleton({ variant, size, className, ...rest }: SkeletonProps) {
  return (
    <div
      className={cn(skeletonVariants({ variant, size }), className)}
      {...rest}
    />
  );
}

// Convenience components for common skeleton patterns
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={i === lines - 1 ? 'w-2/3' : 'w-full'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border-2 border-subtle bg-card p-4',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="avatar" size="md" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" className="w-1/2" />
          <Skeleton variant="text" className="w-1/3" />
        </div>
      </div>
      <Skeleton variant="text" className="w-full" />
      <Skeleton variant="text" className="w-4/5" />
    </div>
  );
}
