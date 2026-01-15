'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from './utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 cursor-pointer font-semibold transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background select-none',
  {
    variants: {
      variant: {
        // Yellow primary - LEGO signature, chunky 3D effect
        primary:
          'bg-brand-yellow text-[var(--color-on-yellow)] border-transparent shadow-[0_4px_0_0] shadow-[#b39700] hover:shadow-[0_3px_0_0] hover:translate-y-[1px] active:shadow-[0_1px_0_0] active:translate-y-[3px] focus-visible:ring-brand-yellow',
        // Red accent - bold LEGO red
        danger:
          'bg-brand-red text-white border-transparent shadow-[0_4px_0_0] shadow-[#a30008] hover:shadow-[0_3px_0_0] hover:translate-y-[1px] active:shadow-[0_1px_0_0] active:translate-y-[3px] focus-visible:ring-brand-red',
        // Blue accent - classic LEGO blue
        accent:
          'bg-brand-blue text-white border-transparent shadow-[0_4px_0_0] shadow-[#014d85] hover:shadow-[0_3px_0_0] hover:translate-y-[1px] active:shadow-[0_1px_0_0] active:translate-y-[3px] focus-visible:ring-brand-blue',
        // Green - for success actions
        success:
          'bg-brand-green text-white border-transparent shadow-[0_4px_0_0] shadow-[#007830] hover:shadow-[0_3px_0_0] hover:translate-y-[1px] active:shadow-[0_1px_0_0] active:translate-y-[3px] focus-visible:ring-brand-green',
        // Secondary - subtle but still has depth
        secondary:
          'bg-card text-foreground border-subtle shadow-[0_3px_0_0] shadow-neutral-300 dark:shadow-neutral-700 hover:shadow-[0_2px_0_0] hover:translate-y-[1px] active:shadow-[0_0px_0_0] active:translate-y-[3px] focus-visible:ring-theme-primary',
        // Google - for OAuth
        google:
          'bg-neutral-00 text-foreground border-subtle shadow-[0_3px_0_0] shadow-neutral-300 dark:shadow-neutral-700 hover:bg-neutral-50 hover:shadow-[0_2px_0_0] hover:translate-y-[1px] active:shadow-[0_0px_0_0] active:translate-y-[3px] focus-visible:ring-theme-primary',
        // Ghost - minimal
        ghost:
          'bg-transparent text-foreground border-transparent hover:bg-background-muted active:bg-neutral-200 focus-visible:ring-theme-primary',
        // Outline - border only
        outline:
          'bg-transparent text-foreground border-strong hover:bg-card-muted active:bg-card focus-visible:ring-theme-primary',
        // Destructive - alias for danger for backwards compat
        destructive:
          'bg-brand-red text-white border-transparent shadow-[0_4px_0_0] shadow-[#a30008] hover:shadow-[0_3px_0_0] hover:translate-y-[1px] active:shadow-[0_1px_0_0] active:translate-y-[3px] focus-visible:ring-brand-red',
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
