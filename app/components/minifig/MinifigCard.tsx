'use client';

import { useMinifigMeta } from '@/app/hooks/useMinifigMeta';

type MinifigCardProps = {
  figNum: string;
  name: string;
  numParts?: number | null;
  quantity?: number | null;
};

export function MinifigCard({
  figNum,
  name,
  numParts,
  quantity,
}: MinifigCardProps) {
  const { meta } = useMinifigMeta(figNum);
  // Only show BL ID when available - never show RB fig_num
  const displayId = meta?.blId ?? null;
  const imageUrl = meta?.imageUrl ?? null;
  const displayName =
    (meta?.name && meta.name.trim()) || (name && name.trim()) || figNum;
  const partsCount =
    typeof meta?.numParts === 'number' && Number.isFinite(meta.numParts)
      ? meta.numParts
      : (numParts ?? null);

  return (
    <div className="rounded-lg border border-subtle bg-card shadow-sm transition-colors hover:border-strong">
      <div className="w-full">
        <div className="relative w-full bg-card-muted">
          <div className="relative mx-auto w-full max-w-full bg-card p-2">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={displayName}
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
              {displayName}
            </div>
            <div className="mt-1 w-full text-xs text-foreground-muted">
              {displayId && <span>{displayId}</span>}
              {typeof partsCount === 'number' && partsCount > 0 && (
                <span className={displayId ? 'ml-1' : ''}>
                  {displayId && '• '}
                  {partsCount} parts
                </span>
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
  );
}
