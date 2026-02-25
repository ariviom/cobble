'use client';

import { useEffect, useState } from 'react';

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
        'relative flex size-12 min-w-10 cursor-pointer items-center justify-center text-2xl font-bold disabled:cursor-not-allowed',
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
  const [inputValue, setInputValue] = useState<string>(() => String(owned));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(owned));
    }
  }, [owned, isFocused]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;

    if (raw === '') {
      setInputValue('');
      return;
    }

    if (!/^\d+$/.test(raw)) {
      return;
    }

    setInputValue(raw);

    const parsed = Number.parseInt(raw, 10);
    const clamped = clampOwned(parsed, required);
    onChange(clamped);
  };

  const handleBlur = () => {
    const parsed =
      inputValue === '' || !/^\d+$/.test(inputValue)
        ? 0
        : Number.parseInt(inputValue, 10);
    const clamped = clampOwned(parsed, required);

    if (clamped !== owned) {
      onChange(clamped);
    }

    setInputValue(String(clamped));
    setIsFocused(false);
  };

  return (
    <div
      className={cn(
        'flex h-[52px] w-full min-w-min shrink items-center justify-between rounded-md border border-subtle list:sm:max-w-min grid:w-full micro:h-11 micro:w-full micro:min-w-0',
        className
      )}
    >
      <Button
        onClick={() => onChange(clampOwned(owned - 1, required))}
        disabled={owned <= 0}
        ariaLabel="Decrease owned"
        className="micro:h-11 micro:min-w-0 micro:text-lg"
      >
        –
      </Button>
      <div className="hidden h-full border-l border-subtle micro:block" />
      <input
        type="text"
        name="piece-count"
        inputMode="numeric"
        pattern="[0-9]*"
        className={cn(
          'hide-arrows relative flex h-full w-full items-center text-center text-xs font-medium xs:text-sm micro:hidden',
          owned === required && 'border-x border-subtle font-bold'
        )}
        value={inputValue}
        onFocus={event => {
          setIsFocused(true);
          event.target.select();
        }}
        onChange={handleInputChange}
        onBlur={handleBlur}
        aria-label="Owned quantity"
      />
      <Button
        onClick={() => onChange(clampOwned(owned + 1, required))}
        disabled={owned >= required}
        ariaLabel="Increase owned"
        className="micro:h-11 micro:min-w-0 micro:text-lg"
      >
        +
      </Button>
    </div>
  );
}
