'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from './utils';

const inputVariants = cva(
  // Base: Chunky borders, tactile feel matching buttons
  'w-full border-2 border-subtle rounded-[var(--radius-md)] bg-card px-4 text-foreground font-medium transition-all duration-150 placeholder:text-foreground-muted/50 focus:outline-none focus:border-theme-primary focus:ring-2 focus:ring-theme-primary/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-background-muted',
  {
    variants: {
      size: {
        sm: 'h-9 text-sm px-3',
        md: 'h-11 text-base',
        lg: 'h-13 text-lg px-5',
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
