'use client';

import { useCallback } from 'react';

import { clampOwned } from '@/app/components/set/inventory-utils';
import { NumericStepperInput } from '@/app/components/ui/NumericStepperInput';
import { cn } from '@/app/components/ui/utils';

type Props = {
  required: number;
  owned: number;
  onChange: (next: number) => void;
  className?: string;
};

export function OwnedQuantityControl({
  required,
  owned,
  onChange,
  className,
}: Props) {
  const clamp = useCallback((n: number) => clampOwned(n, required), [required]);

  return (
    <NumericStepperInput
      value={owned}
      onChange={onChange}
      clamp={clamp}
      min={0}
      max={required}
      className={cn(
        'list:sm:max-w-min grid:w-full micro:h-11 micro:w-full micro:min-w-0',
        className
      )}
      buttonClassName="micro:h-11 micro:min-w-0 micro:text-lg"
      beforeInput={
        <div className="hidden h-full border-l border-subtle micro:block" />
      }
      inputClassName={cn(
        'micro:hidden',
        owned === required ? 'border-x border-subtle font-bold' : undefined
      )}
      ariaLabel="Owned quantity"
    />
  );
}
