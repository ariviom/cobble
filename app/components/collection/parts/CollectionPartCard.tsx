'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import {
  MoreDropdown,
  MoreDropdownButton,
} from '@/app/components/ui/MoreDropdown';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { cn } from '@/app/components/ui/utils';
import { ExternalLink, Info, Square, SquareCheck } from 'lucide-react';
import { memo } from 'react';
import type { CollectionPart } from './types';

type Props = {
  part: CollectionPart;
  onShowModal: (part: CollectionPart) => void;
  isSelected: boolean;
  onToggleSelection: () => void;
  isCheckboxDisabled: boolean;
  onCheckboxDisabledClick?: () => void;
  isMissingView?: boolean;
  missingQuantity?: number;
  view: 'list' | 'grid' | 'micro';
  itemSize: 'sm' | 'md' | 'lg';
};

function CollectionPartCardComponent({
  part,
  onShowModal,
  isSelected,
  onToggleSelection,
  isCheckboxDisabled,
  onCheckboxDisabledClick,
  isMissingView = false,
  missingQuantity,
  view: _view,
  itemSize: _itemSize,
}: Props) {
  const bricklinkUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(part.partNum)}`;
  const rebrickableUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/${part.colorId}/`;

  const handleOpenModal = () => {
    onShowModal(part);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCheckboxDisabled) {
      onCheckboxDisabledClick?.();
    } else {
      onToggleSelection();
    }
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (isCheckboxDisabled) {
        onCheckboxDisabledClick?.();
      } else {
        onToggleSelection();
      }
    }
  };

  const quantityLabel = isMissingView
    ? `Need ${missingQuantity ?? 0}`
    : `Owned: ${part.totalOwned} | Loose: ${part.looseQuantity}`;

  return (
    <div className="grid-collision-container relative flex h-full w-full justify-start gap-6 rounded-lg border border-subtle bg-card p-3 grid:flex-col grid:justify-between micro:flex-col micro:justify-between micro:gap-1 micro:rounded-md micro:p-1.5">
      <MoreDropdown
        ariaLabel="More actions"
        className="absolute top-3 right-3 rounded-full grid:top-4 grid:right-4 grid:z-10 grid:border grid:border-subtle grid:bg-card grid:text-foreground grid:shadow grid:hero-input-light micro:hidden"
      >
        {() => (
          <div className="min-w-min rounded-lg border border-subtle bg-card p-2 text-xs shadow-lg">
            <MoreDropdownButton
              icon={<ExternalLink className="size-4" />}
              label="BrickLink"
              href={bricklinkUrl}
              target="_blank"
              rel="noreferrer noopener"
            />
            <MoreDropdownButton
              icon={<ExternalLink className="size-4" />}
              label="Rebrickable"
              href={rebrickableUrl}
              target="_blank"
              rel="noreferrer noopener"
            />
            <MoreDropdownButton
              icon={<Info className="size-4" />}
              label="More info"
              onClick={handleOpenModal}
            />
          </div>
        )}
      </MoreDropdown>

      {/* Checkbox — top-left overlay */}
      <button
        type="button"
        aria-label={isSelected ? 'Deselect part' : 'Select part'}
        aria-checked={isSelected}
        role="checkbox"
        className={cn(
          'absolute top-3 left-3 z-10 flex items-center justify-center rounded grid:top-4 grid:left-4 micro:hidden',
          isCheckboxDisabled
            ? 'cursor-not-allowed opacity-40'
            : 'cursor-pointer'
        )}
        onClick={handleCheckboxClick}
        onKeyDown={handleCheckboxKeyDown}
        tabIndex={0}
      >
        {isSelected ? (
          <SquareCheck className="size-5 text-theme-primary" />
        ) : (
          <Square className="size-5 text-foreground-muted" />
        )}
      </button>

      {/* Image button */}
      <button
        className="grid-collision-btn relative cursor-pointer list:grow-0 list:items-center grid:aspect-square grid:w-full list:item-sm:size-16 list:item-md:size-20 list:item-lg:size-32 micro:aspect-square micro:w-full"
        role="button"
        tabIndex={0}
        onClick={handleOpenModal}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenModal();
          }
        }}
      >
        <div className="grid-collision-img aspect-square h-full w-full overflow-hidden rounded-sm ring-1 ring-foreground-accent">
          {part.imageUrl ? (
            <OptimizedImage
              src={part.imageUrl}
              alt={part.partName}
              variant="inventoryThumb"
              className="mx-auto aspect-square h-full w-full object-contain"
              data-knockout="true"
            />
          ) : (
            <ImagePlaceholder variant="inventory" />
          )}
        </div>
      </button>

      {/* Metadata */}
      <div className="flex h-full max-h-min w-full flex-1 flex-col justify-between gap-x-6 gap-y-3 sm:flex-row grid:max-h-full grid:flex-col sm:grid:items-center micro:max-h-full micro:flex-col micro:gap-y-0">
        <div className="h-full w-full list:pr-12 lg:list:pr-0 micro:hidden">
          <p className="line-clamp-1 w-full overflow-hidden font-medium lg:line-clamp-2">
            {part.partName}
          </p>
          <div className="mt-1 w-full text-sm text-foreground-muted">
            <p>
              Part {part.partNum}
              {part.colorName ? ` in ${part.colorName}` : ''}
            </p>
            {part.parentCategory && (
              <p className="mt-0.5 text-xs">{part.parentCategory}</p>
            )}
          </div>
        </div>

        <div className="w-full sm:list:w-auto">
          <div className="mt-3 mb-2 flex w-full justify-between gap-4 font-medium list:sm:w-36 sm:list:pt-7 micro:mt-1 micro:mb-0.5 micro:gap-1 micro:text-2xs">
            <p className="text-sm text-foreground-muted">{quantityLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function areEqual(prev: Props, next: Props) {
  return (
    prev.part === next.part &&
    prev.isSelected === next.isSelected &&
    prev.isCheckboxDisabled === next.isCheckboxDisabled &&
    prev.onCheckboxDisabledClick === next.onCheckboxDisabledClick &&
    prev.isMissingView === next.isMissingView &&
    prev.missingQuantity === next.missingQuantity &&
    prev.view === next.view &&
    prev.itemSize === next.itemSize &&
    prev.onShowModal === next.onShowModal &&
    prev.onToggleSelection === next.onToggleSelection
  );
}

export const CollectionPartCard = memo(CollectionPartCardComponent, areEqual);
