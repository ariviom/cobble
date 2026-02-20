'use client';

import { useEffect, useRef } from 'react';
import type { GroupParticipant } from '@/app/hooks/useGroupParticipants';
import {
  clearStoredGroupSession,
  getStoredGroupSessionBySetNumber,
} from '@/app/store/group-sessions';
import type { SetTab } from '@/app/store/open-tabs';
import { logger } from '@/lib/metrics';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSearchPartyAutoRejoinArgs = {
  tab: SetTab;
  user: User | null;
  clientId: string | null;
  /** Whether a session is already active on this tab. */
  hasActiveSession: boolean;
  setParticipants: React.Dispatch<React.SetStateAction<GroupParticipant[]>>;
  openTab: (tab: SetTab) => void;
  /** Called when the stored session is no longer available. */
  onSessionNotFound: () => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Auto-rejoin: if no active SP on this tab but a stored association exists
 * in localStorage, attempt to rejoin the session.
 */
export function useSearchPartyAutoRejoin({
  tab,
  user,
  clientId,
  hasActiveSession,
  setParticipants,
  openTab,
  onSessionNotFound,
}: UseSearchPartyAutoRejoinArgs): void {
  const autoRejoinAttemptedRef = useRef(false);

  useEffect(() => {
    if (hasActiveSession || !clientId || autoRejoinAttemptedRef.current) return;
    autoRejoinAttemptedRef.current = true;

    const stored = getStoredGroupSessionBySetNumber(tab.setNumber);
    if (!stored) return;

    let displayName = 'Returning player';
    try {
      const saved = window.localStorage.getItem(
        `brick_party_group_session_name_${stored.slug}`
      );
      if (saved) displayName = saved;
    } catch {
      // ignore
    }

    if (stored.role === 'host' && user) {
      const profileName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email;
      if (profileName) displayName = profileName;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/group-sessions/${encodeURIComponent(stored.slug)}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName, clientToken: clientId }),
          }
        );

        const data = (await res.json()) as {
          session?: { id: string; setNumber: string };
          participant?: {
            id: string;
            displayName: string;
            piecesFound: number;
            colorSlot?: number | null;
          };
          error?: string;
        };

        if (!res.ok || !data.participant || !data.session) {
          clearStoredGroupSession(stored.slug);
          onSessionNotFound();
          return;
        }

        setParticipants([
          {
            id: data.participant.id,
            displayName: data.participant.displayName,
            piecesFound: data.participant.piecesFound ?? 0,
            lastSeenAt: new Date().toISOString(),
            colorSlot: data.participant.colorSlot ?? null,
          },
        ]);

        openTab({
          ...tab,
          groupSessionId: data.session.id,
          groupSessionSlug: stored.slug,
          groupParticipantId: data.participant.id,
          groupRole: stored.role,
        });
      } catch (err) {
        logger.warn('[SearchParty] Auto-rejoin failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, hasActiveSession, tab.setNumber]);
}
