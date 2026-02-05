'use client';

import { cardVariants } from '@/app/components/ui/Card';
import { ImagePlaceholder } from '@/app/components/ui/ImagePlaceholder';
import { cn } from '@/app/components/ui/utils';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

export type PublicSetCardProps = {
  setNumber: string;
  name: string;
  year: number | null;
  imageUrl: string | null;
  numParts: number | null;
  themeLabel?: string | null;
  className?: string;
};

export function PublicSetCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  themeLabel,
  className,
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

  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(
    imageUrl ?? null
  );
  const [hasTriedRefresh, setHasTriedRefresh] = useState(false);

  const handleImageError = async () => {
    if (hasTriedRefresh) {
      setResolvedImageUrl(null);
      return;
    }
    setHasTriedRefresh(true);
    try {
      const res = await fetch(
        `/api/sets/${encodeURIComponent(setNumber)}/refresh-image`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        }
      );
      if (!res.ok) {
        if (process.env.NODE_ENV !== 'production') {
          console.error('PublicSetCard: refresh-image request failed', {
            status: res.status,
          });
        }
        setResolvedImageUrl(null);
        return;
      }
      const data = (await res.json()) as { imageUrl?: string | null };
      if (
        typeof data.imageUrl === 'string' &&
        data.imageUrl.trim().length > 0
      ) {
        setResolvedImageUrl(data.imageUrl.trim());
      } else {
        setResolvedImageUrl(null);
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('PublicSetCard: refresh-image request errored', err);
      }
      setResolvedImageUrl(null);
    }
  };

  return (
    <div
      className={cn(
        'group relative',
        cardVariants({
          variant: 'theme',
          elevated: true,
          interactive: true,
          padding: 'none',
        }),
        className
      )}
    >
      <Link
        href={`/sets/${encodeURIComponent(setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          {/* Image area with gradient background matching SetDisplayCard */}
          <div className="relative w-full">
            <div className="relative mx-auto w-full max-w-full p-2">
              {resolvedImageUrl ? (
                <div className="relative aspect-square w-full overflow-hidden rounded-md bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900">
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
          </div>

          {/* Content area matching SetDisplayCard typography */}
          <div className="flex items-start gap-2 px-2 py-3 sm:px-3">
            <div className="min-w-0 flex-1">
              {themeLabel && (
                <div className="mb-1 w-full truncate text-xs font-bold tracking-wide text-theme-text uppercase">
                  {themeLabel}
                </div>
              )}
              <div className="line-clamp-2 w-full truncate overflow-hidden text-base leading-tight font-bold text-foreground">
                {displayName}
              </div>
              <div className="mt-1.5 w-full text-sm font-semibold text-foreground-muted">
                {metadataParts.join(' • ')}
              </div>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
