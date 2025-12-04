'use client';

import { MinifigOwnershipAndCollectionsRow } from '@/app/components/minifig/MinifigOwnershipAndCollectionsRow';
import { QuantityDropdown } from '@/app/components/ui/QuantityDropdown';
import { Button } from '@/app/components/ui/Button';
import { useMinifigMeta } from '@/app/hooks/useMinifigMeta';
import { useMinifigOwnershipState } from '@/app/hooks/useMinifigOwnershipState';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import { useUserMinifigs } from '@/app/hooks/useUserMinifigs';
import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type MinifigPageClientProps = {
  figNum: string;
};

export function MinifigPageClient({ figNum }: MinifigPageClientProps) {
  const trimmedFigNum = figNum.trim();
  const { meta, isLoading, error } = useMinifigMeta(trimmedFigNum);
  const ownership = useMinifigOwnershipState({ figNum: trimmedFigNum });
  const { user, isLoading: isUserLoading } = useSupabaseUser();
  const { minifigs } = useUserMinifigs();

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
    setQuantity(
      typeof q === 'number' && Number.isFinite(q) && q >= 0 ? q : 0
    );
  }, [current]);

  const displayName =
    (meta?.name && meta.name.trim()) || trimmedFigNum || 'Minifigure';
  const imageUrl = meta?.imageUrl ?? null;
  const displayId = meta?.blId ?? null;
  const partsCount =
    typeof meta?.numParts === 'number' && Number.isFinite(meta.numParts)
      ? meta.numParts
      : null;

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
          <h1 className="truncate text-xl font-semibold lg:text-2xl">
            {displayName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
            <span className="rounded-full bg-card-muted px-2 py-0.5 font-mono text-[11px]">
              {trimmedFigNum}
            </span>
            {displayId && (
              <span className="rounded-full bg-card-muted px-2 py-0.5 text-[11px]">
                BrickLink ID: {displayId}
              </span>
            )}
            {typeof partsCount === 'number' && partsCount > 0 && (
              <span className="rounded-full bg-card-muted px-2 py-0.5 text-[11px]">
                {partsCount} parts
              </span>
            )}
          </div>
        </div>
        <Link href="/search?type=minifig" className="hidden sm:inline-flex">
          <Button type="button" size="sm" variant="ghost">
            Back to search
          </Button>
        </Link>
      </div>

      <section className="rounded-lg border border-subtle bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-shrink-0">
            <div className="relative h-40 w-40 overflow-hidden rounded-lg border border-subtle bg-card-muted sm:h-48 sm:w-48">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={displayName}
                  fill
                  sizes="192px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-foreground-muted">
                  No image
                </div>
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1 text-sm">
            {isLoading && (
              <p className="text-xs text-foreground-muted">Loading details…</p>
            )}
            {error && !isLoading && (
              <p className="text-xs text-brand-red">
                Failed to load minifig details.
              </p>
            )}
            <div className="mt-2 space-y-1 text-xs text-foreground-muted">
              <p>
                This page lets you manage ownership and wishlist status for this
                minifigure, along with an optional quantity count that is
                aggregated across your sets.
              </p>
              <p>
                Use the controls below to mark this minifig as{' '}
                <span className="font-medium">Owned</span> or add it to your{' '}
                <span className="font-medium">Wishlist</span>, and organize it
                into lists.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <MinifigOwnershipAndCollectionsRow ownership={ownership} />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
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
      </section>
    </section>
  );
}


