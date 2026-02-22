'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/app/components/ui/utils';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

const cardVariants = cva(
  'rounded-lg border bg-card transition-all duration-150 overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-subtle',
      },
      elevated: {
        true: 'shadow-md',
        false: '',
      },
      interactive: {
        true: 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-sm',
        false: '',
      },
      padding: {
        none: '',
        sm: 'p-4',
        default: 'p-5',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      elevated: false,
      interactive: false,
      padding: 'default',
    },
  }
);

// Export variants for use in components that need Card-like styling (e.g., SetDisplayCard)
export { cardVariants };

export type CardProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
>;

export function Card({
  variant,
  elevated,
  interactive,
  padding,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        cardVariants({ variant, elevated, interactive, padding }),
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
      {children}
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export type CardTitleProps = PropsWithChildren<
  HTMLAttributes<HTMLHeadingElement>
>;

export function CardTitle({ className, ...rest }: CardTitleProps) {
  return (
    <h2
      className={cn('text-card-title text-foreground', className)}
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
      className={cn('mt-1 text-body text-foreground-muted', className)}
      {...rest}
    />
  );
}

export type CardContentProps = PropsWithChildren<
  HTMLAttributes<HTMLDivElement>
>;

export function CardContent({ className, ...rest }: CardContentProps) {
  return <div className={cn('space-y-3', className)} {...rest} />;
}

export type CardFooterProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

export function CardFooter({ className, ...rest }: CardFooterProps) {
  return (
    <div
      className={cn('mt-3 flex items-center justify-between gap-3', className)}
      {...rest}
    />
  );
}
