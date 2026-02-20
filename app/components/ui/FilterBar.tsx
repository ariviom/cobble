'use client';

import { cn } from './utils';

type FilterBarProps = {
  children: React.ReactNode;
  className?: string;
};

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        '-mx-4 border-b border-subtle pb-3 lg:border-none',
        className
      )}
    >
      <div className="flex items-center gap-3 overflow-x-auto px-4 no-scrollbar">
        {children}
      </div>
    </div>
  );
}
