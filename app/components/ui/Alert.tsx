'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { IconButton } from './IconButton';
import {
  getStatusContainerClasses,
  getStatusIcon,
  type StatusVariant,
} from './statusIcons';
import { cn } from './utils';

const alertVariants = cva(
  // Base: Chunky left border like Toast, bold styling
  'relative rounded-[var(--radius-lg)] border-2 border-subtle border-l-4 px-4 py-3 text-sm',
  {
    variants: {
      variant: {
        info: '',
        success: '',
        warning: '',
        error: '',
        neutral: '',
      },
    },
    defaultVariants: {
      variant: 'info',
    },
  }
);

export type AlertProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> &
    VariantProps<typeof alertVariants> & {
      title?: string;
      icon?: ReactNode;
      dismissible?: boolean;
      onDismiss?: () => void;
    }
>;

export function Alert({
  variant = 'info',
  title,
  icon,
  dismissible,
  onDismiss,
  className,
  children,
  ...rest
}: AlertProps) {
  const statusVariant = (variant ?? 'info') as StatusVariant;
  const displayIcon = icon ?? getStatusIcon(statusVariant);

  return (
    <div
      role="alert"
      className={cn(
        alertVariants({ variant }),
        getStatusContainerClasses(statusVariant),
        className
      )}
      {...rest}
    >
      <div className="flex gap-3">
        <div className="mt-0.5">{displayIcon}</div>
        <div className="flex-1 space-y-1">
          {title && <div className="leading-tight font-bold">{title}</div>}
          {children && (
            <div className="leading-relaxed font-medium">{children}</div>
          )}
        </div>
        {dismissible && onDismiss && (
          <IconButton
            onClick={onDismiss}
            className="absolute top-3 right-3"
            aria-label="Dismiss"
            icon={<X className="h-5 w-5" />}
            variant="ghost"
            size="sm"
          />
        )}
      </div>
    </div>
  );
}
