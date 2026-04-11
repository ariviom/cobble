'use client';

import { MoreDropdownButton } from '@/app/components/ui/MoreDropdown';
import { KNOCKOUT_SKIP_COLORS, PartCard } from '@/app/components/ui/PartCard';
import { SignInPrompt } from '@/app/components/ui/SignInPrompt';
import { formatMinifigId } from '@/app/lib/minifigIds';
import { Check, ExternalLink, Info, Pin, Search } from 'lucide-react';
import { memo } from 'react';
import type { InventoryRow, RarityTier } from '../types';
import { OwnedQuantityControl } from './OwnedQuantityControl';
import { RarityBadge } from './RarityBadge';

type Props = {
  setNumber: string;
  row: InventoryRow;
  owned: number;
  missing: number;
  bricklinkColorId?: number | null;
  rarityTier?: RarityTier | null;
  onOwnedChange: (next: number) => void;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  onShowMoreInfo?: () => void;
  isAuthenticated?: boolean;
  isInGroupSession?: boolean;
};

function InventoryItemComponent({
  row,
  owned,
  bricklinkColorId,
  rarityTier,
  onOwnedChange,
  isPinned,
  onTogglePinned,
  onShowMoreInfo,
  isAuthenticated = false,
  isInGroupSession = false,
}: Props) {
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
      ...(!isFigId && typeof row.colorId === 'number'
        ? { colorId: row.colorId }
        : {}),
    },
  };
  const handleOpenMoreInfo = () => {
    onShowMoreInfo?.();
  };

  return (
    <PartCard
      partName={row.partName}
      imageUrl={row.imageUrl}
      imageAlt={row.partName}
      onImageClick={handleOpenMoreInfo}
      imageRing={owned === row.quantityRequired ? 'complete' : 'incomplete'}
      skipKnockout={KNOCKOUT_SKIP_COLORS.has(row.colorName)}
      imageBadge={
        owned === row.quantityRequired ? (
          <div className="absolute right-0 bottom-0 flex h-6 min-w-6 translate-x-3 translate-y-1/2 items-center justify-center rounded-full border-2 border-success bg-background text-success grid:h-8 grid:min-w-8 micro:h-5 micro:min-w-5 micro:translate-x-1">
            <Check size={16} strokeWidth={3} />
          </div>
        ) : null
      }
      dropdownItems={
        <>
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
        </>
      }
      subtitleLine={
        isMinifig ? (
          <p>Minifigure {minifigIdDisplay.label}</p>
        ) : (
          <p>
            Part {displayId}
            {row.colorName ? ` in ${row.colorName}` : ''}
          </p>
        )
      }
      rarityBadge={rarityTier ? <RarityBadge tier={rarityTier} /> : undefined}
      quantityArea={
        <div className="w-full sm:list:w-auto">
          <div className="mt-3 mb-2 flex w-full justify-between gap-4 font-medium list:sm:w-36 sm:list:pt-7 micro:mt-1 micro:mb-0.5 micro:gap-1 micro:text-2xs">
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
            <SignInPrompt variant="inline" />
          )}
        </div>
      }
    />
  );
}

function areEqual(prev: Props, next: Props) {
  return (
    prev.setNumber === next.setNumber &&
    prev.row === next.row &&
    prev.owned === next.owned &&
    prev.missing === next.missing &&
    prev.bricklinkColorId === next.bricklinkColorId &&
    prev.rarityTier === next.rarityTier &&
    prev.onOwnedChange === next.onOwnedChange &&
    prev.isPinned === next.isPinned &&
    prev.onTogglePinned === next.onTogglePinned &&
    prev.onShowMoreInfo === next.onShowMoreInfo &&
    prev.isAuthenticated === next.isAuthenticated &&
    prev.isInGroupSession === next.isInGroupSession
  );
}

export const InventoryItem = memo(InventoryItemComponent, areEqual);
