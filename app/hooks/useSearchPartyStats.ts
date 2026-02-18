'use client';

import { useEffect } from 'react';
import type { GroupParticipant } from '@/app/hooks/useGroupParticipants';
import { useSyncRecentSet } from '@/app/hooks/useSyncRecentSet';
import { updateStoredGroupSessionStats } from '@/app/store/group-sessions';
import type { SetTab } from '@/app/store/open-tabs';
import { addRecentSet } from '@/app/store/recent-sets';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSearchPartyStatsArgs = {
  tab: SetTab;
  isActive: boolean;
  isJoiner: boolean;
  sessionSlug: string | null;
  currentParticipant: GroupParticipant | null;
  participants: GroupParticipant[];
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Side-effect hook for:
 * - Adding to recent sets when the tab becomes active
 * - Snapshotting SP stats into localStorage whenever participants change
 */
export function useSearchPartyStats({
  tab,
  isActive,
  isJoiner,
  sessionSlug,
  currentParticipant,
  participants,
}: UseSearchPartyStatsArgs): void {
  const syncRecentSet = useSyncRecentSet();

  // Add to recent sets when tab becomes active (skip for SP joiners)
  useEffect(() => {
    if (isActive && !isJoiner) {
      addRecentSet({
        setNumber: tab.setNumber,
        name: tab.name,
        year: tab.year,
        imageUrl: tab.imageUrl,
        numParts: tab.numParts,
        themeId: tab.themeId ?? null,
        themeName: tab.themeName ?? null,
      });
      syncRecentSet(tab.setNumber);
    }
  }, [
    isActive,
    isJoiner,
    tab.setNumber,
    tab.name,
    tab.year,
    tab.imageUrl,
    tab.numParts,
    tab.themeId,
    tab.themeName,
    syncRecentSet,
  ]);

  // Snapshot SP stats into stored session whenever participants change
  useEffect(() => {
    if (!sessionSlug || !currentParticipant) return;
    const sorted = [...participants].sort(
      (a, b) => b.piecesFound - a.piecesFound
    );
    const position = sorted.findIndex(p => p.id === currentParticipant.id) + 1;
    updateStoredGroupSessionStats(sessionSlug, {
      piecesFound: currentParticipant.piecesFound,
      participantCount: participants.length,
      leaderboardPosition: position || 1,
    });
  }, [sessionSlug, currentParticipant, participants]);
}
