'use client';

import { MinifigCard } from '@/app/components/minifig/MinifigCard';

type PublicMinifigCardProps = {
  figNum: string;
  name: string;
  numParts?: number | null;
  status?: 'owned' | 'want' | null;
  imageUrl?: string | null;
  blId?: string | null;
};

/**
 * Public-facing wrapper around the shared MinifigCard. The visual treatment is
 * identical to the private card; public lists simply omit quantity and any
 * ownership controls, but still link through to the minifig detail page.
 */
export function PublicMinifigCard({
  figNum,
  name,
  numParts,
  imageUrl,
  blId,
}: PublicMinifigCardProps) {
  return (
    <MinifigCard
      figNum={figNum}
      name={name}
      imageUrl={imageUrl ?? null}
      blId={blId ?? null}
      numParts={numParts ?? null}
    />
  );
}


