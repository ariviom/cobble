'use client';

type FilterBarProps = {
  children: React.ReactNode;
  className?: string;
};

export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={`relative -mx-4 border-b border-subtle pb-3 lg:border-none ${className ?? ''}`}
    >
      <div className="flex items-center gap-3 overflow-x-auto px-4 no-scrollbar">
        {children}
      </div>
      <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-background sm:hidden" />
    </div>
  );
}
