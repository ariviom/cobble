'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { MoreDropdown } from '@/app/components/ui/MoreDropdown';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { cn } from '@/app/components/ui/utils';
import type { ReactNode } from 'react';

export type ImageRing =
  | 'complete'
  | 'incomplete'
  | 'missing'
  | 'neutral'
  | 'selected';

/** Colors where the knockout filter would make the part nearly invisible. */
export const KNOCKOUT_SKIP_COLORS = new Set([
  'White',
  'Trans-Clear',
  'Glow In Dark White',
  'Milky White',
  'Pearl White',
  'Satin Trans-Clear',
  'Glitter Trans-Clear',
  'Mx White',
]);

type PartCardProps = {
  // Display
  partName: string;

  // Image
  imageUrl: string | null;
  imageAlt: string;
  onImageClick: () => void;
  imageRing: ImageRing;
  /** Skip the dark-mode knockout filter for light-colored parts */
  skipKnockout?: boolean;

  // Slots
  topLeftOverlay?: ReactNode;
  imageBadge?: ReactNode;
  dropdownItems: ReactNode;
  subtitleLine: ReactNode;
  quantityArea: ReactNode;
  rarityBadge?: ReactNode;
};

const RING_CLASSES: Record<ImageRing, string> = {
  complete: 'ring-2 ring-success',
  incomplete: 'ring-1 ring-foreground-accent',
  neutral: 'ring-1 ring-foreground-accent',
  selected: 'ring-2 ring-theme-text',
  missing: 'ring-1 ring-danger',
};

export function PartCard({
  partName,
  imageUrl,
  imageAlt,
  onImageClick,
  imageRing,
  skipKnockout,
  topLeftOverlay,
  imageBadge,
  dropdownItems,
  subtitleLine,
  quantityArea,
  rarityBadge,
}: PartCardProps) {
  return (
    <div className="grid-collision-container relative flex h-full w-full justify-start gap-6 rounded-lg border border-subtle bg-card p-3 grid:flex-col grid:justify-between micro:flex-col micro:justify-between micro:gap-1 micro:rounded-md micro:p-1.5">
      <MoreDropdown
        ariaLabel="More actions"
        className="absolute top-3 right-3 rounded-full grid:top-4 grid:right-4 grid:z-10 grid:border grid:border-subtle grid:bg-card grid:text-foreground grid:shadow micro:hidden"
      >
        {() => (
          <div className="min-w-min rounded-lg border border-subtle bg-card p-2 text-xs shadow-lg">
            {dropdownItems}
          </div>
        )}
      </MoreDropdown>

      {topLeftOverlay}

      <button
        className="grid-collision-btn relative cursor-pointer list:grow-0 list:items-center grid:aspect-square grid:w-full list:item-sm:size-16 list:item-md:size-20 list:item-lg:size-32 micro:aspect-square micro:w-full"
        role="button"
        tabIndex={0}
        onClick={onImageClick}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onImageClick();
          }
        }}
      >
        <div
          className={cn(
            'grid-collision-img aspect-square h-full w-full overflow-hidden rounded-sm',
            RING_CLASSES[imageRing]
          )}
        >
          {imageUrl ? (
            <OptimizedImage
              src={imageUrl}
              alt={imageAlt}
              variant="inventoryThumb"
              className="mx-auto aspect-square h-full w-full object-contain"
              {...(!skipKnockout ? { 'data-knockout': 'true' } : {})}
            />
          ) : (
            <ImagePlaceholder variant="inventory" />
          )}
        </div>
        {imageBadge}
      </button>

      <div className="flex h-full max-h-min w-full flex-1 flex-col justify-between gap-x-6 gap-y-3 sm:flex-row grid:max-h-full grid:flex-col sm:grid:items-center micro:max-h-full micro:flex-col micro:gap-y-0">
        <div className="h-full w-full list:pr-12 lg:list:pr-0 micro:hidden">
          <p className="line-clamp-1 w-full overflow-hidden font-medium lg:line-clamp-2">
            {partName}
          </p>
          <div className="mt-1 w-full text-sm text-foreground-muted">
            {subtitleLine}
            {rarityBadge && <div className="mt-1">{rarityBadge}</div>}
          </div>
        </div>
        {quantityArea}
      </div>
    </div>
  );
}
