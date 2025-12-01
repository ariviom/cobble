'use client';

import { Modal } from '@/app/components/ui/Modal';
import {
  MoreDropdown,
  MoreDropdownButton,
} from '@/app/components/ui/MoreDropdown';
import { Info, Pin, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { InventoryRow } from '../types';
import { OwnedQuantityControl } from './OwnedQuantityControl';

function formatCurrency(amount: number, currencyCode: string): string {
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
    });
    return formatter.format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

type Props = {
  setNumber: string;
  row: InventoryRow;
  owned: number;
  missing: number;
  unitPrice?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  currency?: string | null;
  pricingScopeLabel?: string | null;
  bricklinkColorId?: number | null;
  isPricePending?: boolean;
  canRequestPrice?: boolean;
  onOwnedChange: (next: number) => void;
  isPinned?: boolean;
  onTogglePinned?: () => void;
  onRequestPrice?: () => void;
};

export function InventoryItem({
  setNumber,
  row,
  owned,
  unitPrice,
  minPrice,
  maxPrice,
  currency,
  pricingScopeLabel,
  bricklinkColorId,
  isPricePending,
  onOwnedChange,
  isPinned,
  onTogglePinned,
  canRequestPrice,
  onRequestPrice,
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
  const displayId = isFigId
    ? (bricklinkFigId ?? rebrickableFigId ?? row.partId)
    : row.partId;
  const linkHash =
    !isFigId && typeof bricklinkColorId === 'number'
      ? `#T=S&C=${bricklinkColorId}`
      : '#T=S';
  const bricklinkUrl = isFigId
    ? `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(
        effectiveMinifigId ?? ''
      )}${linkHash}`
    : `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(
        displayId
      )}${linkHash}`;
  const hasPrice = typeof unitPrice === 'number' && Number.isFinite(unitPrice);
  const hasRange =
    typeof minPrice === 'number' &&
    Number.isFinite(minPrice) &&
    typeof maxPrice === 'number' &&
    Number.isFinite(maxPrice) &&
    maxPrice >= minPrice;
  const currencyCode = currency ?? 'USD';
  const identifyHref = {
    pathname: '/identify',
    query: {
      mode: 'part',
      part: row.partId,
      ...(typeof bricklinkColorId === 'number' && !isFigId
        ? { blColorId: bricklinkColorId }
        : {}),
    },
  };
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [hasRequestedPrice, setHasRequestedPrice] = useState(false);

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
          className="absolute top-3 right-3 z-50"
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
              {isMinifig && (
                <a
                  href={`https://www.bricklink.com/catalogItemInv.asp?S=${encodeURIComponent(
                    setNumber
                  )}&viewItemType=M`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex w-full flex-row items-center gap-1 rounded border-r-0 bg-card px-3 py-2 text-xs text-foreground-muted hover:bg-card-muted"
                  onClick={event => event.stopPropagation()}
                >
                  <Users className="size-4" />
                  <span>View set minifigures</span>
                </a>
              )}
              <MoreDropdownButton
                icon={<Info className="size-4" />}
                label="More info"
                onClick={handleOpenMoreInfo}
              />
            </div>
          )}
        </MoreDropdown>
        <div
          className={`relative list:grow-0 list:items-center grid:w-full list:item-sm:size-16 list:item-md:size-20 list:item-lg:size-32`}
        >
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.imageUrl}
              alt=""
              className={`mx-auto h-full w-full rounded-lg object-contain grid:item-sm:max-w-24 ${owned === row.quantityRequired ? 'ring-2 ring-brand-green' : 'ring-1 ring-foreground-accent'}`}
              data-knockout="true"
            />
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
        </div>
        <div className="flex h-full max-h-min w-full flex-1 flex-col justify-between gap-x-6 gap-y-3 sm:flex-row sm:items-center grid:flex-col">
          <div className="h-full w-full list:pr-12 lg:list:pr-0">
            <p className="line-clamp-1 w-full overflow-hidden font-medium lg:line-clamp-2">
              {row.partName}
            </p>
            <div className="mt-1 w-full text-sm text-foreground-muted">
              {isMinifig ? (
                <p>
                  BrickLink ID:{' '}
                  {bricklinkFigId ? (
                    <span>{bricklinkFigId}</span>
                  ) : (
                    <span className="text-foreground-muted">ID Missing</span>
                  )}
                </p>
              ) : (
                <p>Part ID: {displayId}</p>
              )}
              {!isMinifig && row.colorName && <p>Color: {row.colorName}</p>}
              {hasPrice ? (
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
                </p>
              ) : isPricePending ? (
                <p className="text-foreground-muted italic">Fetching price…</p>
              ) : null}
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
            <OwnedQuantityControl
              required={row.quantityRequired}
              owned={owned}
              onChange={onOwnedChange}
            />
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.imageUrl}
                alt={row.partName}
                className="h-24 w-24 rounded border border-subtle object-contain"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded border border-subtle text-foreground-muted">
                No image
              </div>
            )}
            <div className="flex flex-1 flex-col gap-1">
              <p className="text-sm font-medium">{row.partName}</p>
              <p>ID: {displayId}</p>
              <p>Color: {row.colorName}</p>
            </div>
          </div>
          <div className="space-y-1">
            {hasPrice ? (
              <p>
                Estimated price:{' '}
                <a
                  href={bricklinkUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline hover:text-theme-primary"
                >
                  {hasRange
                    ? `${formatCurrency(
                        minPrice as number,
                        currencyCode
                      )} – ${formatCurrency(maxPrice as number, currencyCode)}`
                    : formatCurrency(unitPrice as number, currencyCode)}
                </a>
              </p>
            ) : isPricePending ? (
              <p className="text-foreground-muted italic">Fetching price…</p>
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
        </div>
      </Modal>
    </>
  );
}
