'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import type { PartSearchResult } from '@/app/types/search';

type Props = {
  result: PartSearchResult;
  onClick: () => void;
};

const MAX_VISIBLE_SWATCHES = 8;

function ColorSwatchRow({ colors }: { colors: PartSearchResult['colors'] }) {
  const displayed = colors.slice(0, MAX_VISIBLE_SWATCHES);
  const overflow = colors.length - displayed.length;

  return (
    <div className="mt-1.5 flex items-center gap-1">
      {displayed.map(c => (
        <div
          key={c.colorId}
          className="size-4 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: c.rgb ? `#${c.rgb}` : '#ccc' }}
          title={c.colorName}
        />
      ))}
      {overflow > 0 && (
        <span className="shrink-0 text-xs text-foreground-muted">
          +{overflow}
        </span>
      )}
    </div>
  );
}

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
            <ColorSwatchRow colors={result.colors} />
          )}
        </div>
      </div>
    </button>
  );
}
