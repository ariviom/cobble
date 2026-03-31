'use client';

import { MinifigCard } from '@/app/components/minifig/MinifigCard';
import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { PublicSetCard } from '@/app/components/set/PublicSetCard';
import { Button } from '@/app/components/ui/Button';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { ModalExternalLinks } from '@/app/components/ui/ModalExternalLinks';
import { UpgradeModal } from '@/app/components/upgrade-modal';
import { useOpenSet } from '@/app/hooks/useOpenSet';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { formatCurrency } from '@/app/lib/utils/formatCurrency';
import {
  getBricklinkSetUrl,
  getRebrickableSetUrl,
} from '@/app/lib/utils/externalUrls';
import type { RelatedSet } from '@/app/lib/catalog/relatedSets';
import {
  ArrowRight,
  DollarSign,
  ExternalLink,
  Info,
  Palette,
  Puzzle,
} from 'lucide-react';
import Image from 'next/image';
import { useSetPrice } from '@/app/hooks/useSetPrice';
import { useCallback, useState } from 'react';

type SetMinifigDisplay = {
  figNum: string;
  name: string | null;
  imageUrl: string | null;
  numParts: number | null;
  quantity: number;
};

type SetOverviewClientProps = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
  uniqueParts: number | null;
  uniqueColors: number | null;
  minifigs: SetMinifigDisplay[];
  initialRelatedSets: RelatedSet[];
  relatedSetsTotal: number;
};

export function SetOverviewClient({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeId,
  themeName,
  uniqueParts,
  uniqueColors,
  minifigs,
  initialRelatedSets,
  relatedSetsTotal,
}: SetOverviewClientProps) {
  const { openSet, showUpgradeModal, dismissUpgradeModal, gateFeature } =
    useOpenSet();
  const ownership = useSetOwnershipState({
    setNumber,
    name,
    imageUrl,
    year,
    numParts,
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

  // Price fetch
  const { data: priceData, isLoading: priceLoading } = useSetPrice(setNumber);

  // Related sets pagination
  const [relatedSets, setRelatedSets] = useState(initialRelatedSets);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMoreRelated = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: '6',
        offset: String(relatedSets.length),
        ...(themeId != null ? { themeId: String(themeId) } : {}),
        ...(year ? { year: String(year) } : {}),
      });
      const res = await fetch(
        `/api/sets/${encodeURIComponent(setNumber)}/related?${params}`
      );
      if (res.ok) {
        const data = (await res.json()) as { sets: RelatedSet[] };
        setRelatedSets(prev => [...prev, ...data.sets]);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [setNumber, themeId, year, relatedSets.length, loadingMore]);

  const handleOpenSet = () => {
    openSet({
      setNumber,
      name,
      year,
      imageUrl,
      numParts,
      themeId,
      themeName,
    });
  };

  const bricklinkSetUrl = getBricklinkSetUrl(setNumber);
  const rebrickableSetUrl = getRebrickableSetUrl(setNumber);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-xl border-2 border-subtle bg-card shadow-md">
        <div className="aspect-4/3 w-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={name}
              width={600}
              height={450}
              className="size-full object-contain p-6 drop-shadow-md"
              priority
            />
          ) : (
            <ImagePlaceholder variant="fill" />
          )}
        </div>

        {/* Identity */}
        <div className="border-t-2 border-subtle px-5 py-4">
          {themeName && (
            <div className="mb-1 text-xs font-bold tracking-wide text-theme-text uppercase">
              {themeName}
            </div>
          )}
          <h1 className="text-xl leading-tight font-bold lg:text-2xl">
            {name}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {setNumber}
            {' · '}
            {year}
            {' · '}
            {numParts} pieces
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle">
          {/* Price cell */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <DollarSign className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Used Price</div>
              {priceData?.total != null ? (
                <div className="text-sm font-medium">
                  {formatCurrency(priceData.total, priceData.currency)}
                </div>
              ) : priceLoading ? (
                <div className="text-sm text-foreground-muted">Loading…</div>
              ) : (
                <div className="text-sm text-foreground-muted">Unavailable</div>
              )}
            </div>
          </div>

          {/* Inventory stats cell */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <Info className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Inventory</div>
              {uniqueParts != null && uniqueColors != null ? (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Puzzle className="size-3 text-foreground-muted" />
                    {uniqueParts} unique parts
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <Palette className="size-3 text-foreground-muted" />
                    {uniqueColors} colors
                  </div>
                </div>
              ) : (
                <div className="text-sm text-foreground-muted">&mdash;</div>
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

        {/* Ownership row */}
        <div className="border-t-2 border-subtle px-3 py-2">
          <SetOwnershipAndCollectionsRow
            ownership={ownership}
            variant="inline"
          />
        </div>

        {/* Open Set CTA */}
        <div className="border-t-2 border-subtle p-3">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleOpenSet}
          >
            Open Set
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Parts Summary section */}
      {uniqueParts != null && uniqueColors != null && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Parts Summary</h2>
          <div className="rounded-xl border-2 border-subtle bg-card p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{numParts}</div>
                <div className="text-xs text-foreground-muted">
                  Total Pieces
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{uniqueParts}</div>
                <div className="text-xs text-foreground-muted">
                  Unique Parts
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold">{uniqueColors}</div>
                <div className="text-xs text-foreground-muted">Colors</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Minifigures section */}
      {minifigs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">
            Minifigures ({minifigs.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {minifigs.map(fig => (
              <MinifigCard
                key={fig.figNum}
                figNum={fig.figNum}
                name={fig.name ?? 'Unknown'}
                numParts={fig.numParts ?? 0}
                quantity={fig.quantity}
                imageUrl={fig.imageUrl}
              />
            ))}
          </div>
        </section>
      )}

      {/* Related Sets section */}
      {relatedSets.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Related Sets</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {relatedSets.map(set => (
              <PublicSetCard
                key={set.setNumber}
                setNumber={set.setNumber}
                name={set.name}
                year={set.year}
                imageUrl={set.imageUrl}
                numParts={set.numParts}
              />
            ))}
          </div>
          {relatedSets.length < relatedSetsTotal && (
            <div className="mt-4 text-center">
              <Button
                variant="secondary"
                size="md"
                onClick={() => void loadMoreRelated()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </section>
      )}

      <UpgradeModal
        open={showUpgradeModal}
        feature={gateFeature}
        onClose={dismissUpgradeModal}
      />
    </div>
  );
}
