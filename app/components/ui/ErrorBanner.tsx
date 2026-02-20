'use client';

import { cn } from './utils';

type ErrorBannerProps = {
  message: string;
  className?: string;
};

export function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-danger bg-danger-muted p-3 text-sm text-danger',
        className
      )}
      role="alert"
    >
      {message}
    </div>
  );
}
