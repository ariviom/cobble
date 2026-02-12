'use client';

import { cn } from './utils';

type EmptyStateProps = {
  message: string;
  className?: string;
};

export function EmptyState({ message, className }: EmptyStateProps) {
  return (
    <div className={cn('p-4 text-sm text-foreground-muted', className)}>
      {message}
    </div>
  );
}
