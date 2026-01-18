'use client';

import { buttonVariants } from '@/app/components/ui/Button';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { usePricingEnabled } from '@/app/hooks/usePricingEnabled';
import { formatMinifigId } from '@/app/lib/minifigIds';
import Link from 'next/link';
import type { InventoryRow } from '../types';

export type InventoryItemModalData = {
  row: InventoryRow;
  pricingSource?: 'real_time' | 'historical' | 'unavailable' | null | undefined;
  bricklinkColorId?: number | null | undefined;
  isPricePending?: boolean | undefined;
  canRequestPrice?: boolean | undefined;
  hasPrice?: boolean | undefined;
  hasRange?: boolean | undefined;
  onRequestPrice?: (() => void) | undefined;
};

type Props = {
  open: boolean;
  onClose: () => void;
  data: InventoryItemModalData | null;
};

export function InventoryItemModal({ open, onClose, data }: Props) {
  const pricingEnabled = usePricingEnabled();

  if (!data) return null;

  const {
    row,
    pricingSource,
    bricklinkColorId,
    isPricePending,
    canRequestPrice,
    hasPrice,
    hasRange,
    onRequestPrice,
  } = data;

  // Derive display values from row
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

  return (
    <Modal open={open} onClose={onClose} title={row.partName}>
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
            <ImagePlaceholder
              variant="simple"
              text="No image"
              className="aspect-auto h-24 w-24 rounded border border-subtle"
            />
          )}
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-medium">{row.partName}</p>
            {isMinifig ? (
              <p>{minifigIdDisplay.label}</p>
            ) : (
              <>
                <p>ID: {displayId}</p>
                <p>Color: {row.colorName}</p>
              </>
            )}
          </div>
        </div>
        <div className="space-y-1">
          {pricingEnabled ? (
            <>
              {hasPrice || hasRange ? null : isPricePending ? (
                <p className="text-foreground-muted italic">Fetching price…</p>
              ) : pricingSource === 'unavailable' ? (
                <p className="text-foreground-muted italic">
                  Price unavailable; BrickLink limit hit. Retry after daily
                  reset.
                </p>
              ) : canRequestPrice && onRequestPrice ? (
                <button
                  type="button"
                  className={buttonVariants({ variant: 'link' })}
                  onClick={() => onRequestPrice()}
                >
                  Get BrickLink price
                </button>
              ) : (
                <p className="text-foreground-muted italic">
                  Price unavailable.
                </p>
              )}
            </>
          ) : (
            <div className="text-xs text-foreground-muted italic">
              <p>Price data coming soon</p>
              <p className="text-2xs mt-0.5">
                We&apos;re building a reliable price database
              </p>
            </div>
          )}
        </div>
        <a
          href={bricklinkUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={buttonVariants({ variant: 'link' })}
        >
          View on BrickLink
        </a>
        <Link
          href={identifyHref}
          className={buttonVariants({ variant: 'link' })}
          onClick={event => event.stopPropagation()}
        >
          View more sets with this piece
        </Link>
        {isMinifig && rebrickableFigId && (
          <Link
            href={`/minifigs/${encodeURIComponent(rebrickableFigId)}`}
            className={buttonVariants({ variant: 'secondary', size: 'xs' })}
            onClick={event => event.stopPropagation()}
          >
            Open minifig details
          </Link>
        )}
      </div>
    </Modal>
  );
}
