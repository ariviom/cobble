'use client';

import { cn } from '@/app/components/ui/utils';
import type { ChangeEvent } from 'react';

type QuantityDropdownProps = {
  value: number;
  onChange: (next: number) => void;
  /**
   * Maximum selectable quantity (inclusive). Defaults to 10.
   */
  max?: number;
  /**
   * Size variant. Use 'md' to match StatusToggleButton sizing.
   */
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

const sizeStyles = {
  sm: 'min-w-12 px-2 py-1 text-xs',
  md: 'min-w-14 px-3 py-2 text-sm font-medium',
};

export function QuantityDropdown({
  value,
  onChange,
  max = 10,
  size = 'sm',
  disabled,
  className,
  'aria-label': ariaLabel,
}: QuantityDropdownProps) {
  const normalizedMax = Number.isFinite(max) && max > 0 ? max : 10;
  const options: number[] = [];
  for (let i = 0; i <= normalizedMax; i += 1) {
    options.push(i);
  }

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = Number(event.target.value);
    onChange(Number.isFinite(next) && next >= 0 ? next : 0);
  };

  return (
    <select
      className={cn(
        'inline-flex rounded-md border-2 border-subtle bg-card transition-colors hover:border-strong',
        sizeStyles[size],
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      value={Number.isFinite(value) && value >= 0 ? value : 0}
      onChange={handleChange}
      disabled={disabled}
      aria-label={ariaLabel ?? 'Quantity'}
    >
      {options.map(option => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
