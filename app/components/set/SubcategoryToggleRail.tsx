'use client';

import { cx } from '@/app/components/ui/utils';

type Props = {
  options: string[];
  selected: string[];
  onToggle: (subcategory: string) => void;
  className?: string;
};

export function SubcategoryToggleRail({
  options,
  selected,
  onToggle,
  className,
}: Props) {
  if (options.length === 0) return null;

  return (
    <div
      className={cx(
        'no-scrollbar flex items-center gap-2 overflow-x-auto border-b border-neutral-300 bg-neutral-100 py-2',
        className
      )}
    >
      {options.map(option => {
        const isSelected = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            data-selected={isSelected ? 'true' : undefined}
            className={cx(
              'rounded-full border px-3 py-2 text-sm whitespace-nowrap transition-colors first:ml-2 last:mr-2',
              isSelected
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-foreground-accent bg-background text-foreground hover:bg-neutral-100'
            )}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
