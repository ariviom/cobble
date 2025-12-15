'use client';

import { Modal } from '@/app/components/ui/Modal';
import {
  MoreDropdown,
  MoreDropdownButton,
} from '@/app/components/ui/MoreDropdown';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { formatMinifigId } from '@/app/lib/minifigIds';
import { useAuth } from '@/app/components/providers/auth-provider';
import { ExternalLink, Info, Pin, Search } from 'lucide-react';
import Link from 'next/link';
import { memo, useEffect, useState } from 'react';
import type { InventoryRow } from '../types';
import { OwnedQuantityControl } from './OwnedQuantityControl';

type Props = {
  setNumber: string;
  row: InventoryRow;
  owned: number;
  missing: number;
  unitPrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  // pricing fields kept for future expansion; currently unused in this component
  currency?: string | null;
  pricingSource?: 'real_time' | 'historical' | 'unavailable' | null;
  pricingScopeLabel?: string | null;
  bricklinkColorId?: number | null;
  isPricePending?: boolean;
  canRequestPrice?: boolean;
  onOwnedChange: (next: number) => void;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  onRequestPrice?: () => void;
  /** Whether minifig enrichment is currently running (for loading states) */
  isEnriching?: boolean;
};

function InventoryItemComponent({
  row,
  owned,
  unitPrice,
  minPrice,
  maxPrice,
  pricingSource,
  bricklinkColorId,
  isPricePending,
  onOwnedChange,
  isPinned,
  onTogglePinned,
  canRequestPrice,
  onRequestPrice,
  isEnriching = false,
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
  // For parts: use bricklinkPartId if available, otherwise fall back to partId
  const effectivePartId = isFigId
    ? row.partId
    : (row.bricklinkPartId ?? row.partId);
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
  const hasPrice = typeof unitPrice === 'number' && Number.isFinite(unitPrice);
  const hasRange =
    typeof minPrice === 'number' &&
    Number.isFinite(minPrice) &&
    typeof maxPrice === 'number' &&
    Number.isFinite(maxPrice) &&
    maxPrice >= minPrice;
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
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [hasRequestedPrice, setHasRequestedPrice] = useState(false);
  const showImageLoader = isEnriching && isMinifig && !row.imageUrl;

  const handleOpenMoreInfo = () => {
    setShowMoreInfo(true);
  };

  useEffect(() => {
    if (!showMoreInfo) {
      setHasRequestedPrice(false);
      return;
    }
    if (
      hasPrice ||
      hasRange ||
      isPricePending ||
      !canRequestPrice ||
      !onRequestPrice ||
      hasRequestedPrice
    ) {
      return;
    }
    onRequestPrice();
    setHasRequestedPrice(true);
  }, [
    showMoreInfo,
    hasPrice,
    hasRange,
    isPricePending,
    canRequestPrice,
    onRequestPrice,
    hasRequestedPrice,
  ]);
  return (
    <>
      <div className="relative flex w-full justify-start gap-6 rounded-lg border border-subtle bg-card p-4 grid:flex-col">
        <MoreDropdown
          ariaLabel="More actions"
          className="absolute top-3 right-3"
        >
          {() => (
            <div className="min-w-min rounded-md border border-subtle bg-card py-1 text-xs shadow-lg">
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
                label="View on BrickLink"
                href={bricklinkUrl}
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
          className={`relative cursor-pointer list:grow-0 list:items-center grid:w-full list:item-sm:size-16 list:item-md:size-20 list:item-lg:size-32`}
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
          {row.imageUrl ? (
            <OptimizedImage
              src={row.imageUrl}
              alt={row.partName}
              loading="lazy"
              variant="inventoryThumb"
              className={`mx-auto h-full w-full rounded-lg object-contain grid:item-sm:max-w-24 ${owned === row.quantityRequired ? 'ring-2 ring-brand-green' : 'ring-1 ring-foreground-accent'}`}
              data-knockout="true"
            />
          ) : showImageLoader ? (
            <div className="h-full w-full animate-pulse rounded-lg bg-card-muted" />
          ) : (
            <div className="text-xs text-foreground-muted">No Image</div>
          )}
          <div
            className={`absolute right-0 bottom-0 flex h-6 min-w-6 translate-x-3 translate-y-1/2 items-center justify-center rounded-full grid:h-8 grid:min-w-8 ${owned === row.quantityRequired ? 'border-2 border-brand-green bg-background text-brand-green' : ''}`}
          >
            {owned === row.quantityRequired ? (
              <svg
                x="0"
                y="0"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12.5 4L5.5 11L2.5 8"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <span className="hidden border-brand-red bg-background px-2 text-sm text-brand-red">
                Need {row.quantityRequired - owned}
              </span>
            )}
          </div>
        </button>
        <div className="flex h-full max-h-min w-full flex-1 flex-col justify-between gap-x-6 gap-y-3 sm:flex-row grid:flex-col sm:grid:items-center">
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
              {/* {hasPrice ? (
                <p>
                  Estimated price{' '}
                  {formatCurrency(
                    hasRange ? (minPrice as number) : (unitPrice as number),
                    currencyCode
                  )}
                  {hasRange
                    ? ` – ${formatCurrency(maxPrice as number, currencyCode)}`
                    : ''}
                  {pricingScopeLabel ? ` (${pricingScopeLabel})` : ''}
                  {pricingBadge ? (
                    <span className="ml-2 inline-flex items-center rounded-full bg-foreground-muted/10 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-foreground-muted uppercase">
                      {pricingBadge}
                    </span>
                  ) : null}
                </p>
              ) : isPricePending ? (
                <p className="text-foreground-muted italic">Fetching price…</p>
              ) : pricingSource === 'unavailable' ? (
                <p className="text-foreground-muted italic">
                  Price unavailable; BrickLink limit hit. Retry after daily
                  reset.
                </p>
              ) : null} */}
            </div>
          </div>
          <div className="w-full sm:list:w-auto">
            <div className="mt-3 mb-2 flex w-full justify-between gap-4 font-medium list:sm:w-36 sm:list:pt-7">
              <p className="text-foreground-muted">
                {owned}/{row.quantityRequired}
              </p>
              <p
                className={
                  row.quantityRequired === owned
                    ? 'text-brand-green'
                    : 'text-brand-red'
                }
              >
                {row.quantityRequired === owned
                  ? 'Complete'
                  : `Need ${row.quantityRequired - owned}`}
              </p>
            </div>
            {isAuthenticated ? (
              <OwnedQuantityControl
                required={row.quantityRequired}
                owned={owned}
                onChange={onOwnedChange}
              />
            ) : (
              <div className="flex h-12 w-full min-w-min items-center justify-center rounded-lg border border-subtle px-3 text-xs text-foreground-muted">
                Sign in to track inventory
              </div>
            )}
          </div>
        </div>
      </div>
      <Modal
        open={showMoreInfo}
        onClose={() => setShowMoreInfo(false)}
        title={row.partName}
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="flex gap-3">
            {row.imageUrl ? (
              <OptimizedImage
                src={row.imageUrl}
                alt={row.partName}
                loading="lazy"
                variant="inventoryModal"
                className="h-24 w-24 rounded border border-subtle object-contain"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-subtle text-foreground-muted">
                No image
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1">
              <p className="text-sm font-medium">{row.partName}</p>
              {isMinifig ? (
                <>
                  <p>{minifigIdDisplay.label}</p>
                </>
              ) : (
                <>
                  <p>ID: {displayId}</p>
                  <p>Color: {row.colorName}</p>
                </>
              )}
            </div>
          </div>
          <div className="space-y-1">
            {hasPrice ? null : isPricePending ? (
              <p className="text-foreground-muted italic">Fetching price…</p>
            ) : pricingSource === 'unavailable' ? (
              <p className="text-foreground-muted italic">
                Price unavailable; BrickLink limit hit. Retry after daily reset.
              </p>
            ) : canRequestPrice && onRequestPrice ? (
              <button
                type="button"
                className="underline hover:text-theme-primary"
                onClick={() => onRequestPrice()}
              >
                Get BrickLink price
              </button>
            ) : (
              <p className="text-foreground-muted italic">Price unavailable.</p>
            )}
          </div>
          <a
            href={bricklinkUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-theme-primary underline"
          >
            View on BrickLink
          </a>
          <Link
            href={identifyHref}
            className="text-theme-primary underline"
            onClick={event => event.stopPropagation()}
          >
            View more sets with this piece
          </Link>
          {isMinifig && rebrickableFigId && (
            <Link
              href={`/minifigs/id/${encodeURIComponent(rebrickableFigId)}`}
              className="inline-flex items-center justify-center rounded-md border border-subtle bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-card-muted"
              onClick={event => event.stopPropagation()}
            >
              Open minifig details
            </Link>
          )}
        </div>
      </Modal>
    </>
  );
}

function areEqual(prev: Props, next: Props) {
  return (
    prev.setNumber === next.setNumber &&
    prev.row === next.row &&
    prev.owned === next.owned &&
    prev.missing === next.missing &&
    prev.unitPrice === next.unitPrice &&
    prev.minPrice === next.minPrice &&
    prev.maxPrice === next.maxPrice &&
    prev.pricingSource === next.pricingSource &&
    prev.bricklinkColorId === next.bricklinkColorId &&
    prev.isPricePending === next.isPricePending &&
    prev.isPinned === next.isPinned &&
    prev.canRequestPrice === next.canRequestPrice &&
    prev.isEnriching === next.isEnriching
  );
}

export const InventoryItem = memo(InventoryItemComponent, areEqual);
