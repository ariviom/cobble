'use client';

import { useEffect, useState } from 'react';

/**
 * Hook to detect if we're on desktop (lg breakpoint: 1024px+).
 * Returns `undefined` during SSR/initial render, then the actual value.
 */
export function useIsDesktop(): boolean | undefined {
  const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');

    const handleChange = () => {
      setIsDesktop(mql.matches);
    };

    // Set initial value
    handleChange();

    // Listen for changes
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}
