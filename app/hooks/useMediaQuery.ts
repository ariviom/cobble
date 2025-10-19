'use client';

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    setMatches(mql.matches);
    mql.addEventListener?.('change', onChange);
    // Fallback for Safari <14
    // @ts-expect-error older API
    mql.addListener?.(onChange);
    return () => {
      mql.removeEventListener?.('change', onChange);
      // @ts-expect-error older API
      mql.removeListener?.(onChange);
    };
  }, [query]);

  return matches;
}

export function useIsDesktop(): boolean {
  // Tailwind lg breakpoint ~ 1024px
  return useMediaQuery('(min-width: 1024px)');
}
