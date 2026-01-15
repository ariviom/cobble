'use client';

import { getMinifigDisplayIds } from '@/app/lib/minifigIds';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import Link from 'next/link';

type MinifigCardProps = {
  figNum: string;
  name: string;
  numParts?: number | null;
  quantity?: number | null;
  imageUrl?: string | null;
  blId?: string | null;
};

export function MinifigCard({
  figNum,
  name,
  numParts,
  quantity,
  imageUrl,
  blId,
}: MinifigCardProps) {
  const { displayLabel, routeId } = getMinifigDisplayIds({
    bricklinkId: blId ?? null,
    rebrickableId: figNum,
  });
  const displayName = (name && name.trim()) || figNum;
  const partsCount =
    typeof numParts === 'number' && Number.isFinite(numParts) ? numParts : null;

  return (
    <Link
      href={`/minifigs/id/${encodeURIComponent(routeId || figNum)}`}
      className="block w-full"
    >
      <div className="rounded-[var(--radius-lg)] border-2 border-subtle bg-card shadow-sm transition-colors hover:border-strong">
        <div className="w-full">
          <div className="relative w-full bg-card-muted">
            <div className="relative mx-auto w-full max-w-full bg-card p-2">
              {imageUrl ? (
                <OptimizedImage
                  src={imageUrl}
                  alt={displayName}
                  variant="minifigCard"
                  className="aspect-square h-full w-full overflow-hidden rounded-[var(--radius-lg)] object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-foreground-muted">
                  No image
                </div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 w-full overflow-hidden font-medium">
                {displayName}
              </div>
              <div className="mt-1 w-full text-xs text-foreground-muted">
                <span>{displayLabel}</span>
                {typeof partsCount === 'number' && partsCount > 0 && (
                  <span className="ml-1">• {partsCount} parts</span>
                )}
                {typeof quantity === 'number' && quantity > 0 && (
                  <span className="ml-1">
                    • {quantity} {quantity === 1 ? 'copy' : 'copies'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
