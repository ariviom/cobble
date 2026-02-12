'use client';

import { cn } from './utils';

type Props = {
  onClick: () => void;
  className?: string;
};

export function ClearAllButton({ onClick, className }: Props) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer justify-center border-subtle py-3.5 font-semibold text-foreground-muted transition-colors hover:bg-theme-primary/10 hover:text-foreground',
        className
      )}
      onClick={onClick}
    >
      Clear All
    </button>
  );
}
