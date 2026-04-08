'use client';

import { useCallback } from 'react';

import { NumericStepperInput } from '@/app/components/ui/NumericStepperInput';

const MAX_LOOSE = 99999;

function clampLoose(n: number): number {
  return Math.max(0, Math.min(n, MAX_LOOSE));
}

export function LooseQuantityControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const clamp = useCallback((n: number) => clampLoose(n), []);

  return (
    <NumericStepperInput
      value={value}
      onChange={onChange}
      clamp={clamp}
      min={0}
      max={MAX_LOOSE}
      className="h-12"
      inputClassName="border-x border-subtle"
      ariaLabel="Spare quantity"
    />
  );
}
