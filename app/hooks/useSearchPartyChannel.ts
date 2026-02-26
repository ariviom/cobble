'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGroupSessionChannel } from '@/app/hooks/useGroupSessionChannel';
import type { OwnedOverride } from '@/app/components/set/InventoryProvider';
import type { SearchPartyContextValue } from '@/app/components/set/SearchPartyProvider';
import {
  storeJoinerOwnedState,
  getJoinerOwnedState,
  clearJoinerOwnedState,
} from '@/app/store/group-sessions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UseSearchPartyChannelArgs = {
  // Session identity
  groupSessionId: string | null;
  groupParticipantId: string | null;
  groupParticipantDisplayName: string | null;
  groupParticipantColorSlot: number | null;
  groupClientId: string | null;
  setNumber: string;
  // Flags
  enableCloudSync: boolean;
  isJoiner: boolean;
  // Callbacks from useSearchPartySession
  piecesFoundRef: React.RefObject<number>;
  onParticipantPiecesDelta: (
    participantId: string | null,
    delta: number
  ) => void;
  onParticipantJoined: (participant: {
    id: string;
    displayName: string;
    colorSlot?: number | null;
  }) => void;
  onParticipantLeft: (participantId: string) => void;
  onSessionEnded: () => void;
  // Refs for broadcast functions (owned by useSearchPartySession)
  broadcastSessionEndedRef: React.MutableRefObject<() => void>;
  broadcastParticipantRemovedRef: React.MutableRefObject<(id: string) => void>;
};

type UseSearchPartyChannelResult = {
  context: SearchPartyContextValue | null;
  inventoryProps: {
    ownedOverride: OwnedOverride | undefined;
    onAfterOwnedChange:
      | ((key: string, newValue: number, prevValue: number) => void)
      | undefined;
    ownedByKeyRef: React.MutableRefObject<Record<string, number>>;
    applyOwnedRef: React.MutableRefObject<(key: string, value: number) => void>;
  };
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSearchPartyChannel(
  args: UseSearchPartyChannelArgs
): UseSearchPartyChannelResult {
  const {
    groupSessionId,
    groupParticipantId,
    groupParticipantDisplayName,
    groupParticipantColorSlot,
    groupClientId,
    setNumber,
    enableCloudSync,
    isJoiner,
    piecesFoundRef,
    onParticipantPiecesDelta,
    onParticipantJoined,
    onParticipantLeft,
    onSessionEnded,
    broadcastSessionEndedRef,
    broadcastParticipantRemovedRef,
  } = args;

  const isInGroupSession =
    Boolean(groupSessionId) &&
    Boolean(groupParticipantId) &&
    Boolean(groupClientId);

  // -------------------------------------------------------------------------
  // Joiner owned state (seeded from localStorage for refresh resilience)
  // -------------------------------------------------------------------------
  const [joinerOwned, setJoinerOwned] = useState<Record<string, number>>(() => {
    if (!isJoiner || !groupSessionId) return {};
    return getJoinerOwnedState(groupSessionId) ?? {};
  });

  const setOwnedOne = useCallback(
    (key: string, value: number) =>
      setJoinerOwned(prev => ({ ...prev, [key]: value })),
    []
  );
  const setBatch = useCallback(
    (updates: Record<string, number>) =>
      setJoinerOwned(prev => ({ ...prev, ...updates })),
    []
  );
  const clearAll = useCallback(() => setJoinerOwned({}), []);

  const ownedOverride = useMemo<OwnedOverride | undefined>(() => {
    if (!isJoiner) return undefined;
    return {
      ownedByKey: joinerOwned,
      setOwned: setOwnedOne,
      setBatch,
      clearAll,
    };
  }, [isJoiner, joinerOwned, setOwnedOne, setBatch, clearAll]);

  // -------------------------------------------------------------------------
  // Refs for communicating with InventoryProvider
  // -------------------------------------------------------------------------
  const ownedByKeyRef = useRef<Record<string, number>>({});
  const applyOwnedRef = useRef<(key: string, value: number) => void>(() => {});

  // -------------------------------------------------------------------------
  // Snapshot handshake
  // -------------------------------------------------------------------------
  const broadcastOwnedSnapshotRef = useRef<
    (owned: Record<string, number>) => void
  >(() => {});
  const requestSnapshotRef = useRef<() => void>(() => {});
  const broadcastParticipantJoinedRef = useRef<
    (participant: {
      id: string;
      displayName: string;
      colorSlot?: number | null;
    }) => void
  >(() => {});

  const snapshotReceivedRef = useRef(false);
  const snapshotRetryRef = useRef<NodeJS.Timeout | null>(null);

  const handleSnapshotRequested = useCallback(() => {
    if (!enableCloudSync || !isInGroupSession) return;
    broadcastOwnedSnapshotRef.current(ownedByKeyRef.current);
  }, [enableCloudSync, isInGroupSession]);

  // Use a ref for colorSlot so handleReconnected stays stable
  const groupParticipantColorSlotRef = useRef(groupParticipantColorSlot);
  groupParticipantColorSlotRef.current = groupParticipantColorSlot;

  const handleReconnected = useCallback(() => {
    // Broadcast our presence on (re)connect — deduplication happens in the roster
    if (groupParticipantId && groupParticipantDisplayName) {
      broadcastParticipantJoinedRef.current({
        id: groupParticipantId,
        displayName: groupParticipantDisplayName,
        colorSlot: groupParticipantColorSlotRef.current,
      });
    }

    if (enableCloudSync) {
      // Host: proactively broadcast snapshot on reconnect
      broadcastOwnedSnapshotRef.current(ownedByKeyRef.current);
    } else {
      // Joiner: ask host for current state
      snapshotReceivedRef.current = false;
      if (snapshotRetryRef.current) clearTimeout(snapshotRetryRef.current);
      requestSnapshotRef.current();

      // Retry once after 5s if no snapshot received
      snapshotRetryRef.current = setTimeout(() => {
        if (!snapshotReceivedRef.current) {
          requestSnapshotRef.current();
        }
        snapshotRetryRef.current = null;
      }, 5_000);
    }
  }, [enableCloudSync, groupParticipantId, groupParticipantDisplayName]);

  // Persist joiner owned state to localStorage on tab hide (not every keystroke)
  const joinerOwnedRef = useRef(joinerOwned);
  joinerOwnedRef.current = joinerOwned;

  useEffect(() => {
    if (!isJoiner || !groupSessionId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        storeJoinerOwnedState(groupSessionId, joinerOwnedRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Persist on cleanup (tab switch / unmount) as well
      storeJoinerOwnedState(groupSessionId, joinerOwnedRef.current);
    };
  }, [isJoiner, groupSessionId]);

  // Keep a ref to the ownedOverride for use in channel callbacks
  const ownedOverrideRef = useRef(ownedOverride);
  ownedOverrideRef.current = ownedOverride;

  // -------------------------------------------------------------------------
  // Channel
  // -------------------------------------------------------------------------
  const {
    broadcastPieceDelta,
    broadcastOwnedSnapshot,
    requestSnapshot,
    broadcastSessionEnded,
    broadcastParticipantRemoved,
    broadcastParticipantJoined,
    connectionState,
    hasConnectedOnce,
    sessionEnded,
  } = useGroupSessionChannel({
    enabled: isInGroupSession,
    sessionId: groupSessionId ?? null,
    setNumber,
    participantId: groupParticipantId ?? null,
    clientId: groupClientId ?? '',
    onRemoteDelta: payload => {
      applyOwnedRef.current(payload.key, payload.newOwned);
    },
    onRemoteSnapshot: snapshot => {
      if (!snapshot || typeof snapshot !== 'object') return;
      // Mark received so retry timer doesn't fire
      snapshotReceivedRef.current = true;
      if (snapshotRetryRef.current) {
        clearTimeout(snapshotRetryRef.current);
        snapshotRetryRef.current = null;
      }
      const override = ownedOverrideRef.current;
      if (override) {
        // Batch update: single state transition instead of O(n^2) spreads
        const updates: Record<string, number> = {};
        for (const [key, value] of Object.entries(snapshot)) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            updates[key] = value;
          }
        }
        override.setBatch(updates);
        // Persist authoritative host snapshot to localStorage, preserving joiner-local keys
        if (groupSessionId) {
          storeJoinerOwnedState(groupSessionId, {
            ...joinerOwnedRef.current,
            ...updates,
          });
        }
      } else {
        for (const [key, value] of Object.entries(snapshot)) {
          if (typeof value !== 'number' || !Number.isFinite(value)) continue;
          applyOwnedRef.current(key, value);
        }
      }
    },
    onParticipantPiecesDelta,
    onParticipantJoined,
    onParticipantLeft,
    onSnapshotRequested: handleSnapshotRequested,
    onReconnected: handleReconnected,
    piecesFoundRef,
    onSessionEnded,
  });

  // Keep refs in sync after hook returns
  broadcastOwnedSnapshotRef.current = broadcastOwnedSnapshot;
  requestSnapshotRef.current = requestSnapshot;
  broadcastParticipantJoinedRef.current = broadcastParticipantJoined;
  broadcastSessionEndedRef.current = broadcastSessionEnded;
  broadcastParticipantRemovedRef.current = broadcastParticipantRemoved;

  // Clean up snapshot retry timer and joiner localStorage when session ends
  const prevSessionIdRef = useRef(groupSessionId);
  useEffect(() => {
    if (!isInGroupSession && snapshotRetryRef.current) {
      clearTimeout(snapshotRetryRef.current);
      snapshotRetryRef.current = null;
    }
    // Clear joiner localStorage cache when session ends
    if (!isInGroupSession && prevSessionIdRef.current) {
      clearJoinerOwnedState(prevSessionIdRef.current);
    }
    prevSessionIdRef.current = groupSessionId;
  }, [isInGroupSession, groupSessionId]);

  useEffect(
    () => () => {
      if (snapshotRetryRef.current) {
        clearTimeout(snapshotRetryRef.current);
        snapshotRetryRef.current = null;
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // onAfterOwnedChange — broadcasts delta to channel
  // -------------------------------------------------------------------------
  const broadcastPieceDeltaRef = useRef(broadcastPieceDelta);
  broadcastPieceDeltaRef.current = broadcastPieceDelta;

  const onAfterOwnedChange = useCallback(
    (key: string, newValue: number, prevValue: number) => {
      broadcastPieceDeltaRef.current({
        key,
        delta: newValue - prevValue,
        newOwned: newValue,
      });
    },
    []
  );

  // -------------------------------------------------------------------------
  // Context value (memoized to avoid unnecessary re-renders)
  // -------------------------------------------------------------------------
  const contextValue = useMemo<SearchPartyContextValue | null>(() => {
    if (!isInGroupSession) return null;
    return {
      isInGroupSession: true,
      connectionState,
      hasConnectedOnce,
      sessionEnded,
    };
  }, [isInGroupSession, connectionState, hasConnectedOnce, sessionEnded]);

  return {
    context: contextValue,
    inventoryProps: {
      ownedOverride,
      onAfterOwnedChange: isInGroupSession ? onAfterOwnedChange : undefined,
      ownedByKeyRef,
      applyOwnedRef,
    },
  };
}
