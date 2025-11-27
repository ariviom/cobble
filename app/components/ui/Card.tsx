'use client';

import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { cn } from '@/app/components/ui/utils';

export type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    elevated?: boolean;
  }
>;

export function Card({ elevated, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-card p-4',
        elevated && 'shadow-sm',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export type CardHeaderProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & { actions?: ReactNode }
>;

export function CardHeader({
  className,
  actions,
  children,
  ...rest
}: CardHeaderProps) {
  return (
    <div
      className={cn('mb-3 flex items-start justify-between gap-3', className)}
      {...rest}
    >
      <div className="space-y-1">{children}</div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export type CardTitleProps = PropsWithChildren<HTMLAttributes<HTMLHeadingElement>>;

export function CardTitle({ className, ...rest }: CardTitleProps) {
  return (
    <h2
      className={cn('text-sm font-medium text-foreground', className)}
      {...rest}
    />
  );
}

export type CardDescriptionProps = PropsWithChildren<
  HTMLAttributes<HTMLParagraphElement>
>;

export function CardDescription({ className, ...rest }: CardDescriptionProps) {
  return (
    <p
      className={cn('text-xs text-foreground-muted', className)}
      {...rest}
    />
  );
}

export type CardContentProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement>
>;

export function CardContent({ className, ...rest }: CardContentProps) {
  return (
    <div className={cn('space-y-3', className)} {...rest} />
  );
}

export type CardFooterProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement>
>;

export function CardFooter({ className, ...rest }: CardFooterProps) {
  return (
    <div
      className={cn('mt-3 flex items-center justify-between gap-3', className)}
      {...rest}
    />
  );
}



