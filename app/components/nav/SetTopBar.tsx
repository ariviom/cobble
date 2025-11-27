'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { Modal } from '@/app/components/ui/Modal';
import { cn } from '@/app/components/ui/utils';
import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { useInventory } from '@/app/hooks/useInventory';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useSetStatus } from '@/app/hooks/useSetStatus';
import { ArrowLeft, ChevronDown, Download, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEventHandler, ReactNode } from 'react';
import { useMemo, useState } from 'react';

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
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const { isLoading, totalMissing, ownedTotal, computeMissingRows } =
    useInventory(setNumber);
  const { status: uiStatus } = useSetStatus({
    setNumber,
    name: setName,
    ...(typeof year === 'number' ? { year } : {}),
    imageUrl,
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

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

  const participantCount = searchTogether?.participants.length ?? 0;
  const totalPiecesFound = searchTogether?.totalPiecesFound ?? 0;

  const handleSearchTogetherClick: MouseEventHandler<HTMLButtonElement> = async event => {
    event.stopPropagation();
    if (!searchTogether) return;
    if (searchTogether.loading) return;
    if (!searchTogether.active) {
      await searchTogether.onStart?.();
    }
  };

  const handleEndSessionClick: MouseEventHandler<HTMLButtonElement> = async event => {
    event.stopPropagation();
    if (!searchTogether) return;
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
              {searchTogether &&
                !searchTogether.canHost &&
                (isDesktop ? expanded : mobileOpen) && (
                  <>
                    {' '}
                    ·{' '}
                    <span className="inline-flex items-center gap-1 text-foreground-muted">
                      <Users className="h-3 w-3" />
                      <span>
                        Search together (
                        {participantCount.toLocaleString()} ·{' '}
                        {totalPiecesFound.toLocaleString()} pieces)
                      </span>
                    </span>
                  </>
                )}
            </div>
            {(uiStatus.owned || uiStatus.wantToBuild) && (
              <div className="mt-1 flex flex-wrap gap-1 text-[11px] lg:text-xs">
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
              <div className="mt-3 flex flex-col gap-3">
                <SetOwnershipAndCollectionsRow
                  setNumber={setNumber}
                  name={setName}
                  year={typeof year === 'number' ? year : 0}
                  imageUrl={imageUrl}
                  {...(typeof numParts === 'number' ? { numParts } : {})}
                  themeId={themeId ?? null}
                />
                {searchTogether?.canHost && (
                  <>
                    <button
                      type="button"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-theme-primary px-3 py-2 text-xs font-medium text-white hover:bg-theme-primary/90"
                      onClick={event => {
                        event.stopPropagation();
                        void handleSearchTogetherClick(event as never);
                      }}
                      disabled={searchTogether.loading}
                    >
                      <Users className="h-4 w-4" />
                      <span>
                        {searchTogether.active
                          ? `Search together (${participantCount.toLocaleString()} · ${totalPiecesFound.toLocaleString()} pieces)`
                          : 'Start Search Together'}
                      </span>
                    </button>
                    {searchTogether.active && searchTogether.joinUrl && (
                      <div className="rounded-md border border-border-subtle bg-card p-3 text-xs">
                        <div className="font-semibold text-foreground">
                          Share session
                        </div>
                        <p className="mt-1 text-foreground-muted">
                          Copy the link or display a QR code so others can join
                          this Search Together session.
                        </p>
                        <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center">
                          <div className="flex flex-1 items-center gap-2">
                            <input
                              type="text"
                              value={searchTogether.joinUrl}
                              readOnly
                              className="flex-1 rounded-md border border-border-subtle bg-background px-2 py-1 text-[11px] text-foreground"
                            />
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-md border border-border-subtle px-2 py-1 text-[11px] font-medium hover:bg-card-muted"
                              onClick={event => {
                                event.stopPropagation();
                                handleCopyShareLink();
                              }}
                            >
                              Copy link
                            </button>
                          </div>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-md border border-border-subtle px-2 py-1 text-[11px] font-medium hover:bg-card-muted"
                            onClick={event => {
                              event.stopPropagation();
                              setQrModalOpen(true);
                            }}
                          >
                            Show QR code
                          </button>
                        </div>
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center justify-center rounded-md border border-border-subtle px-2 py-1 text-[11px] font-medium text-destructive hover:bg-card-muted"
                          onClick={event => {
                            event.stopPropagation();
                            void handleEndSessionClick(event as never);
                          }}
                        >
                          End session
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <NavButton
          className="absolute top-2 right-0 lg:top-0"
          ariaLabel="Export missing"
          label="Parts List"
          icon={<Download className="h-5 w-5" />}
          onClick={() => setExportOpen(true)}
        />
      </div>
      <Modal
        open={qrModalOpen && Boolean(searchTogether?.joinUrl)}
        onClose={() => setQrModalOpen(false)}
        title="Search Together QR"
      >
        {searchTogether?.joinUrl ? (
          <div className="flex flex-col items-center gap-3 text-center text-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                searchTogether.joinUrl
              )}`}
              alt="QR code for Search Together link"
              className="h-44 w-44 rounded-md border border-border-subtle bg-card p-2"
            />
            <p className="text-xs text-foreground-muted">
              Scan this code or copy the link below to join the session.
            </p>
            <div className="flex w-full items-center gap-2">
              <input
                type="text"
                readOnly
                value={searchTogether.joinUrl}
                className="flex-1 rounded-md border border-border-subtle bg-background px-2 py-1 text-[11px]"
              />
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:bg-card-muted"
                onClick={() => handleCopyShareLink()}
              >
                Copy
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-foreground-muted">
            Session link unavailable.
          </div>
        )}
      </Modal>
      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        setNumber={setNumber}
        setName={setName}
        getMissingRows={computeMissingRows}
      />
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
