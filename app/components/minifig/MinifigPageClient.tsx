'use client';

import { MinifigOwnershipAndCollectionsRow } from '@/app/components/minifig/MinifigOwnershipAndCollectionsRow';
import { Button } from '@/app/components/ui/Button';
import { QuantityDropdown } from '@/app/components/ui/QuantityDropdown';
import { useMinifigDetails } from '@/app/hooks/useMinifigDetails';
import { useMinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { formatMinifigId, pickMinifigRouteId } from '@/app/lib/minifigIds';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import type { MinifigSearchPage } from '@/app/types/search';
import { OptimizedImage } from '@/app/components/ui/OptimizedImage';
import { ChevronDown, ExternalLink } from 'lucide-react';
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

  return (
    <section className="mx-auto w-full max-w-4xl px-4 py-6 lg:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {displayName}
          </h1>
        </div>
        <Link href="/search?type=minifig" className="hidden sm:inline-flex">
          <Button type="button" size="sm" variant="ghost">
            Back to search
          </Button>
        </Link>
      </div>

      <section className="rounded-[var(--radius-lg)] border-2 border-subtle bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="w-full sm:w-auto sm:flex-shrink-0">
            <div className="relative mx-auto h-48 w-full max-w-xs overflow-hidden rounded-[var(--radius-lg)] border-2 border-subtle bg-card-muted sm:h-56 sm:w-56">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={displayName}
                  fill
                  sizes="320px"
                  className="object-contain"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-foreground-muted">
                  No image
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="space-y-2">
              <div className="flex flex-col gap-1">
                <div className="text-lg leading-snug font-semibold text-foreground">
                  {displayName}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                  <span className="rounded-full bg-card-muted px-2 py-0.5 text-[11px]">
                    {idDisplay.label}
                  </span>
                  {typeof partsCount === 'number' && partsCount > 0 && (
                    <span className="rounded-full bg-card-muted px-2 py-0.5 text-[11px]">
                      {partsCount} parts
                    </span>
                  )}
                </div>
              </div>

              {isLoading && (
                <p className="text-xs text-foreground-muted">
                  Loading details…
                </p>
              )}
              {error && !isLoading && (
                <p className="text-xs text-brand-red">
                  Failed to load minifig details.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-start gap-2 text-sm">
          {themeName && (
            <span className="text-foreground-muted">Theme: {themeName}</span>
          )}
          {year && <span className="text-foreground-muted">Year: {year}</span>}
          {typeof setsCount === 'number' && setsCount > 0 && (
            <Link
              href={{
                pathname: '/identify',
                query: {
                  mode: 'part',
                  part: routeId ? `fig:${routeId}` : `fig:${trimmedFigNum}`,
                },
              }}
              className="inline-flex items-center gap-1 text-foreground underline decoration-dotted underline-offset-4 hover:text-theme-primary"
            >
              Included in Sets: {setsCount}
            </Link>
          )}
          {details?.priceGuide &&
            bricklinkId &&
            details.priceGuide.used.minPrice != null &&
            details.priceGuide.used.maxPrice != null && (
              <Link
                href={`https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(
                  bricklinkId
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-foreground underline decoration-dotted underline-offset-4 hover:text-theme-primary"
              >
                Used range: {details.priceGuide.used.minPrice.toFixed(2)} –{' '}
                {details.priceGuide.used.maxPrice.toFixed(2)}{' '}
                {details.priceGuide.used.currency ?? 'USD'}
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          {details?.priceGuide && !bricklinkId && (
            <span className="text-xs text-foreground-muted">
              No BrickLink ID mapped.
            </span>
          )}
        </div>

        <div className="mt-5">
          <button
            type="button"
            className="flex w-full items-center justify-between bg-transparent px-0 py-2 text-left text-sm"
            onClick={() => setShowSubparts(open => !open)}
          >
            <span className="font-medium">
              Subparts{' '}
              {typeof partsCount === 'number' && partsCount > 0
                ? `(${partsCount})`
                : details?.subparts
                  ? `(${details.subparts.length})`
                  : ''}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                showSubparts ? 'rotate-180' : ''
              }`}
            />
          </button>
          {showSubparts && (
            <div className="mt-3 space-y-2 rounded border border-subtle bg-card-muted/40 p-3">
              {isLoadingSubparts && (
                <p className="text-xs text-foreground-muted">
                  Loading subparts…
                </p>
              )}
              {!isLoadingSubparts &&
                !(
                  subpartsDetails?.subparts?.length || details?.subparts?.length
                ) && (
                  <p className="text-xs text-foreground-muted">
                    No subparts listed.
                  </p>
                )}
              {(subpartsDetails?.subparts ?? details?.subparts ?? []).map(
                item => {
                  const bricklinkUrl = item.bricklinkPartId
                    ? `https://www.bricklink.com/v2/catalog/catalogitem.page?P=${encodeURIComponent(
                        item.bricklinkPartId
                      )}`
                    : null;
                  return (
                    <div
                      key={`${item.partId}-${item.colorId}`}
                      className="flex items-center gap-3 rounded border border-subtle bg-card p-2 text-xs"
                    >
                      <div className="h-12 w-12 overflow-hidden rounded border border-subtle bg-card-muted">
                        {item.imageUrl ? (
                          <OptimizedImage
                            src={item.imageUrl}
                            alt={item.name}
                            variant="identifyCandidate"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-foreground-muted">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="truncate font-medium">{item.name}</div>
                        <div className="flex flex-wrap items-center gap-2 text-foreground-muted">
                          <span className="font-mono text-[11px]">
                            {item.partId}
                          </span>
                          <span className="text-[11px]">
                            Color: {item.colorName}
                          </span>
                          <span className="text-[11px]">
                            Qty: {item.quantity}
                          </span>
                          {bricklinkUrl && (
                            <Link
                              href={bricklinkUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] underline"
                            >
                              BrickLink <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                          {!bricklinkUrl && (
                            <span className="text-[11px] text-foreground-muted">
                              No BrickLink mapping
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <MinifigOwnershipAndCollectionsRow ownership={ownership} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-foreground-muted">Quantity</span>
              <QuantityDropdown
                value={quantity}
                onChange={handleQuantityChange}
                max={20}
                disabled={!canEditQuantity}
                aria-label="Minifigure quantity"
              />
              {!ownership.isAuthenticated && !ownership.isAuthenticating && (
                <span className="text-[11px] text-foreground-muted">
                  Sign in to track quantity.
                </span>
              )}
              {ownership.isAuthenticated &&
                ownership.status === null &&
                !ownership.isAuthenticating && (
                  <span className="text-[11px] text-foreground-muted">
                    Set Owned or Wishlist before editing quantity.
                  </span>
                )}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
}
