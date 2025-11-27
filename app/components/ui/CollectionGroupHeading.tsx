import type { HTMLAttributes } from 'react';
import { cn } from '@/app/components/ui/utils';

export type CollectionGroupHeadingProps = HTMLAttributes<HTMLDivElement>;

export function CollectionGroupHeading({
  className,
  children,
  ...rest
}: CollectionGroupHeadingProps) {
  return (
    <div
      className={cn(
        'px-1 py-2 text-lg font-semibold tracking-wide text-foreground uppercase',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

