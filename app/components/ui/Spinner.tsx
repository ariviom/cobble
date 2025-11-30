'use client';

type SpinnerProps = {
  label?: string;
  className?: string;
};

export function Spinner({ label, className }: SpinnerProps) {
  return (
    <div className={className} role="status" aria-live="polite">
      <div className="inline-flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-subtle border-t-theme-primary" />
        {label ? <span className="text-sm text-foreground-muted">{label}</span> : null}
      </div>
    </div>
  );
}


