'use client';

import { getSupabaseBrowserClient } from '@/app/lib/supabaseClient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type GroupParticipant = {
  id: string;
  displayName: string;
  piecesFound: number;
  lastSeenAt: string;
  colorSlot: number | null;
};

type UseGroupParticipantsArgs = {
  sessionId: string | null;
  currentParticipantId: string | null;
  /** Called when the roster poll detects the session is no longer active. */
  onSessionEnded?: () => void;
};

type UseGroupParticipantsResult = {
  participants: GroupParticipant[];
  setParticipants: React.Dispatch<React.SetStateAction<GroupParticipant[]>>;
  totalPiecesFound: number;
  /** Ref that tracks current participant's pieces_found for heartbeat persistence. */
  piecesFoundRef: React.RefObject<number>;
  handleParticipantPiecesDelta: (
    participantId: string | null,
    delta: number
  ) => void;
  /** Optimistically add a participant from a broadcast (dedup by id). */
  handleParticipantJoined: (participant: {
    id: string;
    displayName: string;
    colorSlot?: number | null;
  }) => void;
  /** Optimistically remove a participant by ID (e.g. from a broadcast). */
  handleParticipantLeft: (participantId: string) => void;
};

/** Polling interval for roster refresh (ms). */
const ROSTER_POLL_INTERVAL = 60_000;

/**
 * Shared hook for participant roster tracking used by both host (SetTabContainer)
 * and joiner (GroupSessionPageClient).
 *
 * Features:
 * - In-memory participant state with piecesFound
 * - Merge-based roster polling (never overwrites in-memory counts with stale DB values)
 * - postgres_changes subscription filtered to INSERT/DELETE only
 * - piecesFoundRef for heartbeat persistence
 * - Session-ended detection via is_active check during polling
 */
export function useGroupParticipants({
  sessionId,
  currentParticipantId,
  onSessionEnded,
}: UseGroupParticipantsArgs): UseGroupParticipantsResult {
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const piecesFoundRef = useRef<number>(0);

  // Keep onSessionEnded stable via ref
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  // Keep a ref to current participants for merge logic
  const participantsRef = useRef(participants);
  participantsRef.current = participants;

  // Ref for currentParticipantId so the subscription effect stays stable
  const currentParticipantIdRef = useRef(currentParticipantId);
  currentParticipantIdRef.current = currentParticipantId;

  const handleParticipantPiecesDelta = useCallback(
    (participantId: string | null, delta: number) => {
      if (!participantId || delta === 0) return;
      const now = new Date().toISOString();
      setParticipants(prev =>
        prev.map(p =>
          p.id === participantId
            ? {
                ...p,
                piecesFound: Math.max(0, (p.piecesFound ?? 0) + delta),
                lastSeenAt: now,
              }
            : p
        )
      );
      // Update the ref if this is our own participant
      if (participantId === currentParticipantId) {
        piecesFoundRef.current = Math.max(0, piecesFoundRef.current + delta);
      }
    },
    [currentParticipantId]
  );

  // Load & subscribe to participant roster
  useEffect(() => {
    if (!sessionId) {
      // Session ended or cleared — reset roster
      setParticipants([]);
      piecesFoundRef.current = 0;
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseBrowserClient();

    const mergeRoster = (
      rows: Array<{
        id: string;
        display_name: string;
        pieces_found: number | null;
        last_seen_at: string | null;
        color_slot: number | null;
      }>
    ) => {
      if (cancelled) return;
      const current = participantsRef.current;
      const byId = new Map(current.map(p => [p.id, p]));

      const merged = rows.map(row => {
        const existing = byId.get(row.id);
        // Use actual heartbeat timestamp from DB; fall back to existing
        // in-memory value or current time for new participants.
        const dbLastSeen = row.last_seen_at ?? new Date().toISOString();
        const lastSeenAt = existing
          ? existing.lastSeenAt > dbLastSeen
            ? existing.lastSeenAt
            : dbLastSeen
          : dbLastSeen;
        return {
          id: row.id,
          displayName: row.display_name,
          // Use higher of in-memory vs DB value (DB updated only on heartbeat)
          piecesFound: existing
            ? Math.max(existing.piecesFound, row.pieces_found ?? 0)
            : (row.pieces_found ?? 0),
          lastSeenAt,
          colorSlot: row.color_slot ?? existing?.colorSlot ?? null,
        };
      });

      // Ensure the current participant is never dropped from the list
      // (guards against RLS/timing issues where the DB query misses them)
      const currentPid = currentParticipantIdRef.current;
      if (currentPid && !merged.some(p => p.id === currentPid)) {
        const self = byId.get(currentPid);
        if (self) {
          merged.push(self);
        }
      }

      setParticipants(merged);
    };

    const loadRoster = async () => {
      const [participantsResult, sessionResult] = await Promise.all([
        supabase
          .from('group_session_participants')
          .select('id, display_name, pieces_found, last_seen_at, color_slot')
          .eq('session_id', sessionId)
          .is('left_at', null),
        supabase
          .from('group_sessions')
          .select('is_active')
          .eq('id', sessionId)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (!participantsResult.error && Array.isArray(participantsResult.data)) {
        mergeRoster(participantsResult.data);
      }

      // Session ended: either explicitly marked inactive, or invisible to
      // this user (RLS hides ended sessions from non-host participants).
      // Only act when the query succeeded — transient errors skip the check
      // and the next poll will retry.
      if (
        !sessionResult.error &&
        (!sessionResult.data || sessionResult.data.is_active === false)
      ) {
        onSessionEndedRef.current?.();
      }
    };

    void loadRoster();

    // Subscribe to INSERT + DELETE only — excludes heartbeat UPDATEs which
    // caused N^2 query amplification (every participant's 60s heartbeat
    // triggered loadRoster on all N subscribers). Polling handles convergence
    // for soft-deletes (left_at) and re-joins.
    const channel = supabase.channel(`group_participants_roster:${sessionId}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => void loadRoster()
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'group_session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        () => void loadRoster()
      );

    try {
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') {
          // Catch-up: close the gap between initial load and subscription
          // activation where joins could be missed.
          void loadRoster();
        }
      });
    } catch {
      /* best-effort */
    }

    const interval = window.setInterval(
      () => void loadRoster(),
      ROSTER_POLL_INTERVAL
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      void channel.unsubscribe();
    };
  }, [sessionId]);

  const handleParticipantJoined = useCallback(
    (participant: {
      id: string;
      displayName: string;
      colorSlot?: number | null;
    }) => {
      setParticipants(prev => {
        // Dedup: if already in roster, don't add again (mergeRoster will converge)
        if (prev.some(p => p.id === participant.id)) return prev;
        return [
          ...prev,
          {
            id: participant.id,
            displayName: participant.displayName,
            piecesFound: 0,
            lastSeenAt: new Date().toISOString(),
            colorSlot: participant.colorSlot ?? null,
          },
        ];
      });
    },
    []
  );

  const handleParticipantLeft = useCallback((participantId: string) => {
    setParticipants(prev => prev.filter(p => p.id !== participantId));
  }, []);

  const totalPiecesFound = useMemo(
    () => participants.reduce((sum, p) => sum + (p.piecesFound ?? 0), 0),
    [participants]
  );

  return {
    participants,
    setParticipants,
    totalPiecesFound,
    piecesFoundRef,
    handleParticipantPiecesDelta,
    handleParticipantJoined,
    handleParticipantLeft,
  };
}
