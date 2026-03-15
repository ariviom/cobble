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
  const { openTab, showUpgradeModal, dismissUpgradeModal, gateFeature } =
    useGatedOpenTab();
  const syncRecentSet = useSyncRecentSet();

  const openSet = useCallback(
    (params: OpenSetParams) => {
      const { setNumber, name, year, imageUrl, numParts, themeId, themeName } =
        params;

      const allowed = openTab({
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

      if (allowed) {
        router.push(`/sets?active=${encodeURIComponent(setNumber)}`);
      }
    },
    [openTab, syncRecentSet, router]
  );

  return { openSet, showUpgradeModal, dismissUpgradeModal, gateFeature };
}
