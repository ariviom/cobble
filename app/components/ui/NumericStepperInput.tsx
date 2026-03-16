'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/app/components/ui/utils';

type NumericStepperInputProps = {
  value: number;
  onChange: (next: number) => void;
  clamp: (n: number) => number;
  min?: number;
  max?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** Extra classes applied to the text input element. */
  inputClassName?: string | undefined;
  /** Extra classes applied to each stepper button. */
  buttonClassName?: string | undefined;
  /** Optional element rendered between the decrease button and the input. */
  beforeInput?: React.ReactNode;
};

export function NumericStepperInput({
  value,
  onChange,
  clamp,
  min = 0,
  max,
  disabled,
  ariaLabel = 'Quantity',
  className,
  inputClassName,
  buttonClassName,
  beforeInput,
}: NumericStepperInputProps) {
  const [inputValue, setInputValue] = useState<string>(() => String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setInputValue(String(value));
    }
  }, [value, isFocused]);

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>): void {
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
    onChange(clamp(parsed));
  }

  function handleBlur(): void {
    const parsed =
      inputValue === '' || !/^\d+$/.test(inputValue)
        ? 0
        : Number.parseInt(inputValue, 10);
    const clamped = clamp(parsed);

    if (clamped !== value) {
      onChange(clamped);
    }

    setInputValue(String(clamped));
    setIsFocused(false);
  }

  const atMin = value <= min;
  const atMax = max != null && value >= max;

  return (
    <div
      className={cn(
        'flex h-[52px] w-full min-w-min shrink items-center rounded-md border border-subtle',
        className
      )}
    >
      <button
        type="button"
        className={cn(
          'relative flex size-12 shrink-0 cursor-pointer items-center justify-center text-2xl font-bold',
          'text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted',
          buttonClassName
        )}
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled ?? atMin}
        aria-label="Decrease"
      >
        –
      </button>
      {beforeInput}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className={cn(
          'hide-arrows h-full w-full text-center text-sm font-medium',
          inputClassName
        )}
        value={inputValue}
        onFocus={event => {
          setIsFocused(true);
          event.target.select();
        }}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className={cn(
          'relative flex size-12 shrink-0 cursor-pointer items-center justify-center text-2xl font-bold',
          'text-foreground disabled:cursor-not-allowed disabled:text-foreground-muted',
          buttonClassName
        )}
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled ?? atMax}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
