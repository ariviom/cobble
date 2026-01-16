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
import type { MinifigSearchPage } from '@/app/types/search';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import {
  ArrowLeft,
  Box,
  Calendar,
  ChevronDown,
  ExternalLink,
  Layers,
  Tag,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type MinifigPageClientProps = {
  figNum: string;
};

export function MinifigPageClient({ figNum }: MinifigPageClientProps) {
  const trimmedFigNum = figNum.trim();
  const { details, isLoading, error } = useMinifigDetails(trimmedFigNum, {
    includeSubparts: false,
    includePricing: false,
    cache: 'no-store',
  });
  const ownership = useMinifigOwnershipState({ figNum: trimmedFigNum });
  const { user, isLoading: isUserLoading } = useSupabaseUser();
  const { minifigs } = useUserMinifigs();
  const [showSubparts, setShowSubparts] = useState(false);
  const { details: subpartsDetails, isLoading: isLoadingSubparts } =
    useMinifigDetails(trimmedFigNum, {
      includeSubparts: showSubparts,
      includePricing: false,
      cache: 'no-store',
      enabled: showSubparts,
    });
  const [resolvedName, setResolvedName] = useState<string | null>(null);

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

  const candidateName =
    (details?.name && details.name.trim()) ||
    (subpartsDetails?.name && subpartsDetails.name.trim()) ||
    (current?.name && current.name.trim()) ||
    null;

  useEffect(() => {
    let cancelled = false;

    // If we already have a good name (from meta/details/user collection), prefer it.
    if (candidateName && candidateName !== trimmedFigNum) {
      setResolvedName(candidateName);
      return;
    }

    // If we've already resolved a better name or we don't have a fig id, skip.
    if (resolvedName || !trimmedFigNum) {
      return;
    }

    const run = async () => {
      try {
        const res = await fetch(
          `/api/search/minifigs?q=${encodeURIComponent(trimmedFigNum)}&pageSize=10`,
          { cache: 'force-cache' }
        );
        if (!res.ok) return;
        const data = (await res.json()) as MinifigSearchPage;
        if (cancelled || !data?.results?.length) return;

        const exact =
          data.results.find(r => r.figNum === trimmedFigNum) ?? data.results[0];
        const nameFromSearch = exact?.name?.trim();
        if (nameFromSearch && nameFromSearch !== trimmedFigNum) {
          setResolvedName(nameFromSearch);
        }
      } catch {
        // best-effort only; ignore search failures
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [candidateName, trimmedFigNum, resolvedName]);

  const displayName =
    (resolvedName && resolvedName.trim()) ||
    candidateName ||
    trimmedFigNum ||
    'Minifigure';
  const imageUrl =
    details?.imageUrl ?? subpartsDetails?.imageUrl ?? current?.imageUrl ?? null;
  const bricklinkId =
    details?.blId ?? subpartsDetails?.blId ?? current?.blId ?? null;
  const idDisplay = formatMinifigId({
    bricklinkId: bricklinkId ?? undefined,
    rebrickableId: trimmedFigNum,
  });
  const routeId = pickMinifigRouteId(bricklinkId ?? undefined, trimmedFigNum);
  const partsCount =
    typeof details?.numParts === 'number' && Number.isFinite(details.numParts)
      ? details.numParts
      : null;
  const themeName = details?.themeName ?? null;
  const year =
    typeof details?.year === 'number' && Number.isFinite(details.year)
      ? details.year
      : null;
  const setsCount = subpartsDetails?.sets?.count ?? details?.sets?.count ?? 0;

  const canEditQuantity =
    ownership.isAuthenticated &&
    !ownership.isAuthenticating &&
    ownership.status !== null &&
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

  const subparts = subpartsDetails?.subparts ?? details?.subparts ?? [];

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 lg:py-10">
      {/* Back navigation */}
      <Link
        href="/search?type=minifig"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-foreground-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <span>Back to search</span>
      </Link>

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

          {isLoading && (
            <p className="mt-3 text-sm text-foreground-muted">
              Loading details…
            </p>
          )}
          {error && !isLoading && (
            <p className="mt-3 text-sm text-danger">
              Failed to load minifig details.
            </p>
          )}
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

        {/* Ownership section */}
        <div className="border-t-2 border-subtle bg-card-muted/30 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <MinifigOwnershipAndCollectionsRow
              ownership={ownership}
              className="!mt-0"
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
            ownership.status === null &&
            !ownership.isAuthenticating && (
              <p className="mt-2 text-xs text-foreground-muted">
                Mark as Owned or Wishlist to edit quantity.
              </p>
            )}
        </div>

        {/* Price guide if available */}
        {details?.priceGuide &&
          bricklinkId &&
          details.priceGuide.used.minPrice != null &&
          details.priceGuide.used.maxPrice != null && (
            <div className="border-t-2 border-subtle px-5 py-3 sm:px-6">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground-muted">Used price range</span>
                <span className="font-medium">
                  ${details.priceGuide.used.minPrice.toFixed(2)} – $
                  {details.priceGuide.used.maxPrice.toFixed(2)}{' '}
                  <span className="text-foreground-muted">
                    {details.priceGuide.used.currency ?? 'USD'}
                  </span>
                </span>
              </div>
            </div>
          )}
      </Card>

      {/* Subparts section */}
      <Card elevated className="mt-6" padding="none">
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-card-muted/50 sm:px-6"
          onClick={() => setShowSubparts(prev => !prev)}
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
