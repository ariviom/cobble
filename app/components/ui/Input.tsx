'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from './utils';

const inputVariants = cva('border rounded px-2 py-1 text-sm', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-sm',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

type Props = InputHTMLAttributes<HTMLInputElement> &
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
