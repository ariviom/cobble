'use client';

import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { Modal } from '@/app/components/ui/Modal';
import { UpgradeModal } from '@/app/components/upgrade-modal';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { useOpenSet } from '@/app/hooks/useOpenSet';
import { Button } from '@/app/components/ui/Button';
import { formatCurrency } from '@/app/lib/utils/formatCurrency';
import { ModalExternalLinks } from '@/app/components/ui/ModalExternalLinks';
import {
  getBricklinkSetUrl,
  getRebrickableSetUrl,
} from '@/app/lib/utils/externalUrls';
import { useSetPrice } from '@/app/hooks/useSetPrice';
import { DollarSign, ExternalLink, Info, ArrowRight, Eye } from 'lucide-react';
import Image from 'next/image';

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
  /** When set, hides "Open Set" if this matches setNumber (already on that inventory). */
  activeSetNumber?: string | null;
};

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
  activeSetNumber,
}: SetDetailModalProps) {
  const {
    openSet,
    showUpgradeModal,
    dismissUpgradeModal,
    continueFromUpgradeModal,
    gateFeature,
  } = useOpenSet();
  const isCurrentSet =
    activeSetNumber != null &&
    activeSetNumber.toLowerCase() === setNumber.toLowerCase();

  const ownership = useSetOwnershipState({
    setNumber,
    name: setName,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

  const bricklinkSetUrl = getBricklinkSetUrl(setNumber);
  const rebrickableSetUrl = getRebrickableSetUrl(setNumber);

  const {
    data: priceData,
    isLoading: priceLoading,
    isError: priceError,
  } = useSetPrice(setNumber, open);

  const hasPrice = priceData?.total != null;
  const hasRange =
    priceData?.minPrice != null &&
    priceData?.maxPrice != null &&
    priceData.minPrice !== priceData.maxPrice;

  return (
    <>
      <Modal open={open} onClose={onClose} title={setName}>
        <div className="-mx-5 -my-5">
          {/* Hero: full-width set image */}
          <div className="aspect-4/3 w-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={setName}
                width={400}
                height={300}
                className="size-full object-contain p-4 drop-shadow-sm"
              />
            ) : (
              <ImagePlaceholder variant="fill" />
            )}
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle">
            {/* Price cell — fixed height to prevent layout shift during load */}
            <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
              <DollarSign className="size-4 shrink-0 text-foreground-muted" />
              <div className="min-w-0">
                <div className="text-xs text-foreground-muted">Used Price</div>
                {hasPrice ? (
                  <>
                    <div className="text-sm font-medium">
                      {formatCurrency(priceData.total!, priceData.currency)}
                    </div>
                    {hasRange && (
                      <div className="text-xs text-foreground-muted">
                        {formatCurrency(
                          priceData.minPrice!,
                          priceData.currency
                        )}{' '}
                        –{' '}
                        {formatCurrency(
                          priceData.maxPrice!,
                          priceData.currency
                        )}
                      </div>
                    )}
                  </>
                ) : priceLoading ? (
                  <div className="text-sm text-foreground-muted">Loading…</div>
                ) : priceError ? (
                  <div className="text-sm text-foreground-muted">
                    Unavailable
                  </div>
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
                  {typeof numParts === 'number' && ` | ${numParts} pcs`}
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
          <ModalExternalLinks
            links={[
              {
                href: bricklinkSetUrl,
                label: 'BrickLink',
                icon: <ExternalLink className="size-3.5" />,
              },
              {
                href: rebrickableSetUrl,
                label: 'Rebrickable',
                icon: <ExternalLink className="size-3.5" />,
              },
            ]}
          />

          {/* Ownership row — matches SetDisplayCard bottom pattern */}
          <SetOwnershipAndCollectionsRow ownership={ownership} />

          {/* CTA buttons */}
          <div className="flex flex-col gap-2 border-t-2 border-subtle p-3">
            <Button
              href={`/sets/${encodeURIComponent(setNumber)}`}
              variant="secondary"
              size="md"
              className="w-full"
            >
              <Eye className="size-4" />
              Set Overview
            </Button>
            {!isCurrentSet && (
              <Button
                variant="primary"
                size="md"
                className="w-full"
                onClick={() => {
                  onClose();
                  openSet({
                    setNumber,
                    name: setName,
                    year: year ?? 0,
                    imageUrl,
                    numParts: numParts ?? 0,
                    themeId: themeId ?? null,
                    themeName: themeName ?? null,
                  });
                }}
              >
                Open Set
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </Modal>
      <UpgradeModal
        open={showUpgradeModal}
        feature={gateFeature}
        onClose={dismissUpgradeModal}
        onContinue={continueFromUpgradeModal}
      />
    </>
  );
}
