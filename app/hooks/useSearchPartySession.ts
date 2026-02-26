'use client';

import { useMemo, useRef, useState } from 'react';
import type { GroupParticipant } from '@/app/hooks/useGroupParticipants';
import { useGroupClientId } from '@/app/hooks/useGroupClientId';
import { useGroupParticipants } from '@/app/hooks/useGroupParticipants';
import { useOrigin } from '@/app/hooks/useOrigin';
import { useSearchPartyAutoRejoin } from '@/app/hooks/useSearchPartyAutoRejoin';
import { useSearchPartyLifecycle } from '@/app/hooks/useSearchPartyLifecycle';
import { useSearchPartyStats } from '@/app/hooks/useSearchPartyStats';
import { useSupabaseUser } from '@/app/hooks/useSupabaseUser';
import {
  useOpenTabsStore,
  isSpTabId,
  type SetTab,
} from '@/app/store/open-tabs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GroupSessionDerived = {
  id: string;
  slug: string;
  setNumber: string;
} | null;

export type SearchPartyProp = {
  active: boolean;
  loading: boolean;
  canHost: boolean;
  isHost: boolean;
  joinUrl: string | null;
  participants: GroupParticipant[];
  totalPiecesFound: number;
  currentParticipantId: string | null;
  slug: string | null;
  onStart: (colorSlot?: number) => Promise<void> | void;
  onEnd: () => Promise<void> | void;
  onContinue: (slug: string, colorSlot?: number) => Promise<void> | void;
  onRemoveParticipant: (participantId: string) => void;
};

export type UseSearchPartySessionResult = {
  // State (derived from tab + participants)
  groupSession: GroupSessionDerived;
  currentParticipant: GroupParticipant | null;
  participants: GroupParticipant[];
  totalPiecesFound: number;
  piecesFoundRef: React.RefObject<number>;
  isSearchTogetherLoading: boolean;
  searchPartyError: string | null;
  sessionEndedModalOpen: boolean;

  // For InventoryProvider
  handleParticipantPiecesDelta: (id: string | null, delta: number) => void;
  handleParticipantJoined: (participant: {
    id: string;
    displayName: string;
  }) => void;
  handleParticipantLeft: (participantId: string) => void;
  handleSessionEnded: () => void;
  broadcastSessionEndedRef: React.MutableRefObject<() => void>;
  broadcastParticipantRemovedRef: React.MutableRefObject<(id: string) => void>;

  // For SetTopBar
  searchPartyProp: SearchPartyProp;

  // For modal
  handleSessionEndedDismiss: () => void;
  clearSearchPartyError: () => void;
  showUpgradeModal: boolean;
  clearUpgradeModal: () => void;

  // Flags
  isJoiner: boolean;
  isSpTab: boolean;

  // Identifiers for InventoryProvider
  groupClientId: string | null;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSearchPartySession(
  tab: SetTab,
  isActive: boolean
): UseSearchPartySessionResult {
  const clientId = useGroupClientId();
  const origin = useOrigin();
  const { user } = useSupabaseUser();
  const openTab = useOpenTabsStore(state => state.openTab);
  const clearGroupSession = useOpenTabsStore(state => state.clearGroupSession);
  const replaceTabWithLanding = useOpenTabsStore(
    state => state.replaceTabWithLanding
  );

  // ---------------------------------------------------------------------------
  // Derived session state from tab (single source of truth)
  // ---------------------------------------------------------------------------
  const groupSession = useMemo<GroupSessionDerived>(() => {
    if (tab.groupSessionId && tab.groupSessionSlug) {
      return {
        id: tab.groupSessionId,
        slug: tab.groupSessionSlug,
        setNumber: tab.setNumber,
      };
    }
    return null;
  }, [tab.groupSessionId, tab.groupSessionSlug, tab.setNumber]);

  const isJoiner = tab.groupRole === 'joiner';
  const isSpTab = isSpTabId(tab.id);

  // Refs for broadcast functions (set after InventoryProvider mounts)
  const broadcastSessionEndedRef = useRef<() => void>(() => {});
  const broadcastParticipantRemovedRef = useRef<(id: string) => void>(() => {});

  // ---------------------------------------------------------------------------
  // Participant roster
  // ---------------------------------------------------------------------------

  // setParticipants ref breaks the circular dependency:
  // lifecycle → setParticipants → useGroupParticipants → lifecycle.handleSessionEnded
  const setParticipantsRef = useRef<
    React.Dispatch<React.SetStateAction<GroupParticipant[]>>
  >(() => {});

  const lifecycle = useSearchPartyLifecycle({
    tab,
    isActive,
    user,
    clientId,
    setParticipants: (...args) => setParticipantsRef.current(...args),
    openTab,
    clearGroupSession,
    replaceTabWithLanding,
    broadcastSessionEndedRef,
    broadcastParticipantRemovedRef,
  });

  const {
    participants,
    setParticipants,
    totalPiecesFound,
    piecesFoundRef,
    handleParticipantPiecesDelta,
    handleParticipantJoined,
    handleParticipantLeft,
  } = useGroupParticipants({
    sessionId: groupSession?.id ?? null,
    currentParticipantId: tab.groupParticipantId ?? null,
    onSessionEnded: lifecycle.handleSessionEnded,
  });

  // Keep the ref in sync after useGroupParticipants returns
  setParticipantsRef.current = setParticipants;

  // Derive currentParticipant from participants + tab identity
  const currentParticipant = useMemo<GroupParticipant | null>(() => {
    if (!tab.groupParticipantId) return null;
    return participants.find(p => p.id === tab.groupParticipantId) ?? null;
  }, [tab.groupParticipantId, participants]);

  // ---------------------------------------------------------------------------
  // Auto-rejoin
  // ---------------------------------------------------------------------------
  const [autoRejoinModalOpen, setAutoRejoinModalOpen] = useState(false);

  useSearchPartyAutoRejoin({
    tab,
    user,
    clientId,
    hasActiveSession: !!groupSession,
    setParticipants,
    openTab,
    onSessionNotFound: () => {
      if (isSpTab) {
        replaceTabWithLanding(tab.id);
      } else {
        setAutoRejoinModalOpen(true);
      }
    },
  });

  // Combine session-ended modals from lifecycle and auto-rejoin
  const sessionEndedModalOpen =
    lifecycle.sessionEndedModalOpen || autoRejoinModalOpen;
  const handleSessionEndedDismiss = () => {
    lifecycle.handleSessionEndedDismiss();
    setAutoRejoinModalOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Stats side effects
  // ---------------------------------------------------------------------------
  useSearchPartyStats({
    tab,
    isActive,
    isJoiner,
    sessionSlug: groupSession?.slug ?? null,
    currentParticipant,
    participants,
  });

  // ---------------------------------------------------------------------------
  // Join URL
  // ---------------------------------------------------------------------------
  const joinUrl = useMemo(() => {
    if (!groupSession || !groupSession.slug) return null;
    if (!origin) return `/group/${groupSession.slug}`;
    return `${origin}/group/${groupSession.slug}`;
  }, [groupSession, origin]);

  // ---------------------------------------------------------------------------
  // SearchPartyProp for SetTopBar
  // ---------------------------------------------------------------------------
  const searchPartyProp = useMemo<SearchPartyProp>(
    () => ({
      active: !!groupSession,
      loading: lifecycle.isSearchTogetherLoading || !clientId,
      canHost: !!user && !!clientId,
      isHost: tab.groupRole === 'host',
      joinUrl,
      participants,
      totalPiecesFound,
      currentParticipantId: tab.groupParticipantId ?? null,
      slug: groupSession?.slug ?? null,
      onStart: lifecycle.handleStartSearchTogether,
      onEnd: lifecycle.handleEndSearchTogether,
      onContinue: lifecycle.handleContinueSession,
      onRemoveParticipant: lifecycle.handleRemoveParticipant,
    }),
    [
      groupSession,
      lifecycle.isSearchTogetherLoading,
      clientId,
      user,
      tab.groupRole,
      tab.groupParticipantId,
      joinUrl,
      participants,
      totalPiecesFound,
      lifecycle.handleStartSearchTogether,
      lifecycle.handleEndSearchTogether,
      lifecycle.handleContinueSession,
      lifecycle.handleRemoveParticipant,
    ]
  );

  return {
    groupSession,
    currentParticipant,
    participants,
    totalPiecesFound,
    piecesFoundRef,
    isSearchTogetherLoading: lifecycle.isSearchTogetherLoading,
    searchPartyError: lifecycle.searchPartyError,
    sessionEndedModalOpen,
    showUpgradeModal: lifecycle.showUpgradeModal,
    clearUpgradeModal: lifecycle.clearUpgradeModal,
    handleParticipantPiecesDelta,
    handleParticipantJoined,
    handleParticipantLeft,
    handleSessionEnded: lifecycle.handleSessionEnded,
    broadcastSessionEndedRef,
    broadcastParticipantRemovedRef,
    searchPartyProp,
    handleSessionEndedDismiss,
    clearSearchPartyError: lifecycle.clearSearchPartyError,
    isJoiner,
    isSpTab,
    groupClientId: clientId,
  };
}
