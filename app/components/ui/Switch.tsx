'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './utils';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  /** Text label to show next to the switch */
  label?: string;
};

export const Switch = forwardRef<HTMLInputElement, Props>(function Switch(
  { className, label, checked, disabled, ...props },
  ref
) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <span className="relative">
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="sr-only"
          {...props}
        />
        <span
          className={cn(
            'block h-6 w-11 rounded-full border transition-colors duration-150',
            checked
              ? 'border-theme-primary bg-theme-primary'
              : 'border-subtle bg-background-muted'
          )}
        />
        <span
          className={cn(
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform duration-150',
            checked && 'translate-x-5'
          )}
        />
      </span>
      {label && (
        <span className="text-sm font-medium text-foreground">{label}</span>
      )}
    </label>
  );
});
