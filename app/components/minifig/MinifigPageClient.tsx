'use client';

import { IdentifySetList } from '@/app/components/identify/IdentifySetList';
import type { IdentifySet } from '@/app/components/identify/types';
import { MinifigOwnershipAndCollectionsRow } from '@/app/components/minifig/MinifigOwnershipAndCollectionsRow';
import { Card } from '@/app/components/ui/Card';
import { OwnedQuantityControl } from '@/app/components/set/items/OwnedQuantityControl';
import { cn } from '@/app/components/ui/utils';
import { useMinifigDetails } from '@/app/hooks/useMinifigDetails';
import { useMinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { formatMinifigId, pickMinifigRouteId } from '@/app/lib/minifigIds';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { formatCurrency } from '@/app/lib/utils/formatCurrency';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { useEntitlements } from '@/app/components/providers/entitlements-provider';
import { RarityBadge } from '@/app/components/set/items/RarityBadge';
import { getRarityTier } from '@/app/components/set/types';
import {
  Box,
  ChevronDown,
  DollarSign,
  ExternalLink,
  Layers,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type MinifigPageClientProps = {
  figNum: string;
  /** Server-side resolved name for immediate display */
  initialName?: string | null;
  /** Server-side resolved image URL for immediate display */
  initialImageUrl?: string | null;
  /** Server-side resolved year */
  initialYear?: number | null;
  /** Server-side resolved theme/category name */
  initialThemeName?: string | null;
  /** Server-side resolved part count */
  initialNumParts?: number | null;
  /** Server-side resolved BrickLink minifig ID */
  initialBlId?: string | null;
  /** Server-side resolved sets count */
  initialSetsCount?: number;
  /** Rarest subpart set count from rb_minifig_rarity */
  initialMinSubpartSetCount?: number | null;
};

export function MinifigPageClient({
  figNum,
  initialName,
  initialImageUrl,
  initialYear,
  initialThemeName,
  initialNumParts,
  initialBlId,
  initialSetsCount = 0,
  initialMinSubpartSetCount,
}: MinifigPageClientProps) {
  const trimmedFigNum = figNum.trim();
  const { hasFeature } = useEntitlements();
  const rarityEnabled = hasFeature('rarity.enabled');
  const ownership = useMinifigOwnershipState({ figNum: trimmedFigNum });
  const { user, isLoading: isUserLoading } = useSupabaseUser();
  const { minifigs } = useUserMinifigs();
  const [showSubparts, setShowSubparts] = useState(false);
  const [subpartsRequested, setSubpartsRequested] = useState(false);
  const { details: subpartsDetails, isLoading: isLoadingSubparts } =
    useMinifigDetails(trimmedFigNum, {
      includeSubparts: true,
      includePricing: false,
      cache: 'no-store',
      enabled: subpartsRequested,
    });

  const { details: pricingData, isLoading: isPricingLoading } =
    useMinifigDetails(trimmedFigNum, {
      includeSubparts: false,
      includePricing: true,
    });
  const priceGuide = pricingData?.priceGuide;

  const current = useMemo(
    () => minifigs.find(fig => fig.figNum === trimmedFigNum) ?? null,
    [minifigs, trimmedFigNum]
  );

  const [quantity, setQuantity] = useState<number>(() => {
    const q = current?.quantity;
    return typeof q === 'number' && Number.isFinite(q) && q >= 0 ? q : 0;
  });

  useEffect(() => {
    const q = current?.quantity;
    setQuantity(typeof q === 'number' && Number.isFinite(q) && q >= 0 ? q : 0);
  }, [current]);

  const displayName =
    initialName?.trim() ||
    current?.name?.trim() ||
    trimmedFigNum ||
    'Minifigure';
  const imageUrl = initialImageUrl ?? current?.imageUrl ?? null;
  const bricklinkId = initialBlId ?? current?.blId ?? null;
  const idDisplay = formatMinifigId({
    bricklinkId: bricklinkId ?? undefined,
    rebrickableId: trimmedFigNum,
  });
  const routeId = pickMinifigRouteId(bricklinkId ?? undefined, trimmedFigNum);
  const partsCount =
    typeof initialNumParts === 'number' && Number.isFinite(initialNumParts)
      ? initialNumParts
      : null;
  const themeName = initialThemeName ?? null;
  const year =
    typeof initialYear === 'number' && Number.isFinite(initialYear)
      ? initialYear
      : null;
  const setsCount = initialSetsCount;

  const canEditQuantity =
    ownership.isAuthenticated &&
    !ownership.isAuthenticating &&
    ownership.status.owned &&
    !isUserLoading;

  const handleQuantityChange = (next: number) => {
    if (!user || !canEditQuantity) return;

    const normalized = Math.max(0, Math.floor(next || 0));
    setQuantity(normalized);

    const supabase = getSupabaseBrowserClient();
    void supabase
      .from('user_minifigs')
      .update({ quantity: normalized })
      .eq('user_id', user.id)
      .eq('fig_num', trimmedFigNum);
  };

  const subparts = subpartsDetails?.subparts ?? [];

  // Rarest subpart sets come from the pricing fetch (no extra call needed)
  const rarestSubpartSets: IdentifySet[] = useMemo(
    () =>
      (pricingData?.rarestSubpartSets ?? []).map(s => ({
        setNumber: s.setNumber,
        name: s.name,
        year: s.year,
        imageUrl: s.imageUrl,
        quantity: s.quantity,
        numParts: s.numParts ?? null,
        themeName: s.themeName ?? null,
      })),
    [pricingData?.rarestSubpartSets]
  );

  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      {/* Hero Section - Collectible showcase */}
      <Card elevated padding="none" className="overflow-hidden">
        {/* Image hero with subtle gradient backdrop */}
        <div className="relative flex items-center justify-center bg-gradient-to-b from-card-muted to-card px-6 py-8 sm:py-12">
          <div className="relative size-48 sm:size-64">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={displayName}
                fill
                sizes="(min-width: 640px) 256px, 192px"
                className="object-contain drop-shadow-lg"
                priority
              />
            ) : (
              <ImagePlaceholder
                variant="card"
                className="size-full rounded-lg"
              />
            )}
          </div>
        </div>

        {/* Identity section */}
        <div className="border-t border-subtle px-5 py-4 sm:px-6">
          {themeName && (
            <div className="mb-1 text-xs font-bold tracking-wide text-theme-text uppercase">
              {themeName}
            </div>
          )}
          <h1 className="text-lg leading-tight font-bold text-foreground">
            {displayName}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground-muted">
            <span>{idDisplay.label}</span>
            {year && (
              <>
                <span>•</span>
                <span>{year}</span>
              </>
            )}
            {typeof partsCount === 'number' && partsCount > 0 && (
              <>
                <span>•</span>
                <span>{partsCount} parts</span>
              </>
            )}
            {rarityEnabled &&
              getRarityTier(initialMinSubpartSetCount ?? setsCount) != null && (
                <>
                  <span>•</span>
                  <RarityBadge
                    tier={
                      getRarityTier(initialMinSubpartSetCount ?? setsCount)!
                    }
                  />
                </>
              )}
          </div>
        </div>

        {/* Used price & Appears in — side by side */}
        <div className="grid grid-cols-2 gap-px border-t border-subtle bg-subtle">
          {/* Used price cell */}
          <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
            <DollarSign className="size-4 shrink-0 text-foreground-muted" />
            <div className="min-w-0">
              <div className="text-xs text-foreground-muted">Used Price</div>
              {isPricingLoading ? (
                <div className="text-sm text-foreground-muted">Loading…</div>
              ) : priceGuide?.used?.unitPrice != null ? (
                <>
                  <div className="text-sm font-medium">
                    {formatCurrency(
                      priceGuide.used.unitPrice,
                      priceGuide.used.currency
                    )}
                  </div>
                  {priceGuide.used.minPrice != null &&
                    priceGuide.used.maxPrice != null &&
                    priceGuide.used.minPrice !== priceGuide.used.maxPrice && (
                      <div className="text-xs text-foreground-muted">
                        {formatCurrency(
                          priceGuide.used.minPrice,
                          priceGuide.used.currency
                        )}{' '}
                        –{' '}
                        {formatCurrency(
                          priceGuide.used.maxPrice,
                          priceGuide.used.currency
                        )}
                      </div>
                    )}
                </>
              ) : priceGuide?.source === 'quota_exhausted' ? (
                <div className="text-sm text-foreground-muted italic">
                  Unavailable
                </div>
              ) : (
                <div className="text-sm text-foreground-muted">–</div>
              )}
            </div>
          </div>

          {/* Appears in cell */}
          {typeof setsCount === 'number' && setsCount > 0 ? (
            <Link
              href={{
                pathname: '/identify',
                query: {
                  mode: 'part',
                  part: routeId ? `fig:${routeId}` : `fig:${trimmedFigNum}`,
                },
              }}
              className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3 transition-colors hover:bg-card-muted"
            >
              <Layers className="size-4 shrink-0 text-foreground-muted" />
              <div>
                <div className="text-xs text-foreground-muted">Appears in</div>
                <div className="text-sm font-medium text-theme-text">
                  {setsCount} {setsCount === 1 ? 'set' : 'sets'} →
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex min-h-[60px] items-center gap-2.5 bg-card px-4 py-3">
              <Layers className="size-4 shrink-0 text-foreground-muted" />
              <div>
                <div className="text-xs text-foreground-muted">Appears in</div>
                <div className="text-sm text-foreground-muted">–</div>
              </div>
            </div>
          )}
        </div>

        {/* External links */}
        <div className="flex gap-px border-t border-subtle bg-subtle">
          {bricklinkId ? (
            <a
              href={`https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(bricklinkId)}`}
              target="_blank"
              rel="noreferrer noopener"
              className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-5 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
            >
              BrickLink
              <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-card px-3 py-5" />
          )}
          <a
            href={`https://rebrickable.com/minifigs/${encodeURIComponent(trimmedFigNum)}/`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex flex-1 items-center justify-center gap-1.5 bg-card px-3 py-5 text-sm font-medium text-foreground-muted transition-colors hover:bg-card-muted hover:text-theme-text"
          >
            Rebrickable
            <ExternalLink className="size-3.5" />
          </a>
        </div>

        {/* Ownership section */}
        <div className="border-t border-subtle bg-card-muted/30 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <MinifigOwnershipAndCollectionsRow
              ownership={ownership}
              variant="inline"
            />
            {canEditQuantity && (
              <OwnedQuantityControl
                required={20}
                owned={quantity}
                onChange={handleQuantityChange}
                className="max-w-40"
              />
            )}
          </div>
          {!ownership.isAuthenticated && !ownership.isAuthenticating && (
            <p className="mt-2 text-xs text-foreground-muted">
              Sign in to track ownership and quantity.
            </p>
          )}
          {ownership.isAuthenticated &&
            !ownership.status.owned &&
            !ownership.isAuthenticating && (
              <p className="mt-2 text-xs text-foreground-muted">
                Mark as Owned to edit quantity.
              </p>
            )}
        </div>
      </Card>

      {/* May also appear in — rarest subpart sets */}
      {rarestSubpartSets.length > 0 && (
        <Card elevated padding="none">
          <div className="px-5 py-4 sm:px-6">
            <span className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">
              May also appear in
            </span>
            <p className="mt-0.5 text-xs text-foreground-muted">
              Rarest minifig part appears in these sets.
            </p>
            <IdentifySetList items={rarestSubpartSets} source="rb" />
          </div>
        </Card>
      )}

      {/* Subparts section */}
      <Card elevated className="mt-6" padding="none">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-card-muted/50 sm:px-6"
          onClick={() => {
            if (!showSubparts) setSubpartsRequested(true);
            setShowSubparts(prev => !prev);
          }}
          aria-expanded={showSubparts}
        >
          <div className="flex items-center gap-2.5">
            <Box className="size-5 text-foreground-muted" />
            <span className="font-semibold">
              Component Parts
              {typeof partsCount === 'number' && partsCount > 0 && (
                <span className="ml-1.5 text-foreground-muted">
                  ({partsCount})
                </span>
              )}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'size-5 text-foreground-muted transition-transform duration-200',
              showSubparts && 'rotate-180'
            )}
          />
        </button>

        <div
          className={cn(
            'grid transition-all duration-200 ease-out',
            showSubparts
              ? 'grid-rows-[1fr] opacity-100'
              : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-subtle px-5 py-4 sm:px-6">
              {isLoadingSubparts && (
                <p className="text-sm text-foreground-muted">
                  Loading component parts…
                </p>
              )}
              {!isLoadingSubparts && subparts.length === 0 && (
                <p className="text-sm text-foreground-muted">
                  No component parts listed.
                </p>
              )}
              {subparts.length > 0 && (
                <div className="space-y-2">
                  {subparts.map(item => {
                    const bricklinkUrl = item.bricklinkPartId
                      ? `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(item.bricklinkPartId)}`
                      : null;
                    return (
                      <div
                        key={`${item.partId}-${item.colorId}`}
                        className="flex items-center gap-3 rounded-lg border border-subtle bg-card-muted/40 p-2.5"
                      >
                        <div className="size-12 shrink-0 overflow-hidden rounded-md border border-subtle bg-card">
                          {item.imageUrl ? (
                            <OptimizedImage
                              src={item.imageUrl}
                              alt={item.name}
                              variant="identifyCandidate"
                              className="size-full object-contain"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-xs text-foreground-muted">
                              —
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">
                            {item.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground-muted">
                            <span className="font-mono">{item.partId}</span>
                            <span>•</span>
                            <span>{item.colorName}</span>
                            <span>•</span>
                            <span>×{item.quantity}</span>
                            {rarityEnabled &&
                              item.setCount != null &&
                              getRarityTier(item.setCount) != null && (
                                <>
                                  <span>•</span>
                                  <span className="inline-flex items-center gap-1">
                                    <RarityBadge
                                      tier={getRarityTier(item.setCount)!}
                                    />
                                    <span>
                                      {item.setCount}{' '}
                                      {item.setCount === 1 ? 'set' : 'sets'}
                                    </span>
                                  </span>
                                </>
                              )}
                            {bricklinkUrl && (
                              <>
                                <span>•</span>
                                <Link
                                  href={bricklinkUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-theme-text hover:underline"
                                  onClick={e => e.stopPropagation()}
                                >
                                  BrickLink
                                  <ExternalLink className="size-3" />
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>
    </section>
  );
}
