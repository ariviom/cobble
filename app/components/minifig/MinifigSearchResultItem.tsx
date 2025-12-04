'use client';

import { MinifigOwnershipAndCollectionsRow } from '@/app/components/minifig/MinifigOwnershipAndCollectionsRow';
import { useMinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';

type MinifigSearchResultItemProps = {
  figNum: string;
  name: string;
  imageUrl: string | null;
  numParts: number | null;
};

export function MinifigSearchResultItem({
  figNum,
  name,
  imageUrl,
  numParts,
}: MinifigSearchResultItemProps) {
  const ownership = useMinifigOwnershipState({ figNum });

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-card">
      <div className="w-full">
        <div className="relative w-full bg-card-muted">
          <div className="relative mx-auto w-full max-w-full bg-card p-2">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={name}
                className="aspect-square h-full w-full overflow-hidden rounded-lg object-cover"
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
              {name}
            </div>
            <div className="mt-1 w-full text-xs text-foreground-muted">
              <span>{figNum}</span>
              {typeof numParts === 'number' && numParts > 0 && (
                <span className="ml-1">• {numParts} parts</span>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="px-3 pb-3">
        <MinifigOwnershipAndCollectionsRow ownership={ownership} />
      </div>
    </div>
  );
}


