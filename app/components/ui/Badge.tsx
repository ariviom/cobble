'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { cn } from './utils';

const badgeVariants = cva(
  // Base: Bold, chunky badges like LEGO studs
  'inline-flex items-center justify-center font-bold uppercase tracking-wide transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-200',
        // Primary yellow uses accessible dark text
        primary: 'bg-brand-yellow text-on-yellow',
        accent: 'bg-theme-primary text-white',
        // Semantic colors - all use white text on colored backgrounds
        success: 'bg-brand-green text-white',
        warning: 'bg-brand-orange text-white',
        error: 'bg-brand-red text-white',
        info: 'bg-brand-blue text-white',
        // Outline with chunky border
        outline: 'bg-transparent border-2 border-subtle text-foreground',
        muted:
          'bg-background-muted text-foreground-muted dark:bg-neutral-800 dark:text-neutral-300',
      },
      size: {
        sm: 'text-[10px] px-2 py-0.5 rounded-sm',
        md: 'text-xs px-2.5 py-1 rounded-sm',
        lg: 'text-sm px-3 py-1.5 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export type BadgeProps = PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>
>;

export function Badge({
  variant,
  size,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...rest}>
      {children}
    </span>
  );
}
