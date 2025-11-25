'use client';

import { Pin } from 'lucide-react';
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
  const displayId = isFigId ? row.partId.replace(/^fig:/, '') : row.partId;
  const hasRealFigId =
    isFigId &&
    typeof displayId === 'string' &&
    !displayId.startsWith('unknown-');
  const linkHash =
    !isFigId && typeof bricklinkColorId === 'number'
      ? `#T=S&C=${bricklinkColorId}`
      : '#T=S';
  const bricklinkUrl = isFigId
    ? `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(displayId)}${linkHash}`
    : `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(displayId)}${linkHash}`;
  const hasPrice = typeof unitPrice === 'number' && Number.isFinite(unitPrice);
  const hasRange =
    typeof minPrice === 'number' &&
    Number.isFinite(minPrice) &&
    typeof maxPrice === 'number' &&
    Number.isFinite(maxPrice) &&
    maxPrice >= minPrice;
  const currencyCode = currency ?? 'USD';
  return (
    <div className="relative flex w-full justify-start gap-6 rounded-lg border border-neutral-200 bg-background p-4 grid:flex-col">
      {onTogglePinned ? (
        <button
          type="button"
          aria-label={isPinned ? 'Unpin piece' : 'Pin piece'}
          aria-pressed={isPinned ? 'true' : 'false'}
          className={`absolute top-3 right-4 z-10 inline-flex size-9 cursor-pointer items-center justify-center rounded-full border text-xs ${
            isPinned
              ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
              : 'border-neutral-300 bg-background text-neutral-500 hover:bg-neutral-100'
          }`}
          onClick={event => {
            event.stopPropagation();
            onTogglePinned();
          }}
        >
          <div className="absolute top-1/2 left-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 pointer-fine:hidden"></div>
          <Pin size={18} />
        </button>
      ) : null}
      <div
        className={`relative overflow-hidden rounded-lg border border-foreground-accent list:grow-0 list:items-center grid:w-full list:item-sm:size-16 list:item-md:size-20 list:item-lg:size-32`}
      >
        {row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            className={`mx-auto h-full w-full object-contain grid:item-sm:max-w-24 ${owned === row.quantityRequired ? 'ring-2 ring-brand-green' : ''}`}
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
        <div className="h-full list:pr-12 lg:list:pr-0">
          <p className="line-clamp-1 w-full overflow-hidden font-medium lg:line-clamp-2">
            {row.partName}
          </p>
          <div className="mt-1 w-full text-sm text-neutral-400">
            {isMinifig ? (
              hasRealFigId ? (
                <p className="flex flex-col text-sm">
                  <span>Minifigure ID: {displayId}</span>
                  <a
                    href={`https://www.bricklink.com/catalogItemInv.asp?S=${encodeURIComponent(
                      setNumber
                    )}&viewItemType=M`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline hover:text-brand-blue"
                    onClick={event => {
                      event.stopPropagation();
                    }}
                  >
                    View set minifigs
                  </a>
                </p>
              ) : null
            ) : (
              <p className="flex flex-col text-sm">
                <span>
                  {displayId} | {row.colorName}
                </span>
                <span>
                  {hasRange ? (
                    <>
                      <a
                        href={bricklinkUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline hover:text-brand-blue"
                      >
                        {formatCurrency(minPrice as number, currencyCode)} –{' '}
                        {formatCurrency(maxPrice as number, currencyCode)}
                      </a>
                    </>
                  ) : hasPrice ? (
                    <>
                      <a
                        href={bricklinkUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline hover:text-brand-blue"
                      >
                        {formatCurrency(unitPrice as number, currencyCode)}
                      </a>
                    </>
                  ) : isPricePending ? (
                    <>
                      <span className="text-neutral-400 italic">
                        Getting price…
                      </span>
                    </>
                  ) : canRequestPrice && onRequestPrice ? (
                    <>
                      <button
                        type="button"
                        className="underline hover:text-brand-blue"
                        onClick={event => {
                          event.stopPropagation();
                          onRequestPrice();
                        }}
                      >
                        Get price
                      </button>
                    </>
                  ) : null}
                </span>
              </p>
            )}
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
  );
}
