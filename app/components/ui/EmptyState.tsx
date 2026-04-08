'use client';

import type { ReactNode } from 'react';
import { cn } from './utils';

type EmptyStateProps = {
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  message,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center text-sm text-foreground-muted',
        className
      )}
    >
      {icon && <div className="mb-3 text-foreground-muted/60">{icon}</div>}
      <p>{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
