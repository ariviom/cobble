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
    if (
      (
        mql as MediaQueryList & {
          addListener?: (l: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener
    ) {
      (
        mql as MediaQueryList & {
          addListener: (l: (e: MediaQueryListEvent) => void) => void;
        }
      ).addListener(onChange);
    }
    return () => {
      mql.removeEventListener?.('change', onChange);
      if (
        (
          mql as MediaQueryList & {
            removeListener?: (l: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener
      ) {
        (
          mql as MediaQueryList & {
            removeListener: (l: (e: MediaQueryListEvent) => void) => void;
          }
        ).removeListener(onChange);
      }
    };
  }, [query]);

  return matches;
}

export function useIsDesktop(): boolean {
  // Tailwind lg breakpoint ~ 1024px
  return useMediaQuery('(min-width: 1024px)');
}
