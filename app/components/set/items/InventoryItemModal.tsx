'use client';

import { buttonVariants } from '@/app/components/ui/Button';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { usePricingEnabled } from '@/app/hooks/usePricingEnabled';
import { formatMinifigId } from '@/app/lib/minifigIds';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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

type BlValidation =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'valid'; blPartId: string }
  | { status: 'not_found' };

/** Session-level cache so we only validate each BL part ID once per page load. */
const validationCache = new Map<string, 'valid' | 'not_found' | string>();

function useBricklinkValidation(
  blPartId: string | null,
  rbPartId: string | null,
  open: boolean,
  isFigId: boolean
): BlValidation {
  const [state, setState] = useState<BlValidation>({ status: 'idle' });

  useEffect(() => {
    if (!open || isFigId || !blPartId) {
      setState({ status: 'idle' });
      return;
    }

    const cacheKey = `${blPartId}::${rbPartId ?? ''}`;
    const cached = validationCache.get(cacheKey);
    if (cached === 'valid') {
      setState({ status: 'valid', blPartId });
      return;
    }
    if (cached === 'not_found') {
      setState({ status: 'not_found' });
      return;
    }
    if (cached) {
      // Cached corrected ID
      setState({ status: 'valid', blPartId: cached });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    const params = new URLSearchParams({ blPartId });
    if (rbPartId) params.set('rbPartId', rbPartId);

    fetch(`/api/parts/bricklink/validate?${params.toString()}`)
      .then(res => res.json())
      .then((data: { validBlPartId: string | null; corrected: boolean }) => {
        if (cancelled) return;
        if (data.validBlPartId) {
          const cacheValue =
            data.validBlPartId === blPartId ? 'valid' : data.validBlPartId;
          validationCache.set(cacheKey, cacheValue);
          setState({ status: 'valid', blPartId: data.validBlPartId });
        } else {
          validationCache.set(cacheKey, 'not_found');
          setState({ status: 'not_found' });
        }
      })
      .catch(() => {
        if (cancelled) return;
        // On error, show link as-is (don't block the user)
        setState({ status: 'valid', blPartId });
      });

    return () => {
      cancelled = true;
    };
  }, [blPartId, rbPartId, open, isFigId]);

  return state;
}

export function InventoryItemModal({ open, onClose, data }: Props) {
  const pricingEnabled = usePricingEnabled();

  // Derive values needed for validation hook (must be called unconditionally)
  const row = data?.row;
  const bricklinkColorId = data?.bricklinkColorId;
  const isFigId =
    typeof row?.partId === 'string' && row.partId.startsWith('fig:');
  const storedBlPartId = isFigId
    ? null
    : (row?.identity?.blPartId ?? row?.bricklinkPartId ?? null);
  const rbPartId = isFigId ? null : (row?.partId ?? null);

  const blValidation = useBricklinkValidation(
    storedBlPartId,
    rbPartId,
    open,
    isFigId
  );

  if (!data || !row) return null;

  const {
    pricingSource,
    isPricePending,
    canRequestPrice,
    hasPrice,
    hasRange,
    onRequestPrice,
  } = data;

  const isMinifig = row.parentCategory === 'Minifigure' && isFigId;
  const rebrickableFigId = isFigId
    ? row.partId.replace(/^fig:/, '')
    : undefined;
  const bricklinkFigId = isMinifig ? (row.bricklinkFigId ?? null) : null;
  const effectiveMinifigId = isMinifig
    ? (bricklinkFigId ?? rebrickableFigId)
    : rebrickableFigId;

  // For display: use stored BL part ID
  const effectivePartId = isFigId
    ? row.partId
    : (row.identity?.blPartId ?? row.bricklinkPartId ?? row.partId);

  // For BL link: use validated part ID when available
  const validatedPartId =
    !isFigId && blValidation.status === 'valid'
      ? blValidation.blPartId
      : effectivePartId;

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
        validatedPartId
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

  const blLinkUnavailable = !isFigId && blValidation.status === 'not_found';

  return (
    <Modal open={open} onClose={onClose} title={row.partName}>
      <div className="flex flex-col gap-4 text-xs">
        <div className="flex gap-3">
          {row.imageUrl ? (
            <OptimizedImage
              src={row.imageUrl}
              alt={row.partName}
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
        <div className="flex gap-3">
          {blLinkUnavailable ? (
            <p className="text-foreground-muted italic">
              Not available on BrickLink
            </p>
          ) : blValidation.status === 'loading' ? (
            <p className="text-foreground-muted italic">Checking BrickLink…</p>
          ) : (
            <a
              href={bricklinkUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonVariants({ variant: 'link' })}
            >
              BrickLink
            </a>
          )}
          <a
            href={
              isFigId
                ? `https://rebrickable.com/minifigs/${encodeURIComponent(row.identity?.rbFigNum ?? rebrickableFigId ?? row.partId.replace(/^fig:/, ''))}/`
                : `https://rebrickable.com/parts/${encodeURIComponent(row.partId)}/${row.colorId != null ? `${row.colorId}/` : ''}`
            }
            target="_blank"
            rel="noreferrer noopener"
            className={buttonVariants({ variant: 'link' })}
          >
            Rebrickable
          </a>
        </div>
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
