'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const rowButtonVariants = cva(
  // Chunky, LEGO-inspired row buttons with bold active states
  'flex w-full h-full items-center border-b border-subtle/50 last:border-b-0 bg-card px-4 text-left font-medium text-foreground transition-all duration-150 hover:bg-theme-primary/10 cursor-pointer data-[selected=true]:bg-theme-primary/20 data-[selected=true]:text-theme-text data-[selected=true]:font-semibold disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card',
  {
    variants: {
      size: {
        sm: 'gap-3 py-2.5 text-sm',
        md: 'gap-3 py-3.5 text-base',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  }
);

export type RowButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof rowButtonVariants> & {
    selected?: boolean;
    /** Visual dimming without disabling interaction */
    muted?: boolean;
  };

export function RowButton({
  selected,
  muted,
  size,
  className,
  children,
  type,
  ...rest
}: RowButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      data-selected={selected ? 'true' : undefined}
      className={cn(
        rowButtonVariants({ size }),
        muted && 'opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
