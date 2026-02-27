'use client';

import { useCallback, useRef, type ChangeEvent } from 'react';
import { cn } from './utils';

type DualRangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatLabel?: (value: number) => string;
  className?: string;
};

export function DualRangeSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  formatLabel,
  className,
}: DualRangeSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const range = max - min || 1;
  const leftPercent = ((value[0] - min) / range) * 100;
  const rightPercent = ((value[1] - min) / range) * 100;

  const handleMinChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      // Prevent min handle from exceeding max handle
      onChange([Math.min(next, value[1]), value[1]]);
    },
    [onChange, value]
  );

  const handleMaxChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      // Prevent max handle from going below min handle
      onChange([value[0], Math.max(next, value[0])]);
    },
    [onChange, value]
  );

  const labelMin = formatLabel ? formatLabel(value[0]) : String(value[0]);
  const labelMax = formatLabel ? formatLabel(value[1]) : String(value[1]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Slider track area */}
      <div ref={containerRef} className="relative h-8 w-full">
        {/* Inactive track (full width background) */}
        <div className="absolute top-1/2 right-0 left-0 h-2 -translate-y-1/2 rounded-full bg-background-muted" />

        {/* Active track (highlighted segment between thumbs) */}
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-theme-primary"
          style={{
            left: `${leftPercent}%`,
            right: `${100 - rightPercent}%`,
          }}
        />

        {/* Min range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0]}
          onChange={handleMinChange}
          aria-label="Minimum value"
          className="dual-range-thumb absolute top-0 left-0 h-full w-full appearance-none bg-transparent outline-none"
          style={{ zIndex: value[0] > max - step ? 3 : 1 }}
        />

        {/* Max range input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[1]}
          onChange={handleMaxChange}
          aria-label="Maximum value"
          className="dual-range-thumb absolute top-0 left-0 h-full w-full appearance-none bg-transparent outline-none"
          style={{ zIndex: 2 }}
        />
      </div>

      {/* Value labels */}
      <div className="flex justify-between text-xs font-medium text-foreground-muted">
        <span>{labelMin}</span>
        <span>{labelMax}</span>
      </div>

      {/* Scoped styles for range input pseudo-elements */}
      <style>{`
        .dual-range-thumb {
          pointer-events: none;
        }
        .dual-range-thumb::-webkit-slider-runnable-track {
          -webkit-appearance: none;
          height: 0;
        }
        .dual-range-thumb::-moz-range-track {
          height: 0;
          background: transparent;
          border: none;
        }
        .dual-range-thumb::-webkit-slider-thumb {
          -webkit-appearance: none;
          pointer-events: auto;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--color-theme-primary);
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          cursor: grab;
          position: relative;
        }
        .dual-range-thumb::-moz-range-thumb {
          pointer-events: auto;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--color-theme-primary);
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          cursor: grab;
        }
        .dual-range-thumb:active::-webkit-slider-thumb {
          cursor: grabbing;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        .dual-range-thumb:active::-moz-range-thumb {
          cursor: grabbing;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }
        .dual-range-thumb:focus-visible::-webkit-slider-thumb {
          outline: 2px solid var(--color-theme-primary);
          outline-offset: 2px;
        }
        .dual-range-thumb:focus-visible::-moz-range-thumb {
          outline: 2px solid var(--color-theme-primary);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
