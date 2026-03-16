'use client';

import { SetCardBody } from '@/app/components/set/SetCardBody';
import { cardVariants } from '@/app/components/ui/Card';
import { cn } from '@/app/components/ui/utils';
import { useSetImageRefresh } from '@/app/hooks/useSetImageRefresh';
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
    <SetCardBody
      imageUrl={resolvedImageUrl}
      onImageError={handleImageError}
      displayName={displayName}
      metadataText={metadataParts.join(' \u2022 ')}
      themeLabel={themeLabel}
      truncateTheme
    />
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
