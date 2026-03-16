'use client';

import { cn } from '@/app/components/ui/utils';
import { useEffect, useState } from 'react';

const MAX_LOOSE = 99999;

export function LooseQuantityControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [inputValue, setInputValue] = useState<string>(() => String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value));
    }
  }, [value, isFocused]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (raw === '') {
      setInputValue('');
      return;
    }
    if (!/^\d+$/.test(raw)) return;

    setInputValue(raw);
    const parsed = Number.parseInt(raw, 10);
    onChange(Math.min(parsed, MAX_LOOSE));
  };

  const handleBlur = () => {
    const parsed =
      inputValue === '' || !/^\d+$/.test(inputValue)
        ? 0
        : Number.parseInt(inputValue, 10);
    const clamped = Math.max(0, Math.min(parsed, MAX_LOOSE));
    if (clamped !== value) onChange(clamped);
    setInputValue(String(clamped));
    setIsFocused(false);
  };

  return (
    <div className="flex h-12 w-full items-center rounded-md border border-subtle">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        aria-label="Decrease loose quantity"
        className={cn(
          'flex size-12 shrink-0 items-center justify-center text-2xl font-bold',
          'text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted'
        )}
      >
        –
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label="Loose quantity"
        className="hide-arrows h-full w-full border-x border-subtle text-center text-sm font-medium"
        value={inputValue}
        onFocus={e => {
          setIsFocused(true);
          e.target.select();
        }}
        onChange={handleInputChange}
        onBlur={handleBlur}
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(value + 1, MAX_LOOSE))}
        disabled={value >= MAX_LOOSE}
        aria-label="Increase loose quantity"
        className={cn(
          'flex size-12 shrink-0 items-center justify-center text-2xl font-bold',
          'text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted'
        )}
      >
        +
      </button>
    </div>
  );
}
