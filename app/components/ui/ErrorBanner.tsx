'use client';

type ErrorBannerProps = {
  message: string;
  className?: string;
};

export function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <div
      className={`rounded-[var(--radius-md)] border-2 border-danger bg-danger-muted p-3 text-sm text-danger ${className ?? ''}`}
      role="alert"
    >
      {message}
    </div>
  );
}
