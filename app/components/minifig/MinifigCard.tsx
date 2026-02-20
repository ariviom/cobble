'use client';

import { cardVariants } from '@/app/components/ui/Card';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { cn } from '@/app/components/ui/utils';
import { getMinifigDisplayIds } from '@/app/lib/minifigIds';
import Link from 'next/link';
import type { ReactNode } from 'react';

type MinifigCardProps = {
  figNum: string;
  name: string;
  numParts?: number | null;
  quantity?: number | null;
  imageUrl?: string | null;
  blId?: string | null;
  /** Release year */
  year?: number | null;
  /** Optional theme name to display above the title */
  themeName?: string | null;
  className?: string;
  /**
   * Optional footer content rendered below the card body (e.g., ownership controls).
   * Lets callers decide which contexts show controls (search vs. collection views).
   */
  children?: ReactNode;
};

export function MinifigCard({
  figNum,
  name,
  numParts,
  quantity,
  imageUrl,
  blId,
  year,
  themeName,
  className,
  children,
}: MinifigCardProps) {
  const { displayLabel, routeId } = getMinifigDisplayIds({
    bricklinkId: blId ?? null,
    rebrickableId: figNum,
  });
  const displayName = (name && name.trim()) || figNum;

  // Build metadata parts array for consistent separator treatment (matches SetDisplayCard order)
  const metadataParts: string[] = [displayLabel];
  if (typeof year === 'number' && Number.isFinite(year) && year > 0) {
    metadataParts.push(String(year));
  }
  if (
    typeof numParts === 'number' &&
    Number.isFinite(numParts) &&
    numParts > 0
  ) {
    metadataParts.push(`${numParts} parts`);
  }
  if (
    typeof quantity === 'number' &&
    Number.isFinite(quantity) &&
    quantity > 0
  ) {
    metadataParts.push(`${quantity}x`);
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col',
        cardVariants({
          variant: 'default',
          elevated: true,
          interactive: true,
          padding: 'none',
        }),
        className
      )}
    >
      <Link
        href={`/minifigs/${encodeURIComponent(routeId || figNum)}`}
        className="block w-full flex-1"
      >
        <div className="p-2">
          {imageUrl ? (
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
              <OptimizedImage
                src={imageUrl}
                alt={displayName}
                variant="minifigCard"
                className="size-full rounded-sm object-contain p-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              />
            </div>
          ) : (
            <ImagePlaceholder variant="card" />
          )}
        </div>
        <div className="flex items-start gap-2 px-2 py-3 sm:px-3">
          <div className="min-w-0 flex-1">
            {themeName && (
              <div className="mb-1 w-full truncate text-xs font-bold tracking-wide text-theme-text uppercase">
                {themeName}
              </div>
            )}
            <div className="line-clamp-2 w-full text-sm leading-tight font-bold text-foreground">
              {displayName}
            </div>
            <div className="mt-1 w-full text-2xs font-semibold text-foreground-muted">
              {metadataParts.join(' • ')}
            </div>
          </div>
        </div>
      </Link>
      {children}
    </div>
  );
}
