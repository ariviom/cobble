'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const rowButtonVariants = cva(
  'flex w-full h-full items-center bg-background px-3 text-left text-foreground hover:bg-neutral-100 selected:bg-blue-50 selected:text-blue-700 cursor-pointer',
  {
    variants: {
      size: {
        sm: 'gap-3 py-2 text-sm',
      },
    },
    defaultVariants: {
      size: 'sm',
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
