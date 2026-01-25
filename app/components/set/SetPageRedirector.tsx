'use client';

import { useOpenTabsStore } from '@/app/store/open-tabs';
import { addRecentSet } from '@/app/store/recent-sets';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { BrickLoader } from '@/app/components/ui/BrickLoader';

type SetPageRedirectorProps = {
  setNumber: string;
  setName: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
};

/**
 * Client component that adds a set to open tabs and redirects to the SPA container.
 *
 * This handles direct URL access (e.g., /sets/75192-1) by:
 * 1. Adding the set to the open tabs store
 * 2. Adding it to recent sets
 * 3. Redirecting to /sets?active={setNumber}
 */
export function SetPageRedirector({
  setNumber,
  setName,
  year,
  imageUrl,
  numParts,
  themeId,
  themeName,
}: SetPageRedirectorProps) {
  const router = useRouter();
  const openTab = useOpenTabsStore(state => state.openTab);
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Prevent double redirect in strict mode
    if (hasRedirected.current) return;
    hasRedirected.current = true;

    // Add to open tabs
    openTab({
      setNumber,
      name: setName,
      imageUrl,
      numParts,
      year,
    });

    // Add to recent sets
    addRecentSet({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
      themeId,
      themeName,
    });

    // Redirect to SPA container
    router.replace(`/sets?active=${encodeURIComponent(setNumber)}`);
  }, [
    setNumber,
    setName,
    year,
    imageUrl,
    numParts,
    themeId,
    themeName,
    openTab,
    router,
  ]);

  // Show loading while redirecting
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <BrickLoader />
    </div>
  );
}
