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
        'relative flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center text-2xl font-bold disabled:cursor-not-allowed',
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
      className={`flex h-[52px] w-full min-w-min shrink items-center justify-between rounded-lg border-2 border-subtle list:sm:max-w-min grid:w-full ${className ?? ''}`}
    >
      <Button
        onClick={() => onChange(clampOwned(owned - 1, required))}
        disabled={owned <= 0}
        ariaLabel="Decrease owned"
      >
        –
      </Button>
      <div
        className={`relative items-center text-xs xs:text-sm ${required > 99 ? 'xs:min-w-20' : 'xs:min-w-14'}`}
      >
        <input
          type="text"
          name="piece-count"
          inputMode="numeric"
          pattern="[0-9]*"
          className={`hide-arrows flex h-full w-full text-center font-medium ${owned === required ? 'border-x border-white font-bold' : ''}`}
          value={inputValue}
          onFocus={event => {
            setIsFocused(true);
            event.target.select();
          }}
          onChange={handleInputChange}
          onBlur={handleBlur}
          aria-label="Owned quantity"
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
