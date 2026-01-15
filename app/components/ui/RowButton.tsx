'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const rowButtonVariants = cva(
  // Chunky, LEGO-inspired row buttons with bold active states
  'flex w-full h-full items-center bg-card px-4 text-left font-medium text-foreground transition-all duration-150 hover:bg-brand-yellow/10 cursor-pointer data-[selected=true]:bg-brand-yellow/20 data-[selected=true]:text-neutral-900 data-[selected=true]:font-semibold',
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
    wrapperClassName?: string;
  };

export function RowButton({
  selected,
  size,
  className,
  wrapperClassName,
  children,
  type,
  ...rest
}: RowButtonProps) {
  return (
    <div
      data-selected={selected ? 'true' : undefined}
      className={wrapperClassName}
    >
      <button
        type={type ?? 'button'}
        className={cn(rowButtonVariants({ size }), className)}
        {...rest}
      >
        {children}
      </button>
    </div>
  );
}
