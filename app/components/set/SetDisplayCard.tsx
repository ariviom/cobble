'use client';

import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// Wrapper component to catch Image loading errors
function SafeImage({
  src,
  alt,
  width,
  height,
  className,
  onError,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  onError?: () => void;
}) {
  useEffect(() => {
    // Preload image to detect errors before Next.js Image tries to load it
    const img = new window.Image();
    img.onerror = () => {
      onError?.();
    };
    img.src = src;
  }, [src, onError]);

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      unoptimized
    />
  );
}

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
  onRemove?: () => void;
  className?: string;
};

export function SetDisplayCard({
  setNumber,
  name,
  year,
  imageUrl,
  numParts,
  quantity,
  themeLabel,
  themeId,
  className,
}: SetDisplayCardProps) {
  const [useFallback, setUseFallback] = useState(false);

  // Infer metadata display: prefer numParts, fallback to quantity.
  const metadataParts: string[] = [setNumber, String(year)];
  if (typeof numParts === 'number' && Number.isFinite(numParts)) {
    metadataParts.push(`${numParts} parts`);
  } else if (typeof quantity === 'number' && Number.isFinite(quantity)) {
    metadataParts.push(`${quantity} pieces`);
  }

  const ownership = useSetOwnershipState({
    setNumber,
    name,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-subtle bg-card ${className ?? ''}`}
    >
      <Link
        href={`/sets/${encodeURIComponent(setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-card-muted">
            <div className="relative mx-auto w-full max-w-full bg-card p-2">
              {imageUrl ? (
                <div className="aspect-square h-full w-full overflow-hidden rounded-lg">
                  {useFallback ? (
                    // Fallback to regular img tag if Next.js Image fails
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <SafeImage
                      src={imageUrl}
                      alt=""
                      width={512}
                      height={512}
                      className="h-full w-full object-cover"
                      onError={() => setUseFallback(true)}
                    />
                  )}
                </div>
              ) : (
                <div className="text-xs text-foreground-muted">No Image</div>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2 px-3 py-3">
            <div className="min-w-0 flex-1">
              {themeLabel && (
                <div className="w-full text-sm font-medium text-foreground-muted">
                  {themeLabel}
                </div>
              )}
              <div className="line-clamp-1 w-full overflow-hidden font-medium">
                {name}
              </div>
              <div className="mt-1 w-full text-xs text-foreground-muted">
                {metadataParts.join(' | ')}
              </div>
            </div>
          </div>
        </div>
      </Link>
      <SetOwnershipAndCollectionsRow ownership={ownership} />
    </div>
  );
}
