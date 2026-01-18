'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md border-2 cursor-pointer font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none',
  {
    variants: {
      variant: {
        // Primary - uses theme color with chunky 3D effect
        primary:
          'bg-theme-primary text-theme-primary-contrast border-transparent brick-button-depth [--brick-shadow-color:var(--color-theme-shadow)] focus-visible:ring-theme-primary',
        // Danger - semantic red for destructive actions
        danger:
          'bg-danger text-white border-transparent brick-button-depth [--brick-shadow-color:color-mix(in_oklch,var(--color-danger)_70%,black)] focus-visible:ring-danger',
        // Accent - alias for primary (backwards compat)
        accent:
          'bg-theme-primary text-theme-primary-contrast border-transparent brick-button-depth [--brick-shadow-color:var(--color-theme-shadow)] focus-visible:ring-theme-primary',
        // Success - semantic green for positive actions
        success:
          'bg-success text-white border-transparent brick-button-depth [--brick-shadow-color:color-mix(in_oklch,var(--color-success)_70%,black)] focus-visible:ring-success',
        // Secondary - subtle but still has depth
        secondary:
          'bg-card text-foreground border-subtle brick-button-depth-sm focus-visible:ring-theme-primary',
        // Google - for OAuth
        google:
          'bg-neutral-00 text-foreground border-subtle brick-button-depth-sm hover:bg-neutral-50 focus-visible:ring-theme-primary',
        // Ghost - minimal
        ghost:
          'bg-transparent text-foreground border-transparent hover:bg-background-muted active:bg-neutral-200 focus-visible:ring-theme-primary',
        // Outline - border only
        outline:
          'bg-transparent text-foreground border-strong hover:bg-card-muted active:bg-card focus-visible:ring-theme-primary',
        // Destructive - alias for danger for backwards compat
        destructive:
          'bg-danger text-white border-transparent brick-button-depth [--brick-shadow-color:color-mix(in_oklch,var(--color-danger)_70%,black)] focus-visible:ring-danger',
        // Hero primary - yellow on colored backgrounds (stays fixed, won't conflict with theme)
        'hero-primary':
          'bg-brand-yellow text-on-yellow border-transparent brick-button-depth [--brick-shadow-color:color-mix(in_oklch,var(--color-brand-yellow)_70%,black)] focus-visible:ring-brand-yellow',
        // Hero secondary - white on colored backgrounds
        'hero-secondary':
          'bg-white text-on-white border-transparent brick-button-depth [--brick-shadow-color:rgba(0,0,0,0.2)] focus-visible:ring-white',
        // Link - text link styling
        link: 'bg-transparent text-link border-transparent underline hover:text-link-hover p-0 h-auto font-normal focus-visible:ring-link',
      },
      size: {
        xs: 'px-2 py-1 text-2xs h-6',
        sm: 'px-4 py-2 text-sm h-9',
        md: 'px-5 py-2.5 text-base h-11',
        lg: 'px-6 py-3 text-lg h-13',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  }
);

// Export variants for use with Link/anchor elements
export { buttonVariants };

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { className, variant, size, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
});
