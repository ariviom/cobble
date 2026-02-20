'use client';

import { cn } from '@/app/components/ui/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import { ImageOff } from 'lucide-react';

const placeholderVariants = cva(
  'flex items-center justify-center text-foreground-muted',
  {
    variants: {
      variant: {
        // Simple muted background for inventory items
        inventory:
          'aspect-square h-full w-full rounded-sm bg-card-muted text-xs ring-1 ring-foreground-accent',
        // Gradient background for set/minifig cards
        card: 'flex-col gap-1.5 aspect-4/3 rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 text-2xs font-medium dark:from-neutral-800 dark:to-neutral-900',
        // Minimal placeholder - just text styling, use className for sizing
        simple: 'aspect-square text-xs',
        // Small thumbnail placeholder
        thumbnail: 'size-full text-xs font-medium',
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
  const isCard = variant === 'card' || variant === undefined;
  return (
    <div className={cn(placeholderVariants({ variant }), className)}>
      {isCard && <ImageOff className="h-6 w-6 text-foreground-muted/50" />}
      {text}
    </div>
  );
}
