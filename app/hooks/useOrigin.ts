'use client';

import { useEffect, useState } from 'react';

/**
 * SSR-safe hook to get window.location.origin.
 *
 * Returns empty string during SSR and on initial client render,
 * then updates to the actual origin after hydration.
 *
 * @example
 * const origin = useOrigin();
 * const shareUrl = origin ? `${origin}/share/${id}` : `/share/${id}`;
 */
export function useOrigin(): string {
  const [origin, setOrigin] = useState('');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  return origin;
}
