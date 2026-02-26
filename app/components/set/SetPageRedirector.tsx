'use client';

import { UpgradeModal } from '@/app/components/upgrade-modal';
import { useGatedOpenTab } from '@/app/hooks/useGatedOpenTab';
import { useSyncRecentSet } from '@/app/hooks/useSyncRecentSet';
import { addRecentSet } from '@/app/store/recent-sets';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { SetPageSkeleton } from '@/app/components/set/SetPageSkeleton';

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
  const { openTab, showUpgradeModal, dismissUpgradeModal, gateFeature } =
    useGatedOpenTab();
  const syncRecentSet = useSyncRecentSet();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Prevent double redirect in strict mode
    if (hasRedirected.current) return;
    hasRedirected.current = true;

    // Add to open tabs (may be blocked by tab limit)
    const allowed = openTab({
      type: 'set',
      id: setNumber,
      setNumber,
      name: setName,
      imageUrl,
      numParts,
      year,
      themeId,
      themeName,
    });

    // Add to recent sets regardless of tab limit
    addRecentSet({
      setNumber,
      name: setName,
      year,
      imageUrl,
      numParts,
      themeId,
      themeName,
    });
    syncRecentSet(setNumber);

    if (allowed) {
      // Redirect to SPA container
      router.replace(`/sets?active=${encodeURIComponent(setNumber)}`);
    }
    // If !allowed, don't redirect — the UpgradeModal will show.
    // The handleUpgradeDismiss callback redirects after the user dismisses it.
  }, [
    setNumber,
    setName,
    year,
    imageUrl,
    numParts,
    themeId,
    themeName,
    openTab,
    syncRecentSet,
    router,
  ]);

  const handleUpgradeDismiss = useCallback(() => {
    dismissUpgradeModal();
    router.replace('/sets');
  }, [dismissUpgradeModal, router]);

  // Show skeleton layout while redirecting to prevent layout shift
  return (
    <>
      <SetPageSkeleton />
      <UpgradeModal
        open={showUpgradeModal}
        feature={gateFeature}
        onClose={handleUpgradeDismiss}
      />
    </>
  );
}
