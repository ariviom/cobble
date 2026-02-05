import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from './IconButton';
import { getStatusIcon, type StatusVariant } from './statusIcons';
import { cn } from './utils';

// Matches StatusToggleButton active styles pattern (solid bg approximating tint on white/dark)
const toastVariantStyles = {
  success:
    'bg-green-50 dark:bg-green-950 text-brand-green border-brand-green/40 shadow-[0_2px_0_0] shadow-brand-green/25',
  error:
    'bg-red-50 dark:bg-red-950 text-brand-red border-brand-red/40 shadow-[0_2px_0_0] shadow-brand-red/25',
  warning:
    'bg-orange-50 dark:bg-orange-950 text-brand-orange border-brand-orange/40 shadow-[0_2px_0_0] shadow-brand-orange/25',
  info: 'bg-blue-50 dark:bg-blue-950 text-brand-blue border-brand-blue/40 shadow-[0_2px_0_0] shadow-brand-blue/25',
} as const;

type ToastVariant = 'info' | 'warning' | 'error' | 'success';

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
          'pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-lg border-2 px-4 py-3',
          toastVariantStyles[variant]
        )}
      >
        <div className="mt-0.5">{getStatusIcon(variant as StatusVariant)}</div>
        <div className="flex-1 space-y-1">
          {title ? (
            <div className="leading-tight font-bold">{title}</div>
          ) : null}
          <div className="text-sm leading-snug font-medium">{description}</div>
          {actionLabel && onAction ? (
            <button
              type="button"
              className="mt-2 text-sm font-bold underline underline-offset-4 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary"
              onClick={onAction}
            >
              {actionLabel}
            </button>
          ) : null}
        </div>
        {onClose ? (
          <IconButton
            aria-label="Close notification"
            icon={<X className="h-5 w-5" />}
            variant="ghost"
            size="sm"
            onClick={onClose}
          />
        ) : null}
      </div>
    </div>
  );
}
