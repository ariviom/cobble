'use client';

type ErrorBannerProps = {
  message: string;
  className?: string;
};

export function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <div
      className={`rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800 ${className ?? ''}`}
    >
      {message}
    </div>
  );
}


