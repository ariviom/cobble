'use client';

import { cn } from '@/app/components/ui/utils';
import { Check } from 'lucide-react';

export const COLOR_SLOTS = [
  { slot: 1, name: 'Red', color: '#CA1F08' },
  { slot: 8, name: 'Yellow', color: '#F3C305' },
  { slot: 2, name: 'Blue', color: '#0055BF' },
  { slot: 3, name: 'Green', color: '#4B9F4A' },
  { slot: 4, name: 'Purple', color: '#9391E4' },
  { slot: 5, name: 'Orange', color: '#FFA70B' },
  { slot: 6, name: 'Pink', color: '#FC97AC' },
  { slot: 7, name: 'Teal', color: '#039CBD' },
] as const;

const SLOT_COLOR_MAP = new Map<number, string>(
  COLOR_SLOTS.map(s => [s.slot, s.color])
);

/** Resolve a participant's color from their chosen slot, with index-based fallback. */
export function getSlotColor(
  colorSlot: number | null | undefined,
  fallbackIndex: number
): string {
  if (colorSlot != null) {
    const c = SLOT_COLOR_MAP.get(colorSlot);
    if (c) return c;
  }
  return COLOR_SLOTS[fallbackIndex % COLOR_SLOTS.length].color;
}

type ColorSlotPickerProps = {
  selected: number | null;
  onSelect: (slot: number) => void;
  /** Slots already taken by other participants. */
  takenSlots?: number[];
  label?: string;
};

export function ColorSlotPicker({
  selected,
  onSelect,
  takenSlots = [],
  label = 'Pick your color',
}: ColorSlotPickerProps) {
  const takenSet = new Set(takenSlots);

  return (
    <div>
      <p className="mt-6 mb-2 text-center text-xs font-medium text-foreground-muted">
        {label}
      </p>
      <div className="grid grid-cols-4 justify-center gap-2 xs:grid-cols-8">
        {COLOR_SLOTS.map(({ slot, name, color }) => {
          const taken = takenSet.has(slot);
          const isSelected = selected === slot;
          return (
            <button
              key={slot}
              type="button"
              aria-label={`${name}${taken ? ' (taken)' : ''}`}
              title={name}
              disabled={taken}
              onClick={() => onSelect(slot)}
              className={cn(
                'relative mx-auto flex size-8 items-center justify-center rounded-full border-2 transition-all',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                taken
                  ? 'cursor-not-allowed opacity-30'
                  : 'cursor-pointer hover:scale-110',
                isSelected
                  ? 'border-foreground shadow-sm'
                  : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
            >
              {isSelected && (
                <Check className="size-4 text-white drop-shadow-sm" />
              )}
              {taken && !isSelected && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-0.5 w-5 rotate-45 rounded-full bg-white/80" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
