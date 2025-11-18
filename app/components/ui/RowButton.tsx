'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const rowButtonVariants = cva(
  'flex w-full h-full items-center bg-background px-3 text-left text-foreground hover:bg-neutral-100 selected:bg-theme-primary/10 selected:text-theme-primary cursor-pointer',
  {
    variants: {
      size: {
        sm: 'gap-3 py-2 text-sm',
        md: 'gap-3 py-4 text-base',
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
