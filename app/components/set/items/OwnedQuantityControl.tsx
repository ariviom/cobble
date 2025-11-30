'use client';

import { clampOwned } from '@/app/components/set/inventory-utils';
import { cn } from '@/app/components/ui/utils';

type Props = {
  required: number;
  owned: number;
  onChange: (next: number) => void;
  className?: string;
};

type ButtonProps = {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  ariaLabel: string;
  className?: string;
};

function Button({
  children,
  onClick,
  disabled,
  ariaLabel,
  className,
}: ButtonProps) {
  return (
    <button
      className={cn(
        'relative flex h-12 w-12 cursor-pointer items-center justify-center text-2xl font-bold disabled:cursor-not-allowed',
        className,
        'text-foreground disabled:text-foreground-muted'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

export function OwnedQuantityControl({
  required,
  owned,
  onChange,
  className,
}: Props) {
  return (
    <div
      className={`flex h-12 w-full min-w-min shrink justify-between rounded-lg border border-subtle list:sm:max-w-min grid:w-full ${className ?? ''}`}
    >
      <Button
        onClick={() => onChange(clampOwned(owned - 1, required))}
        disabled={owned <= 0}
        ariaLabel="Decrease owned"
      >
        –
      </Button>
      <div
        className={`relative items-center text-sm ${required > 99 ? 'min-w-20' : 'min-w-14'}`}
      >
        <input
          type="number"
          name="piece-count"
          // className={`hide-arrows h-full w-full pr-[calc(50%+5px)] text-right ${owned === required ? 'border-x border-white font-bold' : ''}`}
          className={`hide-arrows flex h-full w-full text-center font-medium ${owned === required ? 'border-x border-white font-bold' : ''}`}
          value={owned}
          onChange={e => {
            const next = Number(e.target.value);
            onChange(clampOwned(Number.isFinite(next) ? next : 0, required));
          }}
          min={0}
          max={required}
          step={1}
        />
      </div>
      <Button
        onClick={() => onChange(clampOwned(owned + 1, required))}
        disabled={owned >= required}
        ariaLabel="Increase owned"
      >
        +
      </Button>
    </div>
  );
}
