'use client';

import { forwardRef, InputHTMLAttributes } from 'react';
import { cx } from './utils';

type Props = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, ...props },
  ref
) {
  const base = 'border rounded px-2 py-1 text-sm';
  return <input ref={ref} className={cx(base, className)} {...props} />;
});
