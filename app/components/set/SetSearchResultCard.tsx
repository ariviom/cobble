'use client';

import { SetOwnershipAndCollectionsRow } from '@/app/components/set/SetOwnershipAndCollectionsRow';
import { SetDisplayCard, type SetDisplayCardProps } from '@/app/components/set/SetDisplayCard';
import { useSetOwnershipState } from '@/app/hooks/useSetOwnershipState';

/**
 * Composite card used specifically for search and Identify results.
 * It composes the presentational SetDisplayCard with ownership/list controls,
 * so other contexts (like collection overviews) can render the bare card.
 */
export function SetSearchResultCard(props: SetDisplayCardProps) {
  const { setNumber, name, imageUrl, year, numParts, themeId } = props;
  const safeName = name && name.trim() ? name : setNumber;

  const ownership = useSetOwnershipState({
    setNumber,
    name: safeName,
    imageUrl,
    ...(typeof year === 'number' ? { year } : {}),
    ...(typeof numParts === 'number' ? { numParts } : {}),
    ...(typeof themeId === 'number' ? { themeId } : {}),
  });

  return (
    <SetDisplayCard {...props}>
      <SetOwnershipAndCollectionsRow ownership={ownership} />
    </SetDisplayCard>
  );
}



