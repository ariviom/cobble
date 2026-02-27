'use client';

import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { Button } from '@/app/components/ui/Button';
import { DollarSign, ExternalLink, Info, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

type SetDetailModalProps = {
  open: boolean;
  onClose: () => void;
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  year?: number | undefined;
  numParts?: number | undefined;
  themeId?: number | null | undefined;
  themeName?: string | null | undefined;
};

type SetPriceData = {
  total: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  pricingSource: string | null;
};

type PriceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: SetPriceData }
  | { status: 'error' };

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

export function SetDetailModal({
  open,
  onClose,
  setNumber,
  setName,
  imageUrl,
  year,
  numParts,
  themeId,
  themeName,
}: SetDetailModalProps) {
  const [priceState, setPriceState] = useState<PriceState>({ status: 'idle' });
  const fetchedRef = useRef(false);

  const ownership = useSetOwnershipState({
    setNumber,
    name: setName,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

  const bricklinkSetUrl = `https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(setNumber)}`;
  const rebrickableSetUrl = `https://rebrickable.com/sets/${encodeURIComponent(setNumber)}/`;

  // Fetch set price when modal opens
  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;

    let cancelled = false;
    setPriceState({ status: 'loading' });

    fetch('/api/prices/bricklink-set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setNumber }),
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: SetPriceData) => {
        if (cancelled) return;
        setPriceState({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled) return;
        setPriceState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [open, setNumber]);

  // Reset fetch ref when modal closes
  useEffect(() => {
    if (!open) {
      fetchedRef.current = false;
      setPriceState({ status: 'idle' });
    }
  }, [open]);

  const hasPrice =
    priceState.status === 'loaded' && priceState.data.total != null;
  const hasRange =
    priceState.status === 'loaded' &&
    priceState.data.minPrice != null &&
    priceState.data.maxPrice != null &&
    priceState.data.minPrice !== priceState.data.maxPrice;

  return (
    <Modal open={open} onClose={onClose} title={setName}>
      <div className="-mx-5 -my-5">
        {/* Hero: full-width set image */}
        <div className="aspect-square w-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={setName}
              width={400}
              height={400}
              className="size-full object-contain p-4 drop-shadow-sm"
            />
          ) : (
            <ImagePlaceholder variant="thumbnail" className="size-full" />
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle">
          {/* Price cell — fixed height to prevent layout shift during load */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <DollarSign className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Used Price</div>
              {hasPrice && priceState.status === 'loaded' ? (
                <>
                  <div className="text-sm font-medium">
                    {formatModalPrice(
                      priceState.data.total!,
                      priceState.data.currency
                    )}
                  </div>
                  {hasRange && (
                    <div className="text-xs text-foreground-muted">
                      {formatModalPrice(
                        priceState.data.minPrice!,
                        priceState.data.currency
                      )}{' '}
                      –{' '}
                      {formatModalPrice(
                        priceState.data.maxPrice!,
                        priceState.data.currency
                      )}
                    </div>
                  )}
                </>
              ) : priceState.status === 'loading' ||
                priceState.status === 'idle' ? (
                <div className="text-sm text-foreground-muted">Loading…</div>
              ) : priceState.status === 'error' ? (
                <div className="text-sm text-foreground-muted">Unavailable</div>
              ) : (
                <div className="text-sm text-foreground-muted">–</div>
              )}
            </div>
          </div>

          {/* Details cell */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <Info className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Details</div>
              <div className="text-sm font-medium">
                {typeof year === 'number' ? year : '—'}
                {typeof numParts === 'number' && ` · ${numParts} pcs`}
              </div>
              {themeName && (
                <div className="truncate text-xs text-foreground-muted">
                  {themeName}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* External links */}
        <div className="flex gap-px border-t-2 border-subtle bg-subtle">
          <a
            href={bricklinkSetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            BrickLink
            <ExternalLink className="size-3.5" />
          </a>
          <a
            href={rebrickableSetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            Rebrickable
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Ownership row — matches SetDisplayCard bottom pattern */}
        <SetOwnershipAndCollectionsRow ownership={ownership} />

        {/* Open Set CTA */}
        <div className="border-t-2 border-subtle p-3">
          <Button
            href={`/sets/${encodeURIComponent(setNumber)}`}
            variant="primary"
            size="md"
            className="w-full"
          >
            Open Set
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
