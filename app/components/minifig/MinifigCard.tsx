'use client';

import { cardVariants } from '@/app/components/ui/Card';
import { cn } from '@/app/components/ui/utils';
import { getMinifigDisplayIds } from '@/app/lib/minifigIds';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
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
    metadataParts.push(`${quantity} ${quantity === 1 ? 'copy' : 'copies'}`);
  }

  return (
    <div
      className={cn(
        'group relative',
        cardVariants({
          variant: 'theme',
          elevated: true,
          interactive: true,
          padding: 'none',
        }),
        className
      )}
    >
      <Link
        href={`/minifigs/${encodeURIComponent(routeId || figNum)}`}
        className="block w-full"
      >
        <div className="w-full">
          {/* Image area with gradient background matching SetDisplayCard */}
          <div className="relative w-full">
            <div className="relative mx-auto w-full max-w-full p-3">
              {imageUrl ? (
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
                  <OptimizedImage
                    src={imageUrl}
                    alt={displayName}
                    variant="minifigCard"
                    className="size-full rounded-sm object-contain p-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
                  />
                </div>
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 text-sm font-medium text-foreground-muted dark:from-neutral-800 dark:to-neutral-900">
                  No Image
                </div>
              )}
            </div>
          </div>

          {/* Content area matching SetDisplayCard typography */}
          <div className="flex items-start gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              {themeName && (
                <div className="mb-1 w-full truncate text-xs font-bold tracking-wide text-brand-orange uppercase">
                  {themeName}
                </div>
              )}
              <div className="line-clamp-2 w-full overflow-hidden text-base leading-tight font-bold text-foreground">
                {displayName}
              </div>
              <div className="mt-1.5 w-full text-sm font-semibold text-foreground-muted">
                {metadataParts.join(' • ')}
              </div>
            </div>
          </div>
        </div>
      </Link>
      {children}
    </div>
  );
}
