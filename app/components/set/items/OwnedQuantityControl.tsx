'use client';

import {
  clampOwned,
  computeMissing,
} from '@/app/components/set/inventory-utils';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';

type Props = {
  required: number;
  owned: number;
  onChange: (next: number) => void;
  showMissing?: boolean;
};

export function OwnedQuantityControl({
  required,
  owned,
  onChange,
  showMissing = true,
}: Props) {
  const missing = computeMissing(required, owned);
  return (
    <div className="flex items-center gap-3">
      <Button
        variant="secondary"
        className="w-12 h-12 text-xl"
        onClick={() => onChange(clampOwned(owned - 1, required))}
        disabled={owned <= 0}
        aria-label="Decrease owned"
      >
        –
      </Button>
      <div className="flex flex-col items-center min-w-[120px]">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            className="w-16 text-center"
            value={owned}
            onChange={e => {
              const next = Number(e.target.value);
              onChange(clampOwned(Number.isFinite(next) ? next : 0, required));
            }}
            min={0}
            max={required}
            step={1}
          />
          <span className="tabular-nums text-sm">of {required}</span>
        </div>
        {showMissing && (
          <div className="text-[11px] text-gray-500">Missing {missing}</div>
        )}
      </div>
      <Button
        variant="secondary"
        className="w-12 h-12 text-xl"
        onClick={() => onChange(clampOwned(owned + 1, required))}
        disabled={owned >= required}
        aria-label="Increase owned"
      >
        +
      </Button>
    </div>
  );
}
