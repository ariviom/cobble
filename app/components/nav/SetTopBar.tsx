'use client';

import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { Modal } from '@/app/components/ui/Modal';
import { cn } from '@/app/components/ui/utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import { ArrowLeft, ChevronDown, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEventHandler, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';

type SetTopBarProps = {
  setNumber: string;
  setName: string;
  imageUrl: string | null;
  year?: number;
  numParts?: number;
  themeId?: number | null;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  priceStatus?: 'idle' | 'loading' | 'loaded' | 'error';
  priceSummary?: {
    total: number;
    minTotal: number | null;
    maxTotal: number | null;
    currency: string | null;
    pricedItemCount: number;
  } | null;
  onRequestPrices?: () => void;
  searchTogether?: {
    active: boolean;
    loading: boolean;
    canHost: boolean;
    joinUrl: string | null;
    participants: Array<{
      id: string;
      displayName: string;
      piecesFound: number;
    }>;
    totalPiecesFound: number;
    onStart: () => Promise<void> | void;
    onEnd: () => Promise<void> | void;
  };
};

function NavButton({
  icon,
  ariaLabel,
  onClick,
  href,
  disabled,
  label,
  className,
}: NavButtonProps) {
  const base = cn(
    'group flex h-12 w-12 cursor-pointer items-center justify-center gap-4 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black lg:w-auto lg:pr-4'
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={cn(
          base,
          disabled && 'pointer-events-none opacity-60',
          className
        )}
      >
        {label && (
          <span className="hidden min-w-max group-hover:underline lg:block">
            {label}
          </span>
        )}
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, className)}
    >
      {label && (
        <span className="hidden min-w-max group-hover:underline lg:block">
          {label}
        </span>
      )}
      {icon}
    </button>
  );
}

export function SetTopBar({
  setNumber,
  setName,
  imageUrl,
  year,
  numParts,
  themeId,
  expanded = false,
  onToggleExpanded,
  priceStatus = 'idle',
  priceSummary,
  onRequestPrices,
  searchTogether,
}: SetTopBarProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchTogetherModalOpen, setSearchTogetherModalOpen] = useState(false);
  const [shareMode, setShareMode] = useState<'link' | 'qr'>('link');
  const { isLoading, totalMissing, ownedTotal } = useInventory(setNumber);
  const ownership = useSetOwnershipState({
    setNumber,
    name: setName,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });
  const selectedCollections = useMemo(
    () =>
      ownership.collections.filter(collection =>
        ownership.selectedCollectionIds.includes(collection.id)
      ),
    [ownership.collections, ownership.selectedCollectionIds]
  );
  const uiStatus = ownership.status;
  const hasStatusPills = uiStatus.owned || uiStatus.wantToBuild;
  const hasCollectionPills = selectedCollections.length > 0;
  const shouldShowPills = hasStatusPills || hasCollectionPills;
  const participantCount = searchTogether?.participants.length ?? 0;
  const totalPiecesFound = searchTogether?.totalPiecesFound ?? 0;

  useEffect(() => {
    if (!searchTogetherModalOpen) {
      setShareMode('link');
    }
  }, [searchTogetherModalOpen]);

  const handleToggleExpanded = () => {
    if (isDesktop) {
      onToggleExpanded?.();
    } else {
      setMobileOpen(prev => !prev);
    }
  };

  const formattedPrice = useMemo(() => {
    if (!priceSummary) return null;
    const currency = priceSummary.currency ?? 'USD';
    const hasRange =
      typeof priceSummary.minTotal === 'number' &&
      Number.isFinite(priceSummary.minTotal) &&
      typeof priceSummary.maxTotal === 'number' &&
      Number.isFinite(priceSummary.maxTotal) &&
      priceSummary.maxTotal >= priceSummary.minTotal;
    try {
      const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
      });
      if (hasRange) {
        const minFormatted = formatter.format(priceSummary.minTotal as number);
        const maxFormatted = formatter.format(priceSummary.maxTotal as number);
        return `${minFormatted} – ${maxFormatted}`;
      }
      return formatter.format(priceSummary.total);
    } catch {
      if (hasRange) {
        const minFormatted = (priceSummary.minTotal as number).toLocaleString(
          'en-US',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        );
        const maxFormatted = (priceSummary.maxTotal as number).toLocaleString(
          'en-US',
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }
        );
        return `${minFormatted} – ${maxFormatted}`;
      }
      return priceSummary.total.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }, [priceSummary]);

  const handleStartSearchTogether = async () => {
    if (!searchTogether) return;
    if (searchTogether.loading || searchTogether.active) return;
    await searchTogether.onStart?.();
  };

  const handleEndSearchTogether = async () => {
    if (!searchTogether) return;
    if (!searchTogether.active || searchTogether.loading) return;
    await searchTogether.onEnd?.();
  };

  const handleCopyShareLink = () => {
    const link = searchTogether?.joinUrl;
    if (!link) return;
    try {
      void navigator.clipboard?.writeText(link);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to copy Search Together link', err);
      }
    }
  };

  return (
    <>
      <div
        className={cn(
          'fixed top-0 right-0 z-60 flex h-topnav-height w-full items-center justify-between border-b border-foreground-accent',
          'lg:relative lg:h-full lg:w-full',
          !isDesktop && mobileOpen && 'expanded-topnav'
        )}
      >
        <NavButton
          className="absolute top-2 left-0 lg:top-0 lg:hidden"
          ariaLabel="Go back"
          icon={<ArrowLeft className="h-5 w-5" />}
          onClick={() => router.back()}
        />
        <div
          onClick={handleToggleExpanded}
          className="group set flex h-full w-full cursor-pointer gap-3 bg-background px-14 py-2 lg:px-2"
          role="button"
          aria-label="Open set information"
          aria-expanded={isDesktop ? expanded : false}
          aria-controls="setinfo-panel"
        >
          <div className="aspect-square overflow-hidden rounded-sm border border-foreground-accent lg:aspect-auto">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="Set thumbnail"
                width={240}
                height={240}
                className="h-full w-auto object-cover transition-transform"
              />
            ) : (
              <div className="flex size-[calc(var(--spacing-topnav-height)-1rem)] flex-shrink-0 items-center justify-center rounded-sm border border-border-subtle bg-card-muted">
                No Image
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col items-start text-left">
            <div className="lg:font-base flex h-5 shrink-0 origin-left items-center truncate text-sm font-medium lg:text-base">
              <span className="group-hover:underline">{setName}</span>
              <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-foreground-muted transition-transform expanded-topnav:rotate-180" />
            </div>
            <div className="text-xs text-foreground-muted lg:text-sm">
              {isLoading
                ? 'Computing…'
                : `${ownedTotal} / ${totalMissing} parts`}
              {priceStatus === 'loading' && ' · Getting price…'}
              {priceStatus === 'loaded' && formattedPrice
                ? ` · ${formattedPrice}`
                : null}
              {priceStatus === 'idle' && !formattedPrice && onRequestPrices && (
                <>
                  {' '}
                  ·{' '}
                  <button
                    type="button"
                    className="underline hover:text-theme-primary"
                    onClick={event => {
                      event.stopPropagation();
                      onRequestPrices();
                    }}
                  >
                    Get price
                  </button>
                </>
              )}
              {priceStatus === 'error' && ' · Price unavailable'}
            </div>
            {(shouldShowPills || expanded || mobileOpen) && (
              <div
                className={cn(
                  'relative mt-1 w-full transition-[min-height]',
                  mobileOpen
                    ? 'min-h-[56px]'
                    : shouldShowPills
                      ? 'min-h-[24px]'
                      : 'min-h-0',
                  expanded
                    ? 'lg:min-h-[56px]'
                    : shouldShowPills
                      ? 'lg:min-h-[24px]'
                      : 'lg:min-h-0'
                )}
              >
                <div
                  className={cn(
                    'absolute inset-0 flex flex-wrap gap-1 text-[11px] transition-[opacity,transform] lg:text-xs',
                    shouldShowPills
                      ? 'scale-100 opacity-100'
                      : 'pointer-events-none opacity-0',
                    expanded &&
                      'lg:pointer-events-none lg:scale-75 lg:opacity-0',
                    mobileOpen && 'pointer-events-none scale-75 opacity-0'
                  )}
                >
                  {uiStatus.owned && (
                    <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-brand-green">
                      Owned
                    </span>
                  )}
                  {uiStatus.wantToBuild && (
                    <span className="rounded-full bg-brand-purple/10 px-2 py-0.5 text-brand-purple">
                      Wishlist
                    </span>
                  )}
                  {selectedCollections.map(collection => (
                    <span
                      key={collection.id}
                      className="rounded-full bg-theme-primary/10 px-2 py-0.5 text-theme-primary"
                    >
                      {collection.name}
                    </span>
                  ))}
                </div>
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 scale-95 opacity-0 transition-[opacity,transform]',
                    expanded &&
                      'lg:pointer-events-auto lg:scale-100 lg:opacity-100',
                    mobileOpen && 'pointer-events-auto scale-100 opacity-100'
                  )}
                >
                  <SetOwnershipAndCollectionsRow
                    ownership={ownership}
                    variant="inline"
                  />
                </div>
              </div>
            )}
            {/* Set info panel */}
            <div
              id="setinfo-panel"
              className="absolute inset-x-0 bottom-0 -z-10 origin-top-left rounded-md border border-foreground-accent bg-background p-3 transition-transform lg:pointer-events-none lg:static lg:z-auto lg:!translate-y-0 lg:scale-75 lg:border-none lg:bg-transparent lg:p-0 lg:opacity-0 lg:transition-[transform,opacity] expanded-topnav:translate-y-full lg:expanded-topnav:pointer-events-auto lg:expanded-topnav:scale-100 lg:expanded-topnav:opacity-100"
            >
              <div className="lg:hidden">
                <Image
                  src={imageUrl ?? ''}
                  alt="Set thumbnail"
                  width={512}
                  height={512}
                />
              </div>
            </div>
          </div>
        </div>
        <NavButton
          ariaLabel="Search Together"
          label={
            searchTogether?.active
              ? `Search Together (Active · ${participantCount.toLocaleString()})`
              : 'Search Together'
          }
          icon={
            <span className="relative inline-flex">
              <Users className="h-5 w-5" />
              {searchTogether?.active && participantCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-theme-primary px-1 text-[10px] font-semibold text-white">
                  {participantCount > 9 ? '9+' : participantCount}
                </span>
              )}
            </span>
          }
          disabled={!searchTogether}
          className={cn(
            'absolute top-2 right-0 lg:top-0',
            searchTogether?.active && 'text-theme-primary',
            !searchTogether && 'opacity-60'
          )}
          onClick={event => {
            event.stopPropagation();
            if (!searchTogether) return;
            setSearchTogetherModalOpen(true);
          }}
        />
      </div>
      <Modal
        open={searchTogetherModalOpen && Boolean(searchTogether)}
        onClose={() => setSearchTogetherModalOpen(false)}
        title="Search Together"
      >
        {searchTogether ? (
          <div className="flex flex-col gap-3 text-xs">
            <div className="rounded-md border border-border-subtle bg-card p-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {searchTogether.active ? 'Session active' : 'Session idle'}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      searchTogether.active
                        ? 'bg-brand-green/10 text-brand-green'
                        : 'bg-card-muted text-foreground-muted'
                    )}
                  >
                    {searchTogether.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-[11px] text-foreground-muted">
                  {participantCount.toLocaleString()} participants ·{' '}
                  {totalPiecesFound.toLocaleString()} pieces found
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {searchTogether.canHost ? (
                  <>
                    {!searchTogether.active && (
                      <button
                        type="button"
                        className="inline-flex flex-1 items-center justify-center rounded-md bg-theme-primary px-3 py-2 text-[11px] font-medium text-white hover:bg-theme-primary/90 disabled:opacity-60"
                        onClick={() => void handleStartSearchTogether()}
                        disabled={searchTogether.loading}
                      >
                        {searchTogether.loading
                          ? 'Starting…'
                          : 'Start Search Together'}
                      </button>
                    )}
                    {searchTogether.active && (
                      <button
                        type="button"
                        className="text-destructive inline-flex flex-1 items-center justify-center rounded-md border border-border-subtle px-3 py-2 text-[11px] font-medium hover:bg-card-muted disabled:opacity-60"
                        onClick={() => void handleEndSearchTogether()}
                        disabled={searchTogether.loading}
                      >
                        {searchTogether.loading ? 'Ending…' : 'End session'}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-foreground-muted">
                    Only the session host can start or end Search Together.
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-card p-3">
              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                Share session
                {searchTogether.joinUrl && (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-theme-primary hover:underline"
                    onClick={() =>
                      setShareMode(prev => (prev === 'link' ? 'qr' : 'link'))
                    }
                  >
                    {shareMode === 'link' ? 'Show QR code' : 'Show link'}
                  </button>
                )}
              </div>
              {searchTogether.joinUrl ? (
                shareMode === 'link' ? (
                  <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
                    <input
                      type="text"
                      value={searchTogether.joinUrl}
                      readOnly
                      className="flex-1 rounded-md border border-border-subtle bg-background px-2 py-1 text-[11px]"
                    />
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-md border border-border-subtle px-2 py-1 text-[11px] font-medium hover:bg-card-muted"
                      onClick={() => handleCopyShareLink()}
                    >
                      Copy link
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col items-center gap-2 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                        searchTogether.joinUrl
                      )}`}
                      alt="QR code for Search Together link"
                      className="h-44 w-44 rounded-md border border-border-subtle bg-card p-2"
                    />
                    <p className="text-[11px] text-foreground-muted">
                      Scan to join this Search Together session.
                    </p>
                  </div>
                )
              ) : (
                <p className="mt-2 text-[11px] text-foreground-muted">
                  Session link unavailable.
                </p>
              )}
            </div>
            <div className="rounded-md border border-border-subtle bg-card p-3">
              <div className="text-xs font-semibold text-foreground">
                Participants
              </div>
              {searchTogether.participants.length === 0 ? (
                <p className="mt-2 text-[11px] text-foreground-muted">
                  No participants yet.
                </p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2 text-xs">
                  {searchTogether.participants.map(participant => (
                    <li
                      key={participant.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="truncate">
                        {participant.displayName}
                      </span>
                      <span className="text-foreground-muted">
                        {(participant.piecesFound ?? 0).toLocaleString()} pieces
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-foreground-muted">
            Search Together is unavailable for this set.
          </div>
        )}
      </Modal>
    </>
  );
}

type NavButtonProps = {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  href?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
};
