'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md border-2 cursor-pointer font-semibold transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none',
  {
    variants: {
      variant: {
        // Primary - uses theme color with chunky 3D effect
        primary:
          'bg-theme-primary text-theme-primary-contrast border-transparent shadow-[0_4px_0_0_var(--color-theme-shadow)] hover:shadow-[0_3px_0_0_var(--color-theme-shadow)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_var(--color-theme-shadow)] active:translate-y-[3px] focus-visible:ring-theme-primary',
        // Danger - semantic red for destructive actions
        danger:
          'bg-danger text-white border-transparent shadow-[0_4px_0_0_color-mix(in_oklch,var(--color-danger)_70%,black)] hover:shadow-[0_3px_0_0_color-mix(in_oklch,var(--color-danger)_70%,black)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_color-mix(in_oklch,var(--color-danger)_70%,black)] active:translate-y-[3px] focus-visible:ring-danger',
        // Accent - alias for primary (backwards compat)
        accent:
          'bg-theme-primary text-theme-primary-contrast border-transparent shadow-[0_4px_0_0_var(--color-theme-shadow)] hover:shadow-[0_3px_0_0_var(--color-theme-shadow)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_var(--color-theme-shadow)] active:translate-y-[3px] focus-visible:ring-theme-primary',
        // Success - semantic green for positive actions
        success:
          'bg-success text-white border-transparent shadow-[0_4px_0_0_color-mix(in_oklch,var(--color-success)_70%,black)] hover:shadow-[0_3px_0_0_color-mix(in_oklch,var(--color-success)_70%,black)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_color-mix(in_oklch,var(--color-success)_70%,black)] active:translate-y-[3px] focus-visible:ring-success',
        // Secondary - subtle but still has depth
        secondary:
          'bg-card text-foreground border-subtle shadow-[0_3px_0_0_var(--color-shadow-depth)] hover:shadow-[0_2px_0_0_var(--color-shadow-depth)] hover:translate-y-[1px] active:shadow-[0_0px_0_0_var(--color-shadow-depth)] active:translate-y-[3px] focus-visible:ring-theme-primary',
        // Google - for OAuth
        google:
          'bg-neutral-00 text-foreground border-subtle shadow-[0_3px_0_0_var(--color-shadow-depth)] hover:bg-neutral-50 hover:shadow-[0_2px_0_0_var(--color-shadow-depth)] hover:translate-y-[1px] active:shadow-[0_0px_0_0_var(--color-shadow-depth)] active:translate-y-[3px] focus-visible:ring-theme-primary',
        // Ghost - minimal
        ghost:
          'bg-transparent text-foreground border-transparent hover:bg-background-muted active:bg-neutral-200 focus-visible:ring-theme-primary',
        // Outline - border only
        outline:
          'bg-transparent text-foreground border-strong hover:bg-card-muted active:bg-card focus-visible:ring-theme-primary',
        // Destructive - alias for danger for backwards compat
        destructive:
          'bg-danger text-white border-transparent shadow-[0_4px_0_0_color-mix(in_oklch,var(--color-danger)_70%,black)] hover:shadow-[0_3px_0_0_color-mix(in_oklch,var(--color-danger)_70%,black)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_color-mix(in_oklch,var(--color-danger)_70%,black)] active:translate-y-[3px] focus-visible:ring-danger',
        // Hero primary - yellow on colored backgrounds (stays fixed, won't conflict with theme)
        'hero-primary':
          'bg-brand-yellow text-on-yellow border-transparent shadow-[0_4px_0_0_color-mix(in_oklch,var(--color-brand-yellow)_70%,black)] hover:shadow-[0_3px_0_0_color-mix(in_oklch,var(--color-brand-yellow)_70%,black)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_color-mix(in_oklch,var(--color-brand-yellow)_70%,black)] active:translate-y-[3px] focus-visible:ring-brand-yellow',
        // Hero secondary - white on colored backgrounds
        'hero-secondary':
          'bg-white text-on-white border-transparent shadow-[0_4px_0_0_rgba(0,0,0,0.2)] hover:shadow-[0_3px_0_0_rgba(0,0,0,0.2)] hover:translate-y-[1px] active:shadow-[0_1px_0_0_rgba(0,0,0,0.2)] active:translate-y-[3px] focus-visible:ring-white',
      },
      size: {
        xs: 'px-2 py-1 text-[11px] h-6',
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
