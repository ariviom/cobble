'use client';

import { useState } from 'react';

/**
 * Manages set/minifig card image URLs with a single retry via the refresh-image
 * endpoint. Returns the current URL and an onError handler for `<Image>`.
 */
export function useSetImageRefresh(
  setNumber: string,
  initialUrl: string | null
) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    initialUrl ?? null
  );
  const [hasTriedRefresh, setHasTriedRefresh] = useState(false);

  const onError = async () => {
    if (hasTriedRefresh) {
      setResolvedUrl(null);
      return;
    }
    setHasTriedRefresh(true);
    try {
      const res = await fetch(
        `/api/sets/${encodeURIComponent(setNumber)}/refresh-image`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        }
      );
      if (!res.ok) {
        setResolvedUrl(null);
        return;
      }
      const data = (await res.json()) as { imageUrl?: string | null };
      if (
        typeof data.imageUrl === 'string' &&
        data.imageUrl.trim().length > 0
      ) {
        setResolvedUrl(data.imageUrl.trim());
      } else {
        setResolvedUrl(null);
      }
    } catch {
      setResolvedUrl(null);
    }
  };

  return { resolvedUrl, onError };
}
