'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from './utils';

const inputVariants = cva(
  'border border-border-subtle rounded-md bg-card px-2 py-1 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
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

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants>;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, size, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
});
