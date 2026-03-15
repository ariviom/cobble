'use client';

import { cardVariants } from '@/app/components/ui/Card';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { cn } from '@/app/components/ui/utils';
import { useSetImageRefresh } from '@/app/hooks/useSetImageRefresh';
import Image from 'next/image';
import Link from 'next/link';

export type PublicSetCardProps = {
  setNumber: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number | null;
  themeLabel?: string | null;
  className?: string;
  onClick?: () => void;
};

export function PublicSetCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeLabel,
  className,
  onClick,
}: PublicSetCardProps) {
  const displayName = name && name.trim() ? name : setNumber;

  // Build metadata parts array (matches SetDisplayCard order)
  const metadataParts: string[] = [setNumber];
  if (typeof year === 'number' && Number.isFinite(year) && year > 0) {
    metadataParts.push(String(year));
  }
  if (
    typeof numParts === 'number' &&
    Number.isFinite(numParts) &&
    numParts > 0
  ) {
    metadataParts.push(`${numParts} parts`);
  }

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
            <div className="mb-1 w-full truncate text-xs font-bold tracking-wide text-theme-text uppercase">
              {themeLabel}
            </div>
          )}
          <div className="line-clamp-2 w-full leading-tight font-bold text-foreground">
            {displayName}
          </div>
          <div className="mt-1 w-full text-2xs font-semibold text-foreground-muted">
            {metadataParts.join(' • ')}
          </div>
        </div>
      </div>
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
    </div>
  );
}
