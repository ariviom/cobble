'use client';

import { useGatedOpenTab } from '@/app/hooks/useGatedOpenTab';
import { useSyncRecentSet } from '@/app/hooks/useSyncRecentSet';
import { addRecentSet } from '@/app/store/recent-sets';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type OpenSetParams = {
  setNumber: string;
  name: string;
  year: number;
  imageUrl: string | null;
  numParts: number;
  themeId: number | null;
  themeName: string | null;
};

export function useOpenSet() {
  const router = useRouter();
  const syncRecentSet = useSyncRecentSet();
  const {
    openTab,
    showUpgradeModal,
    dismissUpgradeModal,
    continueFromUpgradeModal,
    gateFeature,
  } = useGatedOpenTab({
    // Fires when a tab is actually opened — either immediately on the
    // happy path, or later when the user clicks Continue in the upgrade
    // modal after freeing up slots.
    onOpened: tab => {
      router.push(`/sets?active=${encodeURIComponent(tab.id)}`);
    },
  });

  const openSet = useCallback(
    (params: OpenSetParams) => {
      const { setNumber, name, year, imageUrl, numParts, themeId, themeName } =
        params;

      openTab({
        type: 'set',
        id: setNumber,
        setNumber,
        name,
        imageUrl,
        numParts,
        year,
        themeId,
        themeName,
      });

      addRecentSet({
        setNumber,
        name,
        year,
        imageUrl,
        numParts,
        themeId,
        themeName,
      });
      syncRecentSet(setNumber);
    },
    [openTab, syncRecentSet]
  );

  return {
    openSet,
    showUpgradeModal,
    dismissUpgradeModal,
    continueFromUpgradeModal,
    gateFeature,
  };
}
