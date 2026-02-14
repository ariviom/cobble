'use client';

import { useAuth } from '@/app/components/providers/auth-provider';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import {
  MoreDropdown,
  MoreDropdownButton,
} from '@/app/components/ui/MoreDropdown';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { formatMinifigId } from '@/app/lib/minifigIds';
import { cn } from '@/app/components/ui/utils';
import { Check, ExternalLink, Info, Pin, Search } from 'lucide-react';
import { memo } from 'react';
import type { InventoryRow } from '../types';
import { OwnedQuantityControl } from './OwnedQuantityControl';

type Props = {
  setNumber: string;
  row: InventoryRow;
  owned: number;
  missing: number;
  bricklinkColorId?: number | null;
  onOwnedChange: (next: number) => void;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  onShowMoreInfo?: () => void;
  isInGroupSession?: boolean;
};

function InventoryItemComponent({
  row,
  owned,
  bricklinkColorId,
  onOwnedChange,
  isPinned,
  onTogglePinned,
  onShowMoreInfo,
  isInGroupSession,
}: Props) {
  const { user, isLoading } = useAuth();
  const isAuthenticated = !!user && !isLoading;
  const isFigId =
    typeof row.partId === 'string' && row.partId.startsWith('fig:');
  const isMinifig = row.parentCategory === 'Minifigure' && isFigId;
  const rebrickableFigId = isFigId
    ? row.partId.replace(/^fig:/, '')
    : undefined;
  const bricklinkFigId = isMinifig ? (row.bricklinkFigId ?? null) : null;
  const effectiveMinifigId = isMinifig
    ? (bricklinkFigId ?? rebrickableFigId)
    : rebrickableFigId;
  // For parts: prefer identity's blPartId, then bricklinkPartId, then partId
  const effectivePartId = isFigId
    ? row.partId
    : (row.identity?.blPartId ?? row.bricklinkPartId ?? row.partId);
  const minifigIdDisplay = formatMinifigId({
    bricklinkId: bricklinkFigId ?? null,
    rebrickableId: rebrickableFigId ?? row.partId,
  });
  const displayId = isFigId ? minifigIdDisplay.displayId : effectivePartId;
  const linkHash =
    !isFigId && typeof bricklinkColorId === 'number'
      ? `#T=S&C=${bricklinkColorId}`
      : '#T=S';
  const bricklinkUrl = isFigId
    ? `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(
        effectiveMinifigId ?? ''
      )}${linkHash}`
    : `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(
        effectivePartId
      )}${linkHash}`;
  const identifyPart = isMinifig
    ? bricklinkFigId
      ? `fig:${bricklinkFigId}`
      : row.partId
    : row.partId;

  const identifyHref = {
    pathname: '/identify',
    query: {
      mode: 'part',
      part: identifyPart,
      ...(typeof bricklinkColorId === 'number' && !isFigId
        ? { blColorId: bricklinkColorId }
        : {}),
    },
  };
  const handleOpenMoreInfo = () => {
    onShowMoreInfo?.();
  };

  return (
    <div className="grid-collision-container relative flex h-full w-full justify-start gap-6 rounded-lg border-2 border-subtle bg-card p-3 grid:flex-col grid:justify-between">
      <MoreDropdown
        ariaLabel="More actions"
        className="absolute top-3 right-3 rounded-full grid:top-4 grid:right-4 grid:z-10 grid:border grid:border-subtle grid:bg-white grid:shadow"
      >
        {() => (
          <div className="min-w-min rounded-md border-2 border-subtle bg-card p-2 text-xs shadow-lg">
            {onTogglePinned && (
              <MoreDropdownButton
                icon={<Pin className="size-4" />}
                label={isPinned ? 'Unpin' : 'Pin'}
                onClick={onTogglePinned}
              />
            )}
            <MoreDropdownButton
              icon={<Search className="size-4" />}
              label="Show sets"
              href={identifyHref}
              onClick={() => {
                // Keep dropdown row click from triggering when following the link
              }}
            />
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
              href={
                isFigId
                  ? `https://rebrickable.com/minifigs/${encodeURIComponent(row.identity?.rbFigNum ?? rebrickableFigId ?? row.partId.replace(/^fig:/, ''))}/`
                  : `https://rebrickable.com/parts/${encodeURIComponent(row.partId)}/${row.colorId != null ? `${row.colorId}/` : ''}`
              }
              target="_blank"
              rel="noreferrer noopener"
            />
            <MoreDropdownButton
              icon={<Info className="size-4" />}
              label="More info"
              onClick={handleOpenMoreInfo}
            />
          </div>
        )}
      </MoreDropdown>
      <button
        className="grid-collision-btn relative cursor-pointer list:grow-0 list:items-center grid:aspect-square grid:w-full list:item-sm:size-16 list:item-md:size-20 list:item-lg:size-32"
        role="button"
        tabIndex={0}
        onClick={handleOpenMoreInfo}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleOpenMoreInfo();
          }
        }}
      >
        <div
          className={cn(
            'grid-collision-img aspect-square h-full w-full overflow-hidden rounded-sm',
            owned === row.quantityRequired
              ? 'ring-2 ring-success'
              : 'ring-1 ring-foreground-accent'
          )}
        >
          {row.imageUrl ? (
            <OptimizedImage
              src={row.imageUrl}
              alt={row.partName}
              variant="inventoryThumb"
              className="mx-auto aspect-square h-full w-full object-contain"
              data-knockout="true"
            />
          ) : (
            <ImagePlaceholder variant="inventory" />
          )}
        </div>
        <div
          className={cn(
            'absolute right-0 bottom-0 flex h-6 min-w-6 translate-x-3 translate-y-1/2 items-center justify-center rounded-full grid:h-8 grid:min-w-8',
            owned === row.quantityRequired &&
              'border-2 border-success bg-background text-success'
          )}
        >
          {owned === row.quantityRequired ? (
            <Check size={16} strokeWidth={3} />
          ) : (
            <span className="hidden border-danger bg-background px-2 text-sm text-danger">
              Need {row.quantityRequired - owned}
            </span>
          )}
        </div>
      </button>
      <div className="flex h-full max-h-min w-full flex-1 flex-col justify-between gap-x-6 gap-y-3 sm:flex-row grid:max-h-full grid:flex-col sm:grid:items-center">
        <div className="h-full w-full list:pr-12 lg:list:pr-0">
          <p className="line-clamp-1 w-full overflow-hidden font-medium lg:line-clamp-2">
            {row.partName}
          </p>
          <div className="mt-1 w-full text-sm text-foreground-muted">
            {isMinifig ? (
              <p>{minifigIdDisplay.label}</p>
            ) : (
              <p>Part ID: {displayId}</p>
            )}
            {!isMinifig && row.colorName && <p>Color: {row.colorName}</p>}
          </div>
        </div>
        <div className="w-full sm:list:w-auto">
          <div className="mt-3 mb-2 flex w-full justify-between gap-4 font-medium list:sm:w-36 sm:list:pt-7">
            <p className="text-foreground-muted">
              {owned}/{row.quantityRequired}
            </p>
            <p
              className={
                row.quantityRequired === owned ? 'text-success' : 'text-danger'
              }
            >
              {row.quantityRequired === owned
                ? 'Complete'
                : `Need ${row.quantityRequired - owned}`}
            </p>
          </div>
          {isAuthenticated || isInGroupSession ? (
            <OwnedQuantityControl
              required={row.quantityRequired}
              owned={owned}
              onChange={onOwnedChange}
            />
          ) : (
            <div className="flex h-12 w-full min-w-min items-center justify-center rounded-lg border-2 border-subtle px-3 text-xs text-foreground-muted">
              Sign in to track inventory
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function areEqual(prev: Props, next: Props) {
  return (
    prev.setNumber === next.setNumber &&
    prev.row === next.row &&
    prev.owned === next.owned &&
    prev.missing === next.missing &&
    prev.bricklinkColorId === next.bricklinkColorId &&
    prev.isPinned === next.isPinned &&
    prev.isInGroupSession === next.isInGroupSession
  );
}

export const InventoryItem = memo(InventoryItemComponent, areEqual);
