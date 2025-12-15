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
  const metadataParts: string[] = [setNumber];
  if (year) {
    metadataParts.push(String(year));
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
        `/api/sets/id/${encodeURIComponent(setNumber)}/refresh-image`,
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
  if (
    typeof numParts === 'number' &&
    Number.isFinite(numParts) &&
    numParts > 0
  ) {
    metadataParts.push(`${numParts} parts`);
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-subtle bg-card ${className ?? ''}`}
    >
      <Link
        href={`/sets/id/${encodeURIComponent(setNumber)}`}
        className="block w-full"
      >
        <div className="w-full">
          <div className="relative w-full bg-card-muted">
            <div className="relative mx-auto w-full max-w-full bg-card p-2">
              {resolvedImageUrl ? (
                <Image
                  src={resolvedImageUrl}
                  alt=""
                  width={512}
                  height={512}
                  className="aspect-square h-full w-full overflow-hidden rounded-lg object-cover"
                  onError={handleImageError}
                />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-foreground-muted">
                  No Image
                </div>
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
    </div>
  );
}
