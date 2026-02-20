'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './utils';

const iconButtonVariants = cva(
  'inline-flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        // Ghost - minimal, for dismiss buttons and subtle actions
        ghost:
          'text-foreground-muted hover:bg-foreground/10 hover:text-foreground',
        // Default - subtle background
        default: 'bg-card-muted text-foreground-muted hover:text-foreground',
        // Outline - with border
        outline:
          'border border-subtle text-foreground-muted hover:border-foreground/30 hover:text-foreground',
      },
      size: {
        sm: 'h-7 w-7 rounded-md',
        md: 'h-9 w-9 rounded-lg',
        lg: 'h-11 w-11 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'sm',
    },
  }
);

export { iconButtonVariants };

type Props = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    icon: ReactNode;
  };

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  function IconButton({ className, variant, size, icon, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...props}
      >
        {icon}
      </button>
    );
  }
);
