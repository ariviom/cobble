'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ImageOff } from 'lucide-react';

const GRADIENT =
  'bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900';

const placeholderVariants = cva(
  `flex flex-col items-center justify-center gap-1.5 text-foreground-muted text-2xs font-medium ${GRADIENT}`,
  {
    variants: {
      variant: {
        // Square — inventory grid items
        inventory: 'aspect-square h-full w-full rounded-sm',
        // 4:3 — set/minifig cards
        card: 'aspect-4/3 rounded-md',
        // Fills parent — modals, thumbnails, etc.
        fill: 'size-full',
      },
    },
    defaultVariants: {
      variant: 'card',
    },
  }
);

type Props = {
  className?: string;
  text?: string;
} & VariantProps<typeof placeholderVariants>;

export function ImagePlaceholder({
  variant,
  className,
  text = 'No Image',
}: Props) {
  return (
    <div className={cn(placeholderVariants({ variant }), className)}>
      <ImageOff className="h-6 w-6 text-foreground-muted/50" />
      {text}
    </div>
  );
}
