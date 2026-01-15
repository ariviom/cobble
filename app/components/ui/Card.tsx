'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/app/components/ui/utils';
import type { HTMLAttributes, PropsWithChildren, ReactNode } from 'react';

const cardVariants = cva(
  'rounded-[var(--radius-lg)] border-2 bg-card transition-all duration-150 overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-subtle',
        // Colored top strip variants - like stacked LEGO bricks
        yellow: 'border-subtle border-t-4 border-t-brand-yellow',
        red: 'border-subtle border-t-4 border-t-brand-red',
        blue: 'border-subtle border-t-4 border-t-brand-blue',
        green: 'border-subtle border-t-4 border-t-brand-green',
        // Full colored border
        'outline-yellow': 'border-brand-yellow bg-brand-yellow/5',
        'outline-blue': 'border-brand-blue bg-brand-blue/5',
      },
      elevated: {
        true: 'shadow-[0_4px_0_0] shadow-neutral-200 dark:shadow-neutral-800',
        false: '',
      },
      interactive: {
        true: 'cursor-pointer hover:-translate-y-1 hover:shadow-[0_6px_0_0] hover:shadow-neutral-200 dark:hover:shadow-neutral-800 active:translate-y-0 active:shadow-[0_2px_0_0]',
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
