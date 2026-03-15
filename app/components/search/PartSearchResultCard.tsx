'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import type { PartSearchResult } from '@/app/types/search';
import { useRef, useState, useLayoutEffect } from 'react';

type Props = {
  result: PartSearchResult;
  onClick: () => void;
};

/** Max swatches to render before measuring overflow. */
const MAX_SWATCHES = 40;

function ColorSwatchRow({ colors }: { colors: PartSearchResult['colors'] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(colors.length);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Measure which swatches fit in one line
    const children = Array.from(container.children) as HTMLElement[];
    if (children.length === 0) return;

    const containerTop = children[0]!.offsetTop;
    let lastVisible = 0;
    for (let i = 0; i < children.length; i++) {
      // Skip the "+X" indicator element (last child when overflow)
      if (children[i]!.dataset.overflow) break;
      if (children[i]!.offsetTop > containerTop) break;
      lastVisible = i + 1;
    }
    // Reserve space for the "+X" badge if we're truncating
    if (lastVisible < colors.length && lastVisible > 0) {
      setVisibleCount(lastVisible - 1);
    } else {
      setVisibleCount(lastVisible);
    }
  }, [colors.length]);

  const displayed = colors.slice(0, Math.min(visibleCount, MAX_SWATCHES));
  const overflow = colors.length - displayed.length;

  return (
    <div
      ref={containerRef}
      className="mt-1.5 flex flex-wrap items-center gap-1 overflow-hidden"
      style={{ maxHeight: '1.25rem' }}
    >
      {colors.slice(0, MAX_SWATCHES).map(c => (
        <div
          key={c.colorId}
          className="size-3.5 shrink-0 rounded-full border border-black/10"
          style={{
            backgroundColor: c.rgb ? `#${c.rgb}` : '#ccc',
            visibility: displayed.find(d => d.colorId === c.colorId)
              ? 'visible'
              : 'hidden',
            position: displayed.find(d => d.colorId === c.colorId)
              ? 'static'
              : 'absolute',
          }}
          title={c.colorName}
        />
      ))}
      {overflow > 0 && (
        <span
          data-overflow="true"
          className="shrink-0 text-2xs text-foreground-muted"
        >
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
