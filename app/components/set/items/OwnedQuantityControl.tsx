'use client';

import { clampOwned } from '@/app/components/set/inventory-utils';
import { cx } from '@/app/components/ui/utils';

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
  incraseOrDecrase: 'increase' | 'decrease';
};

function Button({
  children,
  onClick,
  disabled,
  ariaLabel,
  incraseOrDecrase,
  className,
}: ButtonProps) {
  return (
    <button
      className={cx(
        'relative h-8 w-8 cursor-pointer rounded-full text-2xl font-bold disabled:cursor-not-allowed',
        className,
        'text-foreground disabled:text-neutral-300'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span
        className="absolute top-1/2 left-1/2 size-[max(100%,2.75rem)] -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"
        aria-hidden="true"
      />
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
      className={`flex h-10 max-w-max min-w-min shrink justify-end rounded-lg border border-neutral-200 grid:w-full grid:justify-between ${className ?? ''} `}
    >
      <Button
        onClick={() => onChange(clampOwned(owned - 1, required))}
        disabled={owned <= 0}
        ariaLabel="Decrease owned"
        incraseOrDecrase="decrease"
        className={owned === required ? '!bg-brand-green text-white' : ''}
      >
        –
      </Button>
      <div
        className={`relative items-center text-sm ${owned === required ? 'text-brand-green' : ''} ${required > 99 ? 'min-w-20' : 'min-w-16'}`}
      >
        <input
          type="number"
          name="piece-count"
          className={`hide-arrows h-full w-full pr-[calc(50%+5px)] text-right ${owned === required ? 'border-x border-white font-bold' : ''}`}
          value={owned}
          onChange={e => {
            const next = Number(e.target.value);
            onChange(clampOwned(Number.isFinite(next) ? next : 0, required));
          }}
          min={0}
          max={required}
          step={1}
        />
        <span className="pointer-events-none absolute top-1/2 right-[calc(50%+5px)] translate-x-full -translate-y-1/2 pl-1 font-bold whitespace-nowrap tabular-nums">
          / {required}
        </span>
      </div>
      <Button
        onClick={() => onChange(clampOwned(owned + 1, required))}
        disabled={owned >= required}
        ariaLabel="Increase owned"
        incraseOrDecrase="increase"
      >
        +
      </Button>
    </div>
  );
}
