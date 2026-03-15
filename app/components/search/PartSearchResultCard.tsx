'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import type { PartSearchResult } from '@/app/types/search';

type Props = {
  result: PartSearchResult;
  onClick: () => void;
};

export function PartSearchResultCard({ result, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col overflow-hidden rounded-lg border border-subtle bg-card text-left transition-colors hover:border-strong"
    >
      <div className="relative w-full bg-card-muted">
        <div className="relative mx-auto w-full max-w-full bg-card p-2">
          {result.imageUrl ? (
            <OptimizedImage
              src={result.imageUrl}
              alt={result.name}
              variant="inventoryThumb"
              className="aspect-square h-full w-full overflow-hidden rounded-lg object-contain"
            />
          ) : (
            <ImagePlaceholder variant="inventory" />
          )}
        </div>
      </div>
      <div className="flex items-start gap-2 px-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 w-full text-sm font-medium">
            {result.name}
          </div>
          <div className="mt-1 w-full text-xs text-foreground-muted">
            <span>{result.partNum}</span>
            {result.categoryName && (
              <span className="ml-1">· {result.categoryName}</span>
            )}
          </div>
          {result.colors.length > 0 && (
            <div className="mt-1 text-2xs text-foreground-muted">
              {result.colors.length} color
              {result.colors.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
