'use client';

type Props = {
  onClick: () => void;
  className?: string;
};

export function ClearAllButton({ onClick, className }: Props) {
  return (
    <div
      className={`flex w-full justify-center border-subtle ${className ?? ''}`}
    >
      <button
        type="button"
        className="h-full w-full cursor-pointer py-3.5 font-semibold text-foreground-muted transition-colors hover:bg-theme-primary/10 hover:text-foreground"
        onClick={onClick}
      >
        Clear All
      </button>
    </div>
  );
}
