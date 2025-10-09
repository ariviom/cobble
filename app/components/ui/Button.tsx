'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cx } from './utils';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant = 'secondary', size = 'md', ...props },
  ref
) {
  const base =
    'border rounded inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
  const byVariant: Record<Variant, string> = {
    primary: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    secondary: 'bg-white text-gray-900 border-gray-300 hover:bg-gray-50',
    ghost: 'bg-transparent text-gray-900 border-transparent hover:bg-gray-50',
  };
  const bySize: Record<Size, string> = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-sm',
  };
  return (
    <button
      ref={ref}
      className={cx(base, byVariant[variant], bySize[size], className)}
      {...props}
    />
  );
});
