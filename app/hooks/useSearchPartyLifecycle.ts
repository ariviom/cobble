'use client';

import { useCallback, useRef, useState } from 'react';
import type { GroupParticipant } from '@/app/hooks/useGroupParticipants';
import {
  storeGroupSession,
  clearStoredGroupSession,
} from '@/app/store/group-sessions';
import { isSpTabId, type SetTab } from '@/app/store/open-tabs';
import { logger } from '@/lib/metrics';
import type { User } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSearchPartyLifecycleArgs = {
  tab: SetTab;
  isActive: boolean;
  user: User | null;
  clientId: string | null;
  setParticipants: React.Dispatch<React.SetStateAction<GroupParticipant[]>>;
  openTab: (tab: SetTab) => void;
  clearGroupSession: (tabId: string) => void;
  replaceTabWithLanding: (tabId: string) => void;
  broadcastSessionEndedRef: React.MutableRefObject<() => void>;
  broadcastParticipantRemovedRef: React.MutableRefObject<(id: string) => void>;
};

export type UseSearchPartyLifecycleResult = {
  isSearchTogetherLoading: boolean;
  searchPartyError: string | null;
  clearSearchPartyError: () => void;
  sessionEndedModalOpen: boolean;
  handleSessionEnded: () => void;
  handleSessionEndedDismiss: () => void;
  handleStartSearchTogether: () => Promise<void>;
  handleEndSearchTogether: () => Promise<void>;
  handleContinueSession: (slug: string) => Promise<void>;
  handleRemoveParticipant: (participantId: string) => void;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSearchPartyLifecycle({
  tab,
  isActive,
  user,
  clientId,
  setParticipants,
  openTab,
  clearGroupSession,
  replaceTabWithLanding,
  broadcastSessionEndedRef,
  broadcastParticipantRemovedRef,
}: UseSearchPartyLifecycleArgs): UseSearchPartyLifecycleResult {
  const [isSearchTogetherLoading, setIsSearchTogetherLoading] = useState(false);
  const [searchPartyError, setSearchPartyError] = useState<string | null>(null);
  const [sessionEndedModalOpen, setSessionEndedModalOpen] = useState(false);

  const isSpTab = isSpTabId(tab.id);

  // Track isActive in a ref so handleSessionEnded can read it without re-creating
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const handleSessionEnded = useCallback(() => {
    const slug = tab.groupSessionSlug;
    if (slug) clearStoredGroupSession(slug);

    if (isSpTab) {
      // SP tabs are joiner-only. Show the modal first so the participant
      // knows why their session disappeared; replaceTabWithLanding is
      // deferred to handleSessionEndedDismiss.
      setSessionEndedModalOpen(true);
    } else {
      clearGroupSession(tab.id);
      setSessionEndedModalOpen(true);
    }
  }, [clearGroupSession, tab.id, tab.groupSessionSlug, isSpTab]);

  const handleSessionEndedDismiss = useCallback(() => {
    setSessionEndedModalOpen(false);
    if (isSpTab) {
      // Navigate away after the participant acknowledges the modal.
      replaceTabWithLanding(tab.id);
    }
  }, [isSpTab, replaceTabWithLanding, tab.id]);

  const handleStartSearchTogether = useCallback(
    async (colorSlot?: number) => {
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return;
      }
      if (!clientId || isSearchTogetherLoading) return;

      try {
        setIsSearchTogetherLoading(true);

        const res = await fetch('/api/group-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ setNumber: tab.setNumber }),
        });

        const data = (await res.json()) as {
          session?: {
            id: string;
            slug: string;
            setNumber: string;
            isActive: boolean;
          };
          error?: string;
          message?: string;
          limit?: number;
        };

        if (!res.ok || !data.session) {
          if (res.status === 429 && data.error === 'quota_exceeded') {
            setSearchPartyError(
              data.message ||
                `You've reached your limit of ${data.limit || 2} Search Party sessions this month.`
            );
          } else {
            setSearchPartyError(
              'Failed to start Search Party. Please try again.'
            );
          }
          return;
        }

        const displayName =
          (user.user_metadata &&
            ((user.user_metadata.full_name as string | undefined) ||
              (user.user_metadata.name as string | undefined))) ||
          user.email ||
          'You';

        const joinRes = await fetch(
          `/api/group-sessions/${encodeURIComponent(data.session.slug)}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayName,
              clientToken: clientId,
              ...(colorSlot != null ? { colorSlot } : {}),
            }),
          }
        );

        const joinData = (await joinRes.json()) as {
          participant?: {
            id: string;
            displayName: string;
            piecesFound: number;
            colorSlot?: number | null;
          };
        };

        if (joinRes.ok && joinData.participant) {
          const hostParticipant: GroupParticipant = {
            id: joinData.participant.id,
            displayName: joinData.participant.displayName,
            piecesFound: joinData.participant.piecesFound ?? 0,
            lastSeenAt: new Date().toISOString(),
            colorSlot: joinData.participant.colorSlot ?? null,
          };

          setParticipants([hostParticipant]);

          openTab({
            ...tab,
            groupSessionId: data.session.id,
            groupSessionSlug: data.session.slug,
            groupParticipantId: joinData.participant.id,
            groupRole: 'host',
          });

          storeGroupSession({
            sessionId: data.session.id,
            slug: data.session.slug,
            setNumber: tab.setNumber,
            setName: tab.name,
            imageUrl: tab.imageUrl,
            numParts: tab.numParts,
            year: tab.year,
            themeId: tab.themeId ?? null,
            participantId: joinData.participant.id,
            role: 'host',
            joinedAt: Date.now(),
          });
        }
      } catch (err) {
        logger.warn('[SearchParty] Failed to start session', {
          error: err instanceof Error ? err.message : String(err),
        });
        setSearchPartyError('Failed to start Search Party. Please try again.');
      } finally {
        setIsSearchTogetherLoading(false);
      }
    },
    [user, clientId, isSearchTogetherLoading, tab, setParticipants, openTab]
  );

  const handleEndSearchTogether = useCallback(async () => {
    if (!tab.groupSessionSlug || !user) return;

    broadcastSessionEndedRef.current();
    clearStoredGroupSession(tab.groupSessionSlug);

    try {
      const res = await fetch(
        `/api/group-sessions/${encodeURIComponent(tab.groupSessionSlug)}/end`,
        { method: 'POST', credentials: 'same-origin' }
      );

      if (res.ok) {
        setParticipants([]);
        clearGroupSession(tab.id);
      }
    } catch (err) {
      logger.warn('[SearchParty] Failed to end session', {
        error: err instanceof Error ? err.message : String(err),
      });
      setSearchPartyError('Failed to end Search Party. Please try again.');
    }
  }, [
    tab.groupSessionSlug,
    tab.id,
    user,
    setParticipants,
    clearGroupSession,
    broadcastSessionEndedRef,
  ]);

  const handleContinueSession = useCallback(
    async (slug: string, colorSlot?: number) => {
      if (!user) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return;
      }
      if (!clientId || isSearchTogetherLoading) return;

      try {
        setIsSearchTogetherLoading(true);

        const reactivateRes = await fetch(
          `/api/group-sessions/${encodeURIComponent(slug)}/reactivate`,
          { method: 'POST', credentials: 'same-origin' }
        );

        const reactivateData = (await reactivateRes.json()) as {
          session?: {
            id: string;
            slug: string;
            setNumber: string;
            isActive: boolean;
          };
          error?: string;
        };

        if (!reactivateRes.ok || !reactivateData.session) {
          setSearchPartyError('Failed to continue session. Please try again.');
          return;
        }

        const displayName =
          (user.user_metadata &&
            ((user.user_metadata.full_name as string | undefined) ||
              (user.user_metadata.name as string | undefined))) ||
          user.email ||
          'You';

        const joinRes = await fetch(
          `/api/group-sessions/${encodeURIComponent(reactivateData.session.slug)}/join`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              displayName,
              clientToken: clientId,
              ...(colorSlot != null ? { colorSlot } : {}),
            }),
          }
        );

        const joinData = (await joinRes.json()) as {
          participant?: {
            id: string;
            displayName: string;
            piecesFound: number;
            colorSlot?: number | null;
          };
        };

        if (joinRes.ok && joinData.participant) {
          const hostParticipant: GroupParticipant = {
            id: joinData.participant.id,
            displayName: joinData.participant.displayName,
            piecesFound: joinData.participant.piecesFound ?? 0,
            lastSeenAt: new Date().toISOString(),
            colorSlot: joinData.participant.colorSlot ?? null,
          };

          setParticipants([hostParticipant]);

          openTab({
            ...tab,
            groupSessionId: reactivateData.session.id,
            groupSessionSlug: reactivateData.session.slug,
            groupParticipantId: joinData.participant.id,
            groupRole: 'host',
          });

          storeGroupSession({
            sessionId: reactivateData.session.id,
            slug: reactivateData.session.slug,
            setNumber: tab.setNumber,
            setName: tab.name,
            imageUrl: tab.imageUrl,
            numParts: tab.numParts,
            year: tab.year,
            themeId: tab.themeId ?? null,
            participantId: joinData.participant.id,
            role: 'host',
            joinedAt: Date.now(),
          });
        }
      } catch {
        setSearchPartyError('Failed to continue session. Please try again.');
      } finally {
        setIsSearchTogetherLoading(false);
      }
    },
    [user, clientId, isSearchTogetherLoading, tab, setParticipants, openTab]
  );

  const handleRemoveParticipant = useCallback(
    (participantId: string) => {
      const slug = tab.groupSessionSlug;
      if (!slug) return;
      setParticipants(prev => prev.filter(p => p.id !== participantId));
      void (async () => {
        try {
          const res = await fetch(
            `/api/group-sessions/${encodeURIComponent(slug)}/participants/${encodeURIComponent(participantId)}`,
            { method: 'DELETE', credentials: 'same-origin' }
          );
          if (res.ok) {
            broadcastParticipantRemovedRef.current(participantId);
          } else {
            setSearchPartyError('Failed to remove participant.');
          }
        } catch {
          // Network error — roster poll will restore
        }
      })();
    },
    [tab.groupSessionSlug, setParticipants, broadcastParticipantRemovedRef]
  );

  const clearSearchPartyError = useCallback(
    () => setSearchPartyError(null),
    []
  );

  return {
    isSearchTogetherLoading,
    searchPartyError,
    clearSearchPartyError,
    sessionEndedModalOpen,
    handleSessionEnded,
    handleSessionEndedDismiss,
    handleStartSearchTogether,
    handleEndSearchTogether,
    handleContinueSession,
    handleRemoveParticipant,
  };
}
