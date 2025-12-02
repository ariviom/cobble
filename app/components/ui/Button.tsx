'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md border cursor-pointer text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      variant: {
        primary:
          'bg-theme-primary text-theme-primary-contrast border-theme-primary hover:bg-theme-primary/90',
        secondary: 'bg-card text-foreground border-subtle hover:bg-card-muted',
        google: 'bg-card-muted text-foreground border-subtle hover:bg-card',
        ghost:
          'bg-transparent text-foreground border-transparent hover:bg-background-muted',
        outline:
          'bg-transparent text-foreground border-subtle hover:bg-card-muted',
        destructive:
          'bg-danger text-neutral-00 border-danger hover:bg-danger/90',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-5 py-2.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  }
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
