'use client';

import { MinifigOwnershipAndCollectionsRow } from '@/app/components/minifig/MinifigOwnershipAndCollectionsRow';
import { Badge } from '@/app/components/ui/Badge';
import { Card } from '@/app/components/ui/Card';
import { QuantityDropdown } from '@/app/components/ui/QuantityDropdown';
import { cn } from '@/app/components/ui/utils';
import { useMinifigDetails } from '@/app/hooks/useMinifigDetails';
import { useMinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { formatMinifigId, pickMinifigRouteId } from '@/app/lib/minifigIds';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import {
  Box,
  Calendar,
  ChevronDown,
  DollarSign,
  ExternalLink,
  Layers,
  Tag,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatPrice(value: number, currency: string | null): string {
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

function PriceCell({
  label,
  unitPrice,
  minPrice,
  maxPrice,
  currency,
}: {
  label: string;
  unitPrice: number;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
}) {
  const hasRange =
    minPrice != null && maxPrice != null && minPrice !== maxPrice;
  return (
    <div className="flex items-center gap-2.5 bg-card px-4 py-3">
      <DollarSign className="size-4 shrink-0 text-foreground-muted" />
      <div>
        <div className="text-xs text-foreground-muted">{label}</div>
        <div className="text-sm font-medium">
          {formatPrice(unitPrice, currency)}
        </div>
        {hasRange && (
          <div className="text-xs text-foreground-muted">
            {formatPrice(minPrice, currency)} –{' '}
            {formatPrice(maxPrice!, currency)}
          </div>
        )}
      </div>
    </div>
  );
}

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
}: MinifigPageClientProps) {
  const trimmedFigNum = figNum.trim();
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

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-10">
      {/* Hero Section - Collectible showcase */}
      <Card variant="theme" elevated padding="none" className="overflow-hidden">
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
              <div className="flex size-full items-center justify-center rounded-lg border-2 border-dashed border-subtle text-sm text-foreground-muted">
                No image
              </div>
            )}
          </div>
        </div>

        {/* Identity section */}
        <div className="border-t-2 border-subtle px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-section-title text-foreground">
                {displayName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="muted" size="sm">
                  {idDisplay.label}
                </Badge>
                {typeof partsCount === 'number' && partsCount > 0 && (
                  <Badge variant="muted" size="sm">
                    {partsCount} parts
                  </Badge>
                )}
              </div>
            </div>
            {bricklinkId && (
              <Link
                href={`https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(bricklinkId)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-foreground-muted transition-colors hover:text-theme-text"
              >
                BrickLink
                <ExternalLink className="size-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Stats grid */}
        {(themeName || year || setsCount > 0) && (
          <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle sm:grid-cols-3">
            {themeName && (
              <div className="flex items-center gap-2.5 bg-card px-4 py-3">
                <Tag className="size-4 shrink-0 text-foreground-muted" />
                <div className="min-w-0">
                  <div className="text-xs text-foreground-muted">Theme</div>
                  <div className="truncate text-sm font-medium">
                    {themeName}
                  </div>
                </div>
              </div>
            )}
            {year && (
              <div className="flex items-center gap-2.5 bg-card px-4 py-3">
                <Calendar className="size-4 shrink-0 text-foreground-muted" />
                <div>
                  <div className="text-xs text-foreground-muted">Year</div>
                  <div className="text-sm font-medium">{year}</div>
                </div>
              </div>
            )}
            {typeof setsCount === 'number' && setsCount > 0 && (
              <Link
                href={{
                  pathname: '/identify',
                  query: {
                    mode: 'part',
                    part: routeId ? `fig:${routeId}` : `fig:${trimmedFigNum}`,
                  },
                }}
                className="col-span-2 flex items-center gap-2.5 bg-card px-4 py-3 transition-colors hover:bg-card-muted sm:col-span-1"
              >
                <Layers className="size-4 shrink-0 text-foreground-muted" />
                <div>
                  <div className="text-xs text-foreground-muted">
                    Appears in
                  </div>
                  <div className="text-sm font-medium text-theme-text">
                    {setsCount} {setsCount === 1 ? 'set' : 'sets'} →
                  </div>
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Pricing section */}
        {isPricingLoading && (
          <div className="border-t-2 border-subtle px-5 py-3 sm:px-6">
            <p className="text-sm text-foreground-muted">Fetching price…</p>
          </div>
        )}
        {!isPricingLoading && priceGuide?.used?.unitPrice != null && (
          <div className="grid grid-cols-2 gap-px border-t-2 border-subtle bg-subtle">
            <PriceCell
              label={priceGuide.source === 'derived' ? 'Est. Used' : 'Used'}
              unitPrice={priceGuide.used.unitPrice}
              minPrice={priceGuide.used.minPrice}
              maxPrice={priceGuide.used.maxPrice}
              currency={priceGuide.used.currency}
            />
            {priceGuide.new?.unitPrice != null ? (
              <PriceCell
                label={priceGuide.source === 'derived' ? 'Est. New' : 'New'}
                unitPrice={priceGuide.new.unitPrice}
                minPrice={priceGuide.new.minPrice}
                maxPrice={priceGuide.new.maxPrice}
                currency={priceGuide.new.currency}
              />
            ) : (
              <div className="flex items-center gap-2.5 bg-card px-4 py-3">
                <DollarSign className="size-4 shrink-0 text-foreground-muted" />
                <div>
                  <div className="text-xs text-foreground-muted">New</div>
                  <div className="text-sm text-foreground-muted">–</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ownership section */}
        <div className="border-t-2 border-subtle bg-card-muted/30 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <MinifigOwnershipAndCollectionsRow
              ownership={ownership}
              variant="inline"
            />
            <div className="flex items-center gap-2 text-sm">
              <span className="text-foreground-muted">Qty</span>
              <QuantityDropdown
                value={quantity}
                onChange={handleQuantityChange}
                max={20}
                size="md"
                disabled={!canEditQuantity}
                aria-label="Minifigure quantity"
              />
            </div>
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
            <div className="border-t-2 border-subtle px-5 py-4 sm:px-6">
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
                        className="flex items-center gap-3 rounded-md border-2 border-subtle bg-card-muted/40 p-2.5"
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
