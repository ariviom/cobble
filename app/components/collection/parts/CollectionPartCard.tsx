'use client';

import { MoreDropdownButton } from '@/app/components/ui/MoreDropdown';
import { PartCard } from '@/app/components/ui/PartCard';
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
}: Props) {
  const bricklinkUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(part.partNum)}`;
  const rebrickableUrl = `https://rebrickable.com/parts/${encodeURIComponent(part.partNum)}/${part.colorId}/`;

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
    <PartCard
      partName={part.partName}
      imageUrl={part.imageUrl}
      imageAlt={part.partName}
      onImageClick={() => onShowModal(part)}
      imageRing={isMissingView ? 'missing' : 'neutral'}
      topLeftOverlay={
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
      }
      dropdownItems={
        <>
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
            onClick={() => onShowModal(part)}
          />
        </>
      }
      subtitleLine={
        <>
          <p>
            Part {part.partNum}
            {part.colorName ? ` in ${part.colorName}` : ''}
          </p>
          {part.parentCategory && (
            <p className="mt-0.5 text-xs">{part.parentCategory}</p>
          )}
        </>
      }
      quantityArea={
        <div className="w-full sm:list:w-auto">
          <div className="mt-3 mb-2 flex w-full justify-between gap-4 font-medium list:sm:w-36 sm:list:pt-7 micro:mt-1 micro:mb-0.5 micro:gap-1 micro:text-2xs">
            <p className="text-sm text-foreground-muted">{quantityLabel}</p>
          </div>
        </div>
      }
    />
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
