'use client';

import { AlertCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './utils';

export type StatusVariant =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'neutral';

const iconColorMap: Record<StatusVariant, string> = {
  info: 'text-brand-blue',
  success: 'text-brand-green',
  warning: 'text-brand-orange',
  error: 'text-brand-red',
  neutral: 'text-foreground-muted',
};

const iconComponentMap: Record<StatusVariant, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
  neutral: Info,
};

/**
 * Returns the appropriate status icon for a given variant with consistent styling.
 * Used by Toast, Alert, and other status-indicating components.
 */
export function getStatusIcon(
  variant: StatusVariant,
  className?: string
): ReactNode {
  const IconComponent = iconComponentMap[variant];
  const colorClass = iconColorMap[variant];
  return (
    <IconComponent className={cn('h-5 w-5 shrink-0', colorClass, className)} />
  );
}

/**
 * Returns the color class for a status variant's icon.
 */
export function getStatusIconColor(variant: StatusVariant): string {
  return iconColorMap[variant];
}

/**
 * Returns the background and border classes for status containers (Alert, Toast).
 */
export function getStatusContainerClasses(variant: StatusVariant): string {
  switch (variant) {
    case 'success':
      return 'border-t-brand-green bg-success-muted text-foreground';
    case 'warning':
      return 'border-t-brand-orange bg-warning-muted text-foreground';
    case 'error':
      return 'border-t-brand-red bg-danger-muted text-foreground';
    case 'neutral':
      return 'border-t-neutral-400 bg-card-muted text-foreground';
    case 'info':
    default:
      return 'border-t-brand-blue bg-info-muted text-foreground';
  }
}
