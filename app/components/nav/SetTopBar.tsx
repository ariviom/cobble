'use client';

import { ExportModal } from '@/app/components/export/ExportModal';
import { cn } from '@/app/components/ui/utils';
import { useInventory } from '@/app/hooks/useInventory';
import { useIsDesktop } from '@/app/hooks/useMediaQuery';
import { useSetStatus } from '@/app/hooks/useSetStatus';
import { ArrowLeft, ChevronDown, Download } from 'lucide-react';
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
}: SetTopBarProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isLoading, totalMissing, ownedTotal, computeMissingRows } =
    useInventory(setNumber);
  const { status: uiStatus, toggleStatus } = useSetStatus({
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
              <div className="flex size-[calc(var(--spacing-topnav-height)-1rem)] flex-shrink-0 items-center justify-center rounded-sm border bg-neutral-100">
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
                    className="underline hover:text-brand-blue/80"
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
            {(uiStatus.owned || uiStatus.canBuild || uiStatus.wantToBuild) && (
              <div className="mt-1 flex flex-wrap gap-1 text-[11px] lg:text-xs">
                {uiStatus.owned && (
                  <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-brand-green">
                    Owned
                  </span>
                )}
                {uiStatus.canBuild && (
                  <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-brand-blue">
                    Can build
                  </span>
                )}
                {uiStatus.wantToBuild && (
                  <span className="rounded-full bg-brand-purple/10 px-2 py-0.5 text-brand-purple">
                    Want to build
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
              <div className="mt-3 flex flex-col items-center gap-3 lg:flex-row lg:items-start">
                <div className="flex flex-wrap justify-center gap-2 lg:justify-start">
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-1 text-sm ${
                      uiStatus.owned
                        ? 'border-brand-green bg-brand-green/10 text-brand-green'
                        : 'hover:bg-neutral-100'
                    }`}
                    onClick={event => {
                      event.stopPropagation();
                      toggleStatus('owned');
                    }}
                  >
                    Own this set
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-1 text-sm ${
                      uiStatus.canBuild
                        ? 'border-brand-blue bg-brand-blue/10 text-brand-blue'
                        : 'hover:bg-neutral-100'
                    }`}
                    onClick={event => {
                      event.stopPropagation();
                      toggleStatus('canBuild');
                    }}
                  >
                    Can build
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-1 text-sm ${
                      uiStatus.wantToBuild
                        ? 'border-brand-purple bg-brand-purple/10 text-brand-purple'
                        : 'hover:bg-neutral-100'
                    }`}
                    onClick={event => {
                      event.stopPropagation();
                      toggleStatus('wantToBuild');
                    }}
                  >
                    Want to build
                  </button>
                </div>
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
