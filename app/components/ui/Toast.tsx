import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from './utils';

type ToastVariant = 'info' | 'warning' | 'error';

export type ToastProps = {
  title?: string;
  description: ReactNode;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  /** Pixels or CSS calc for mobile bottom offset (keeps above bottom nav). */
  mobileBottomOffset?: string;
  className?: string;
};

function getVariantClasses(variant: ToastVariant): string {
  switch (variant) {
    case 'warning':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100';
    case 'error':
      return 'border-red-500/50 bg-red-500/10 text-red-900 dark:text-red-100';
    case 'info':
    default:
      return 'border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-100';
  }
}

export function Toast({
  title,
  description,
  variant = 'info',
  actionLabel,
  onAction,
  onClose,
  mobileBottomOffset = 'calc(var(--nav-height, 64px) + 12px)',
  className,
}: ToastProps) {
  const role =
    variant === 'error' || variant === 'warning' ? 'alert' : 'status';

  return (
    <div
      className={cn(
        'pointer-events-none fixed right-0 left-0 z-[60] flex justify-center px-4',
        'bottom-[var(--toast-bottom-mobile)] lg:bottom-4',
        className
      )}
      style={{ ['--toast-bottom-mobile' as string]: mobileBottomOffset }}
    >
      <div
        role={role}
        aria-live="polite"
        className={cn(
          'pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur',
          getVariantClasses(variant)
        )}
      >
        <div className="flex-1 space-y-1">
          {title ? (
            <div className="leading-tight font-semibold">{title}</div>
          ) : null}
          <div className="text-sm leading-snug">{description}</div>
          {actionLabel && onAction ? (
            <button
              type="button"
              className="text-sm font-semibold text-blue-700 underline underline-offset-4 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-200 dark:hover:text-blue-100"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Close notification"
            className="rounded p-1 text-sm text-foreground/70 transition hover:bg-foreground/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
