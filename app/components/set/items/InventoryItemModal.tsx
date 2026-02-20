'use client';

import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { usePricingEnabled } from '@/app/hooks/usePricingEnabled';
import { formatMinifigId } from '@/app/lib/minifigIds';
import { DollarSign, ExternalLink, Layers } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getRarityTier, type InventoryRow } from '../types';
import { RarityBadge } from './RarityBadge';

export type InventoryItemModalData = {
  row: InventoryRow;
  pricingSource?: 'real_time' | 'historical' | 'unavailable' | null | undefined;
  bricklinkColorId?: number | null | undefined;
  isPricePending?: boolean | undefined;
  hasPrice?: boolean | undefined;
  hasRange?: boolean | undefined;
  unitPrice?: number | null | undefined;
  minPrice?: number | null | undefined;
  maxPrice?: number | null | undefined;
  currency?: string | null | undefined;
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

function formatModalPrice(
  value: number,
  currency: string | null | undefined
): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency ?? '$'}${value.toFixed(2)}`;
  }
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
    hasPrice,
    hasRange,
    unitPrice,
    minPrice,
    maxPrice,
    currency,
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
      ...(!isFigId && typeof row.colorId === 'number'
        ? { colorId: row.colorId }
        : {}),
    },
  };

  const blLinkUnavailable = !isFigId && blValidation.status === 'not_found';
  const rarityTier = row.setCount != null ? getRarityTier(row.setCount) : null;

  // Determine if we have stats to show in the grid
  const showPriceCell =
    pricingEnabled &&
    (hasPrice || hasRange || isPricePending || pricingSource === 'unavailable');
  const showSetsCell = row.setCount != null;
  const showStatsGrid = showPriceCell || showSetsCell;

  return (
    <Modal open={open} onClose={onClose} title={row.partName}>
      <div className="-mx-5 -my-5">
        {/* Hero: image + identity */}
        <div className="flex gap-4 px-5 py-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-subtle bg-card-muted">
            {row.imageUrl ? (
              <OptimizedImage
                src={row.imageUrl}
                alt={row.partName}
                variant="inventoryModal"
                className="size-full object-contain"
              />
            ) : (
              <ImagePlaceholder
                variant="simple"
                text="No image"
                className="size-full"
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            {isMinifig ? (
              <p className="text-xs text-foreground-muted">
                Minifigure #{effectiveMinifigId ?? displayId}
              </p>
            ) : (
              <p className="text-xs text-foreground-muted">
                Part {displayId}
                {row.colorName ? ` in ${row.colorName}` : ''}
              </p>
            )}
            {rarityTier && (
              <div>
                <RarityBadge tier={rarityTier} />
              </div>
            )}
          </div>
        </div>

        {/* Stats grid — mirrors MinifigPageClient pattern */}
        {showStatsGrid && (
          <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle">
            {/* Price cell */}
            {showPriceCell && (
              <div className="flex items-center gap-2.5 bg-card px-4 py-3">
                <DollarSign className="size-4 shrink-0 text-foreground-muted" />
                <div className="min-w-0">
                  <div className="text-xs text-foreground-muted">
                    Used Price
                  </div>
                  {hasPrice && unitPrice != null ? (
                    <>
                      <div className="text-sm font-medium">
                        {formatModalPrice(unitPrice, currency)}
                      </div>
                      {hasRange &&
                        minPrice != null &&
                        maxPrice != null &&
                        minPrice !== maxPrice && (
                          <div className="text-xs text-foreground-muted">
                            {formatModalPrice(minPrice, currency)} –{' '}
                            {formatModalPrice(maxPrice, currency)}
                          </div>
                        )}
                    </>
                  ) : isPricePending ? (
                    <div className="text-sm text-foreground-muted">
                      Loading…
                    </div>
                  ) : pricingSource === 'unavailable' ? (
                    <div className="text-sm text-foreground-muted">
                      Unavailable
                    </div>
                  ) : (
                    <div className="text-sm text-foreground-muted">–</div>
                  )}
                </div>
              </div>
            )}

            {/* Sets cell */}
            {showSetsCell && (
              <Link
                href={identifyHref}
                className="flex items-center gap-2.5 bg-card px-4 py-3 transition-colors hover:bg-card-muted"
                onClick={e => e.stopPropagation()}
              >
                <Layers className="size-4 shrink-0 text-foreground-muted" />
                <div>
                  <div className="text-xs text-foreground-muted">
                    {isMinifig ? 'Rarest part in' : 'Appears in'}
                  </div>
                  <div className="text-sm font-medium text-theme-text">
                    {row.setCount} {row.setCount === 1 ? 'set' : 'sets'} →
                  </div>
                </div>
              </Link>
            )}

            {/* If only one cell is shown, add an empty cell to maintain grid */}
            {showPriceCell !== showSetsCell && <div className="bg-card" />}
          </div>
        )}

        {/* External links */}
        <div className="flex gap-px border-t-2 border-subtle bg-subtle">
          {blLinkUnavailable ? (
            <div className="flex flex-1 items-center justify-center bg-card px-3 py-4 text-sm text-foreground-muted italic">
              Not on BrickLink
            </div>
          ) : (
            <a
              href={bricklinkUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
            >
              BrickLink
              <ExternalLink className="size-3.5" />
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
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            Rebrickable
            <ExternalLink className="size-3.5" />
          </a>
          {isMinifig && effectiveMinifigId && (
            <Link
              href={`/minifigs/${encodeURIComponent(effectiveMinifigId)}`}
              className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-theme-text transition-colors hover:bg-card-muted"
              onClick={e => e.stopPropagation()}
            >
              Minifig details →
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}
