'use client';

import { MinifigOwnershipAndCollectionsRow } from '@/app/components/minifig/MinifigOwnershipAndCollectionsRow';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { useMinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { getMinifigDisplayIds } from '@/app/lib/minifigIds';
import Link from 'next/link';

type MinifigSearchResultItemProps = {
  figNum: string;
  blId?: string | null | undefined;
  name: string;
  imageUrl: string | null;
  numParts: number | null;
  themeName?: string | null;
  themePath?: string | null;
};

export function MinifigSearchResultItem({
  figNum,
  blId,
  name,
  imageUrl,
  numParts,
  themeName,
  themePath,
}: MinifigSearchResultItemProps) {
  const ownership = useMinifigOwnershipState({ figNum });
  const { displayLabel, routeId } = getMinifigDisplayIds({
    bricklinkId: blId ?? null,
    rebrickableId: figNum,
  });

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border-2 border-subtle bg-card">
      <Link
        href={`/minifigs/${encodeURIComponent(routeId || figNum)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-card-muted">
            <div className="relative mx-auto w-full max-w-full bg-card p-2">
              {imageUrl ? (
                <OptimizedImage
                  src={imageUrl}
                  alt={name}
                  variant="minifigSearch"
                  className="aspect-square h-full w-full overflow-hidden rounded-lg object-cover"
                />
              ) : (
                <ImagePlaceholder variant="simple" text="No image" />
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 w-full overflow-hidden font-medium">
                {name}
              </div>
              <div className="mt-1 w-full text-xs text-foreground-muted">
                <span>{displayLabel}</span>
                {typeof numParts === 'number' && numParts > 0 && (
                  <span className="ml-1">• {numParts} parts</span>
                )}
                {(themeName || themePath) && (
                  <div className="text-2xs mt-1 truncate">
                    {themePath ?? themeName}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
      <div className="px-3 pb-3">
        <MinifigOwnershipAndCollectionsRow ownership={ownership} />
      </div>
    </div>
  );
}
