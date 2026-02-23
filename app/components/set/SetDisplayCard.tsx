'use client';

import { useSetImageRefresh } from '@/app/hooks/useSetImageRefresh';
import { cardVariants } from '@/app/components/ui/Card';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { cn } from '@/app/components/ui/utils';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export type SetDisplayCardProps = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts?: number;
  quantity?: number;
  /**
   * Optional label for the theme (e.g., root theme name). When provided, this
   * is rendered above the title.
   */
  themeLabel?: string | null;
  themeId?: number | null;
  onRemove?: (() => void) | undefined;
  /** Tracked owned count — when > 0 with totalParts, renders a progress bar. */
  ownedCount?: number;
  /** Total parts for this set — used with ownedCount for the progress bar. */
  totalParts?: number;
  className?: string;
  /**
   * When provided, the card fires this callback instead of navigating to the
   * set page. Used to open a preview modal from search/identify routes.
   */
  onClick?: () => void;
  /**
   * Optional footer content rendered below the card body (for example,
   * ownership and list controls). This lets callers decide in which contexts
   * controls are shown (search vs. collection views).
   */
  children?: ReactNode;
};

export function SetDisplayCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  quantity,
  themeLabel,
  onRemove,
  ownedCount,
  totalParts,
  className,
  onClick,
  children,
}: SetDisplayCardProps) {
  const displayName = name && name.trim() ? name : setNumber;
  const displaySetNumber = setNumber ?? '';
  // Infer metadata display: prefer numParts, fallback to quantity.
  const metadataParts: string[] = [displaySetNumber, String(year)];
  if (typeof numParts === 'number' && Number.isFinite(numParts)) {
    metadataParts.push(`${numParts} parts`);
  } else if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    metadataParts.push(`${quantity} pieces`);
  }

  const hasTrackingProps =
    typeof ownedCount === 'number' && typeof totalParts === 'number';
  const showProgress = hasTrackingProps && ownedCount! > 0 && totalParts! > 0;
  const progressPct = showProgress
    ? Math.round((ownedCount! / totalParts!) * 100)
    : 0;

  const { resolvedUrl: resolvedImageUrl, onError: handleImageError } =
    useSetImageRefresh(setNumber, imageUrl);

  const cardBody = (
    <>
      <div className="p-2">
        {resolvedImageUrl ? (
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
            <Image
              src={resolvedImageUrl}
              alt=""
              fill
              className="rounded-sm object-contain p-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
              onError={handleImageError}
            />
          </div>
        ) : (
          <ImagePlaceholder variant="card" />
        )}
      </div>
      <div className="flex items-start gap-2 px-2 py-3 sm:px-3">
        <div className="min-w-0 flex-1">
          {themeLabel && (
            <div className="mb-1 w-full text-xs font-bold tracking-wide text-theme-text uppercase">
              {themeLabel}
            </div>
          )}
          <div className="line-clamp-2 w-full text-sm leading-tight font-bold text-foreground">
            {displayName}
          </div>
          <div className="mt-1 w-full text-2xs font-semibold text-foreground-muted">
            {metadataParts.join(' • ')}
          </div>
        </div>
      </div>
      {hasTrackingProps && (
        <div className="mt-auto px-2 pb-2 sm:px-3 sm:pb-3">
          <div
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${progressPct}% of pieces owned`}
            className={cn(
              'h-2 w-full overflow-hidden rounded-full bg-background-muted',
              !showProgress && 'opacity-40'
            )}
          >
            <div
              className="h-full rounded-full bg-theme-primary transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p
            className={cn(
              'mt-1 text-xs font-semibold',
              showProgress
                ? 'text-foreground-muted'
                : 'text-foreground-muted/50'
            )}
          >
            {showProgress
              ? `${ownedCount} / ${totalParts} pieces`
              : 'No tracked pieces'}
          </p>
        </div>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'group relative flex flex-col',
        cardVariants({
          variant: 'default',
          elevated: true,
          interactive: true,
          padding: 'none',
        }),
        className
      )}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex w-full flex-1 cursor-pointer flex-col text-left"
        >
          {cardBody}
        </button>
      ) : (
        <Link
          href={`/sets/${encodeURIComponent(setNumber)}`}
          className="flex w-full flex-1 flex-col"
        >
          {cardBody}
        </Link>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-1 right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-card/80 text-foreground-muted opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-foreground"
          aria-label="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}
